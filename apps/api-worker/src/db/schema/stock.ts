/**
 * Drizzle schema: stock (composite PK)
 * Tồn kho materialized từ stock_movements.
 *
 * Lưu ý: composite primary key (branch_id, warehouse_id, location_id, product_id, batch_no, serial_no)
 * nên phải dùng primaryKey() của composite.
 */

import { pgTable, uuid, text, numeric, integer, timestamp, index, primaryKey } from "drizzle-orm/pg-core";

export const stock = pgTable(
  "stock",
  {
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    locationId: uuid("location_id").notNull(),
    productId: uuid("product_id").notNull(),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("0"),
    reservedQty: numeric("reserved_qty", { precision: 18, scale: 4 }).notNull().default("0"),
    avgCost: numeric("avg_cost", { precision: 18, scale: 4 }).notNull().default("0"),
    lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.branchId, t.warehouseId, t.locationId, t.productId, t.batchNo, t.serialNo],
    }),
    tenantIdx: index("stock_tenant_idx").on(t.tenantId),
    productIdx: index("stock_product_idx").on(t.productId),
    warehouseProductIdx: index("stock_warehouse_product_idx").on(t.warehouseId, t.productId),
  })
);

export type Stock = typeof stock.$inferSelect;
export type NewStock = typeof stock.$inferInsert;
