/**
 * Drizzle schema: purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines
 */

import {
  pgTable, uuid, text, integer, numeric, date, timestamp, index,
} from "drizzle-orm/pg-core";

// =============================================================================
// Purchase Orders (đơn đặt hàng)
// =============================================================================
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    poNumber: text("po_number").notNull(),
    partyId: uuid("party_id").notNull(), // NCC
    bidContractId: uuid("bid_contract_id"), // FK to bid_contracts
    bidLotId: uuid("bid_lot_id"), // FK to bid_lots
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    notes: text("notes"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | APPROVED | ORDERED | PARTIAL_RECEIVED | RECEIVED | CANCELLED
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("purchase_orders_tenant_idx").on(t.tenantId),
    numberIdx: index("purchase_orders_number_idx").on(t.tenantId, t.poNumber),
    contractIdx: index("purchase_orders_contract_idx").on(t.bidContractId),
  })
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id").notNull(),
    productId: uuid("product_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 18, scale: 4 }).notNull().default("0"),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull(),
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    poIdx: index("purchase_order_lines_po_idx").on(t.poId),
  })
);

// =============================================================================
// Goods Receipts (phiếu nhập kho)
// =============================================================================
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    grnNumber: text("grn_number").notNull(),
    poId: uuid("po_id"), // optional - có thể nhập không qua PO
    partyId: uuid("party_id").notNull(),
    bidContractId: uuid("bid_contract_id"),
    bidLotId: uuid("bid_lot_id"),
    warehouseId: uuid("warehouse_id").notNull(), // phải là RECEIVING type
    receiptDate: date("receipt_date").notNull(),
    supplierInvoiceNo: text("supplier_invoice_no"),
    notes: text("notes"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | POSTED | CANCELLED
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),
    createdBy: uuid("created_by"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("goods_receipts_tenant_idx").on(t.tenantId),
    numberIdx: index("goods_receipts_number_idx").on(t.tenantId, t.grnNumber),
    poIdx: index("goods_receipts_po_idx").on(t.poId),
  })
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnId: uuid("grn_id").notNull(),
    poLineId: uuid("po_line_id"), // optional - reference to PO line
    productId: uuid("product_id").notNull(),
    locationId: uuid("location_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    batchNo: text("batch_no").notNull().default(""),
    serialNo: text("serial_no").notNull().default(""),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
    expiryDate: text("expiry_date"),
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull(),
    lineNo: integer("line_no").notNull().default(0),
  },
  (t) => ({
    grnIdx: index("goods_receipt_lines_grn_idx").on(t.grnId),
  })
);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type NewPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type NewGoodsReceipt = typeof goodsReceipts.$inferInsert;
export type GoodsReceiptLine = typeof goodsReceiptLines.$inferSelect;
export type NewGoodsReceiptLine = typeof goodsReceiptLines.$inferInsert;
