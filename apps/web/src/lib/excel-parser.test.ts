// =============================================================================
// Tests for extractSkuFromName + mapUnitCode + sha256Hex
// Phase 6c: stock snapshot import
// =============================================================================
import { describe, it, expect } from "vitest";
import {
  extractSkuFromName,
  mapUnitCode,
  sha256Hex,
  normalizeHeader,
  STOCK_FIELD_MAP,
  applyFieldMapping,
  coerceRowValues,
} from "./excel-parser";

describe("extractSkuFromName", () => {
  it("extracts VTYT code from product name with Mã:", () => {
    const name = "Bông viên Fi 20mm M5, Fi 30mm M3, KVT (500 gam/gói) (Danameco, VN) (Mã: VTYT.000003965, Hàm lượng: )";
    expect(extractSkuFromName(name)).toBe("VTYT.000003965");
  });

  it("extracts with MA: (no diacritic)", () => {
    const name = "Test product (MA: THUOC.123)";
    expect(extractSkuFromName(name)).toBe("THUOC.123");
  });

  it("handles extra whitespace", () => {
    const name = "Item (Mã:    VTYT.000004009   , x)";
    expect(extractSkuFromName(name)).toBe("VTYT.000004009");
  });

  it("handles lowercase ma:", () => {
    const name = "Item (mã: drug-abc-123)";
    expect(extractSkuFromName(name)).toBe("drug-abc-123");
  });

  it("returns null when no Mã: pattern", () => {
    expect(extractSkuFromName("Some random product")).toBeNull();
  });

  it("returns null for empty / non-string", () => {
    expect(extractSkuFromName("")).toBeNull();
    expect(extractSkuFromName(null as any)).toBeNull();
    expect(extractSkuFromName(undefined as any)).toBeNull();
  });

  it("falls back to generic [A-Z]{2,}[-_.][0-9]+ pattern", () => {
    const name = "Product code ABC-123 something";
    expect(extractSkuFromName(name)).toBe("ABC-123");
  });
});

describe("mapUnitCode", () => {
  it.each([
    ["Cái", "PCS"],
    ["cái", "PCS"],
    ["cai", "PCS"],
    ["Gram", "GRAM"],
    ["g", "GRAM"],
    ["Lọ", "BOTTLE"],
    ["lo", "BOTTLE"],
    ["chai", "BOTTLE"],
    ["Ống", "TUBE"],
    ["ong", "TUBE"],
    ["Lít", "LITER"],
    ["lit", "LITER"],
    ["ml", "ML"],
    ["Hộp", "BOX"],
    ["hop", "BOX"],
    ["Miếng", "PIECE"],
    ["mieng", "PIECE"],
    ["Đôi", "PAIR"],
    ["doi", "PAIR"],
    ["Túi", "BAG"],
    ["tui", "BAG"],
    ["Sợi", "UNIT"],
    ["soi", "UNIT"],
    ["Cây", "UNIT"],
    ["cay", "UNIT"],
    ["Gói", "PACK"],
    ["goi", "PACK"],
    ["Viên", "TABLET"],
    ["vien", "TABLET"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapUnitCode(input)).toBe(expected);
  });

  it("returns UNIT for unknown", () => {
    expect(mapUnitCode("xyz")).toBe("UNIT");
  });

  it("returns UNIT for empty / non-string", () => {
    expect(mapUnitCode("")).toBe("UNIT");
    expect(mapUnitCode(null as any)).toBe("UNIT");
  });

  it("trims whitespace", () => {
    expect(mapUnitCode("  Cái  ")).toBe("PCS");
  });
});

describe("sha256Hex", () => {
  it("produces 64-char hex", async () => {
    const hex = await sha256Hex("test");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("world");
    expect(a).not.toBe(b);
  });

  it("matches known SHA-256 of 'test'", async () => {
    const hex = await sha256Hex("test");
    // echo -n "test" | sha256sum
    expect(hex).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });
});

describe("STOCK_FIELD_MAP + applyFieldMapping + coerceRowValues", () => {
  it("maps Vietnamese headers to internal fields", () => {
    const rows = [
      {
        "STT": 1,
        "Tên thuốc, hóa chất, VTYT": "Bông viên (Mã: VTYT.000003965)",
        "ĐVT": "Gram",
        "Số lô": "L001",
        "Nhà cung cấp": "Danameco",
        "Đơn giá": 116,
        "Số lượng tồn": 3500,
      },
    ];
    const mapped = applyFieldMapping(rows, {}, STOCK_FIELD_MAP);
    const coerced = coerceRowValues(mapped[0]);
    expect(coerced).toBeDefined();
    expect(coerced.productName).toBe("Bông viên (Mã: VTYT.000003965)");
    expect(coerced.unitCode).toBe("Gram");
    expect(coerced.batchNo).toBe("L001");
    expect(coerced.supplierName).toBe("Danameco");
    expect(coerced.unitCost).toBe(116);
    expect(coerced.quantity).toBe(3500);
  });

  it("normalizes header (lowercase, no diacritics)", () => {
    expect(normalizeHeader("Số lượng tồn")).toBe("so_luong_ton");
    expect(normalizeHeader("Đơn vị tính")).toBe("don_vi_tinh");
  });

  it("STOCK_FIELD_MAP contains critical keys", () => {
    expect(STOCK_FIELD_MAP["so_luong_ton"]).toBe("quantity");
    expect(STOCK_FIELD_MAP["don_gia"]).toBe("unitCost");
    expect(STOCK_FIELD_MAP["so_lo"]).toBe("batchNo");
    expect(STOCK_FIELD_MAP["dvt"]).toBe("unitCode");
    expect(STOCK_FIELD_MAP["nha_cung_cap"]).toBe("supplierName");
    expect(STOCK_FIELD_MAP["ten_thuoc"]).toBe("productName");
  });
});
