/**
 * Drizzle schema barrel export
 *
 * Thêm file mới cho mỗi module: products.ts, warehouses.ts, stock.ts, ...
 * Mỗi file export table + types. RLS tự động enforce qua tenant_id.
 */

export * from "./schema/products";
export * from "./schema/categories";
export * from "./schema/units";
export * from "./schema/branches";
export * from "./schema/warehouses";
export * from "./schema/locations";
