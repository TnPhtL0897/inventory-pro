/**
 * Drizzle schema: stock_movements (partitioned by created_at)
 *
 * Append-only event log. Composite PK (id, created_at) để partition theo tháng.
 */

import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").notNull().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    locationId: uuid("location_id").notNull(),
    productId: uuid("product_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    movementType: text("movement_type").notNull(), // IN/OUT/TRANSFER_IN/TRANSFER_OUT/ADJUST_IN/ADJUST_OUT/RETURN_IN/RETURN_OUT
    status: text("status").notNull(), // POSTED/CANCELLED
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 4 }),
    refType: text("ref_type").notNull(), // GRN/ISSUE/TRANSFER/STOCK_TAKE/ADJUST/MANUAL
    refId: uuid("ref_id"),
    refLineId: uuid("ref_line_id"),
    notes: text("notes"),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    expiryDate: timestamp("expiry_date", { mode: "date" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdBy: uuid("created_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => ({
    tenantProductIdx: index("stock_movements_tenant_product_idx").on(t.tenantId, t.productId),
    refIdx: index("stock_movements_ref_idx").on(t.refType, t.refId),
    idempotencyIdx: index("stock_movements_idempotency_idx").on(t.idempotencyKey),
  })
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
