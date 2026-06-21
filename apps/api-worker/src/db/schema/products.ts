/**
 * Drizzle schema: products table
 *
 * Snake_case (DB) → camelCase (TS) mapping qua Drizzle column names.
 * RLS policies enforce tenant_id filtering (defense in depth).
 */

import { pgTable, uuid, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id"),
    baseUnitId: uuid("base_unit_id").notNull(),
    productType: text("product_type").notNull().default("GOODS"),
    costPrice: numeric("cost_price", { precision: 18, scale: 2 }).notNull().default("0"),
    sellPrice: numeric("sell_price", { precision: 18, scale: 2 }).notNull().default("0"),
    minStock: numeric("min_stock", { precision: 18, scale: 3 }).notNull().default("0"),
    maxStock: numeric("max_stock", { precision: 18, scale: 3 }),
    isBatchTracked: boolean("is_batch_tracked").notNull().default(false),
    isSerialTracked: boolean("is_serial_tracked").notNull().default(false),
    isExpiryTracked: boolean("is_expiry_tracked").notNull().default(false),
    status: text("status").notNull().default("ACTIVE"),
    imageUrl: text("image_url"),
    // Khoa XN extensions (Module 1)
    productGroup: text("product_group"), // HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE
    productSubtype: text("product_subtype"),
    openVialStabilityDays: numeric("open_vial_stability_days", { precision: 5, scale: 0 }),
    storageCondition: text("storage_condition"), // ROOM_TEMP | REFRIGERATED | FROZEN
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("products_tenant_idx").on(t.tenantId),
    skuTenantIdx: index("products_sku_tenant_idx").on(t.tenantId, t.sku),
    categoryIdx: index("products_category_idx").on(t.tenantId, t.categoryId),
  })
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
