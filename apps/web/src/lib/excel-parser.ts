// =============================================================================
// Excel parser (client-side, no server upload needed)
// Uses SheetJS (xlsx) — reads .xlsx/.xls/.csv from File object
// Returns rows as objects keyed by header row.
//
// Loaded dynamically from CDN (esm.sh) to avoid bundling a large dependency
// for the few users who need import.
// =============================================================================
// SheetJS loaded from CDN at runtime — no type imports to keep build clean.

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export interface ParseResult {
  sheets: ParsedSheet[];
  /** First sheet (most common case) */
  first: ParsedSheet;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _xlsxCache: any = null;

async function loadXLSX(): Promise<any> {
  if (_xlsxCache) return _xlsxCache;
  // Dynamic import from CDN — only fetched when user opens Import page.
  // Use Function() to hide the URL from bundler (which would try to resolve at build time).
  // @ts-ignore
  const dynImport = new Function("u", "return import(u)") as (u: string) => Promise<any>;
  const mod = await dynImport("https://esm.sh/xlsx@0.18.5");
  _xlsxCache = mod.default ?? mod;
  return _xlsxCache;
}

/**
 * Parse a File (xlsx/xls/csv) into one or more sheets.
 * Headers are inferred from the first row.
 */
export async function parseExcelFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });

  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (XLSX.utils as any).sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    return { sheetName: name, headers, rows: json };
  });

  return {
    sheets,
    first: sheets[0] ?? { sheetName: "(empty)", headers: [], rows: [] },
  };
}

/**
 * Normalize header strings: lowercase, trim, strip diacritics, replace spaces with _
 * Used to match user Excel columns to our expected fields.
 *
 * E.g. "Mã SP" → "ma_sp", "Đơn vị tính" → "don_vi_tinh"
 */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/đ/g, "d") // đ/Đ → d (Vietnamese)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Field mapping for product import. Maps a normalized Excel header to our
 * internal field name. Users can override on the UI.
 */
export const PRODUCT_FIELD_MAP: Record<string, string> = {
  sku: "sku",
  ma: "sku",
  ma_sp: "sku",
  code: "sku",
  name: "name",
  ten: "name",
  ten_san_pham: "name",
  product_name: "name",
  description: "description",
  mo_ta: "description",
  producttype: "productType",
  loai: "productType",
  loai_san_pham: "productType",
  baseunitcode: "baseUnitCode",
  donvitinh: "baseUnitCode",
  dvt: "baseUnitCode",
  don_vi_tinh: "baseUnitCode",
  unit: "baseUnitCode",
  categorycode: "categoryCode",
  nhom: "categoryCode",
  danh_muc: "categoryCode",
  category: "categoryCode",
  costprice: "costPrice",
  gia_nhap: "costPrice",
  gia_von: "costPrice",
  cost: "costPrice",
  sellprice: "sellPrice",
  giaban: "sellPrice",
  gia_ban: "sellPrice",
  price: "sellPrice",
  minstock: "minStock",
  ton_toi_thieu: "minStock",
  min: "minStock",
  maxstock: "maxStock",
  ton_toi_da: "maxStock",
  max: "maxStock",
  status: "status",
  trang_thai: "status",
  isbatchtracked: "isBatchTracked",
  quan_ly_lo: "isBatchTracked",
  batch: "isBatchTracked",
  isexpirytracked: "isExpiryTracked",
  quan_ly_han: "isExpiryTracked",
  expiry: "isExpiryTracked",
};

/**
 * Apply header mapping to rows, returning array of objects keyed by internal
 * field names. Unmapped columns are dropped.
 *
 * @param fieldMap - which field map to use. Defaults to PRODUCT_FIELD_MAP.
 *                    Pass STOCK_FIELD_MAP for stock-snapshot import.
 */
export function applyFieldMapping(
  rows: Array<Record<string, unknown>>,
  headerMap: Record<string, string>,
  fieldMap: Record<string, string> = PRODUCT_FIELD_MAP,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [rawHeader, value] of Object.entries(row)) {
      const norm = normalizeHeader(rawHeader);
      const internalField = headerMap[norm] ?? fieldMap[norm];
      if (internalField) out[internalField] = value;
    }
    return out;
  });
}

/**
 * Field mapping for stock-snapshot import (Báo cáo tồn kho).
 * Used by import-stock-snapshot edge function to map a normalized Excel
 * header to our internal field name.
 *
 * E.g. "Số lượng tồn" → "so_luong_ton" → "quantity"
 *      "Đơn giá"      → "don_gia"      → "unitCost"
 */
export const STOCK_FIELD_MAP: Record<string, string> = {
  ten: "productName",
  ten_thuoc: "productName",
  ten_thuoc_hoa_chat_vtyt: "productName",
  ten_hoa_chat: "productName",
  ten_vtyt: "productName",
  product_name: "productName",
  dvt: "unitCode",
  donvitinh: "unitCode",
  don_vi_tinh: "unitCode",
  unit: "unitCode",
  so_lo: "batchNo",
  lo: "batchNo",
  batch: "batchNo",
  nha_cung_cap: "supplierName",
  ncc: "supplierName",
  supplier: "supplierName",
  don_gia: "unitCost",
  dongia: "unitCost",
  gia: "unitCost",
  gia_nhap: "unitCost",
  cost: "unitCost",
  so_luong_ton: "quantity",
  ton: "quantity",
  sl: "quantity",
  quantity: "quantity",
  thanh_tien: "totalValue",
  thanhtien: "totalValue",
  total: "totalValue",
};

/**
 * Extract SKU (product code) từ Vietnamese product name.
 * Format: "... (Mã: VTYT.000003965, Hàm lượng: ...)"
 *
 * Supported patterns:
 *   - Mã: VTYT.000003965
 *   - MA: thuoc-abc-123
 *   - Generic: [A-Z]{2,}[-_./][0-9]+
 *
 * Returns null nếu không match.
 */
export function extractSkuFromName(name: string): string | null {
  if (!name || typeof name !== "string") return null;
  // Try "Mã: CODE" / "MA: CODE" first (most common in hospital reports)
  let m = name.match(/M[ãa]\s*:\s*([A-Z0-9][A-Z0-9.\-_]+)/i);
  if (m) return m[1];
  // Fallback: any [A-Z]{2,}[-_.][0-9]+ pattern
  m = name.match(/\b([A-Z]{2,}[-_.][A-Z0-9.\-_]+)\b/);
  return m ? m[1] : null;
}

/**
 * Map Vietnamese unit name (ĐVT) sang units_of_measure.code.
 * Trả về "UNIT" làm default nếu không nhận diện được.
 *
 * Supported (có dấu + không dấu):
 *   Cái/cai       → PCS
 *   Gram/g        → GRAM
 *   Lọ/lo, Chai   → BOTTLE
 *   Ống/ong       → TUBE
 *   Lít/lit       → LITER
 *   ml, ML        → ML
 *   Hộp/hop       → BOX
 *   Miếng/mieng   → PIECE
 *   Đôi/doi       → PAIR
 *   Túi/tui       → BAG
 *   Sợi/soi, Cây  → UNIT
 */
export function mapUnitCode(dvt: string): string {
  if (!dvt || typeof dvt !== "string") return "UNIT";
  const norm = dvt.toLowerCase().trim();
  const map: Record<string, string> = {
    "cái": "PCS",
    "cai": "PCS",
    "chiếc": "PCS",
    "chiec": "PCS",
    "c": "PCS",
    "gram": "GRAM",
    "g": "GRAM",
    "lọ": "BOTTLE",
    "lo": "BOTTLE",
    "chai": "BOTTLE",
    "ống": "TUBE",
    "ong": "TUBE",
    "lít": "LITER",
    "lit": "LITER",
    "l": "LITER",
    "ml": "ML",
    "hộp": "BOX",
    "hop": "BOX",
    "miếng": "PIECE",
    "mieng": "PIECE",
    "đôi": "PAIR",
    "doi": "PAIR",
    "túi": "BAG",
    "tui": "BAG",
    "sợi": "UNIT",
    "soi": "UNIT",
    "cây": "UNIT",
    "cay": "UNIT",
    "gói": "PACK",
    "goi": "PACK",
    "viên": "TABLET",
    "vien": "TABLET",
    "que": "STICK",
  };
  return map[norm] ?? "UNIT";
}

/**
 * SHA-256 hex digest of a string. Used to generate deterministic
 * idempotency keys for snapshot import. Returns 32-char hex (UUID-shaped).
 * Falls back to a simple hash in environments without Web Crypto.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: simple FNV-1a 32-bit (NOT cryptographic, but deterministic + unique enough)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(4);
}

/**
 * Coerce cell values to proper types for our import schema.
 * Excel cells come as strings/numbers/dates; we need to normalize.
 */
export function coerceRowValues(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined || v === "") {
      out[k] = null;
      continue;
    }
    if (typeof v === "string") {
      const trimmed = v.trim();
      // Boolean coercion
      if (/^(true|yes|có|1)$/i.test(trimmed)) { out[k] = true; continue; }
      if (/^(false|no|không|0)$/i.test(trimmed)) { out[k] = false; continue; }
      // Number coercion
      const num = Number(trimmed);
      if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(trimmed)) { out[k] = num; continue; }
      out[k] = trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}
