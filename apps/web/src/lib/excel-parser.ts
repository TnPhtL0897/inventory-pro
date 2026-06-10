// =============================================================================
// Excel parser (client-side, no server upload needed)
// Uses SheetJS (xlsx) — reads .xlsx/.xls/.csv from File object
// Returns rows as objects keyed by header row.
// =============================================================================
import * as XLSX from "xlsx";

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

/**
 * Parse a File (xlsx/xls/csv) into one or more sheets.
 * Headers are inferred from the first row.
 */
export async function parseExcelFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });

  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
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
 */
export function applyFieldMapping(
  rows: Array<Record<string, unknown>>,
  headerMap: Record<string, string>,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [rawHeader, value] of Object.entries(row)) {
      const norm = normalizeHeader(rawHeader);
      const internalField = headerMap[norm] ?? PRODUCT_FIELD_MAP[norm];
      if (internalField) out[internalField] = value;
    }
    return out;
  });
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
