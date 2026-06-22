/**
 * Drizzle schema: stock_issues, stock_transfers, stock_takes
 *
 * Các documents này tạo stock_movements khi POST.
 * Mỗi document có 1 header + N lines.
 */

import {
  pgTable, uuid, text, integer, numeric, boolean, timestamp, date, index, primaryKey,
} from "drizzle-orm/pg-core";

// =============================================================================
// Stock Issues (phiếu xuất kho)
// =============================================================================
export const stockIssues = pgTable(
  "stock_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    issueNumber: text("issue_number").notNull(),
    partyId: uuid("party_id"),
    warehouseId: uuid("warehouse_id").notNull(),
    purpose: text("purpose").notNull().default("INTERNAL_USE"), // SALE | INTERNAL_USE | SCRAP | SAMPLE | GIFT | TRANSFER_OUT | ADJUSTMENT
    issueDate: date("issue_date").notNull(),
    referenceNo: text("reference_no"),
    notes: text("notes"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | POSTED | CANCELLED
    createdBy: uuid("created_by"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("stock_issues_tenant_idx").on(t.tenantId),
    branchIdx: index("stock_issues_branch_idx").on(t.tenantId, t.branchId),
    numberIdx: index("stock_issues_number_idx").on(t.tenantId, t.issueNumber),
  })
);

export const stockIssueLines = pgTable(
  "stock_issue_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id").notNull(),
    productId: uuid("product_id").notNull(),
    locationId: uuid("location_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 4 }),
    notes: text("notes"),
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    issueIdx: index("stock_issue_lines_issue_idx").on(t.issueId),
  })
);

// =============================================================================
// Stock Transfers (phiếu chuyển kho nội bộ)
// =============================================================================
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    transferNumber: text("transfer_number").notNull(),
    fromBranchId: uuid("from_branch_id").notNull(),
    fromWarehouseId: uuid("from_warehouse_id").notNull(),
    toBranchId: uuid("to_branch_id").notNull(),
    toWarehouseId: uuid("to_warehouse_id").notNull(),
    transferDate: date("transfer_date").notNull(),
    expectedReceiptDate: date("expected_receipt_date"),
    notes: text("notes"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | IN_TRANSIT | RECEIVED | CANCELLED
    createdBy: uuid("created_by"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    receivedBy: uuid("received_by"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("stock_transfers_tenant_idx").on(t.tenantId),
    numberIdx: index("stock_transfers_number_idx").on(t.tenantId, t.transferNumber),
  })
);

export const stockTransferLines = pgTable(
  "stock_transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id").notNull(),
    productId: uuid("product_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    fromLocationId: uuid("from_location_id").notNull(),
    toLocationId: uuid("to_location_id").notNull(),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 4 }),
    lineStatus: text("line_status").notNull().default("OPEN"), // OPEN | IN_TRANSIT | RECEIVED | CANCELLED
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    transferIdx: index("stock_transfer_lines_transfer_idx").on(t.transferId),
  })
);

// =============================================================================
// Stock Takes (phiếu kiểm kê)
// =============================================================================
export const stockTakes = pgTable(
  "stock_takes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    stockTakeNumber: text("stock_take_number").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    stockTakeDate: date("stock_take_date").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | COUNTED | POSTED | CANCELLED
    countedBy: uuid("counted_by"),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("stock_takes_tenant_idx").on(t.tenantId),
    branchIdx: index("stock_takes_branch_idx").on(t.tenantId, t.branchId),
    numberIdx: index("stock_takes_number_idx").on(t.tenantId, t.stockTakeNumber),
  })
);

export const stockTakeLines = pgTable(
  "stock_take_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockTakeId: uuid("stock_take_id").notNull(),
    productId: uuid("product_id").notNull(),
    locationId: uuid("location_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    systemQty: numeric("system_qty", { precision: 18, scale: 4 }).notNull().default("0"),
    countedQty: numeric("counted_qty", { precision: 18, scale: 4 }),
    varianceQty: numeric("variance_qty", { precision: 18, scale: 4 }),
    lineStatus: text("line_status").notNull().default("PENDING"), // PENDING | COUNTED | ADJUSTED | SKIPPED | CANCELLED
    notes: text("notes"),
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    stockTakeIdx: index("stock_take_lines_take_idx").on(t.stockTakeId),
  })
);

export type StockIssue = typeof stockIssues.$inferSelect;
export type NewStockIssue = typeof stockIssues.$inferInsert;
export type StockIssueLine = typeof stockIssueLines.$inferSelect;
export type NewStockIssueLine = typeof stockIssueLines.$inferInsert;
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type NewStockTransfer = typeof stockTransfers.$inferInsert;
export type StockTransferLine = typeof stockTransferLines.$inferSelect;
export type NewStockTransferLine = typeof stockTransferLines.$inferInsert;
export type StockTake = typeof stockTakes.$inferSelect;
export type NewStockTake = typeof stockTakes.$inferInsert;
export type StockTakeLine = typeof stockTakeLines.$inferSelect;
export type NewStockTakeLine = typeof stockTakeLines.$inferInsert;
