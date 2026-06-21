/**
 * Drizzle schema: bidding (bid_plans, bid_packages, bid_lots, bid_contracts, purchase_requests)
 *
 * Workflow:
 * - bid_plan: KHĐT (kế hoạch đấu thầu)
 * - bid_package: gói thầu (thuộc plan)
 * - bid_lot: lô trong gói thầu (1 lô = 1 sản phẩm/danh mục)
 * - bid_contract: hợp đồng trúng thầu (sau khi đấu)
 * - purchase_request: dự trù mua hàng (tạo từ lô)
 */

import {
  pgTable, uuid, text, integer, numeric, date, timestamp, boolean, jsonb, index,
} from "drizzle-orm/pg-core";

// =============================================================================
// Bid Plans (kế hoạch đấu thầu)
// =============================================================================
export const bidPlans = pgTable("bid_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  planNumber: text("plan_number").notNull(),
  planName: text("plan_name").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  approvalDate: date("approval_date"),
  approvedBy: uuid("approved_by"),
  totalEstimatedValue: numeric("total_estimated_value", { precision: 18, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | APPROVED | IN_PROGRESS | COMPLETED | CANCELLED
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("bid_plans_tenant_idx").on(t.tenantId),
  numberIdx: index("bid_plans_number_idx").on(t.tenantId, t.planNumber),
}));

// =============================================================================
// Bid Packages (gói thầu)
// =============================================================================
export const bidPackages = pgTable("bid_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  bidPlanId: uuid("bid_plan_id").notNull(),
  packageNumber: text("package_number").notNull(),
  packageName: text("package_name").notNull(),
  bidMethod: text("bid_method").notNull().default("OPEN_TENDER"), // OPEN_TENDER | RESTRICTED | DIRECT | COMPETITIVE_QUOTATION
  publishDate: date("publish_date"),
  bidOpenDate: date("bid_open_date"),
  bidCloseDate: date("bid_close_date"),
  estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PUBLISHED | BIDDING | AWARDED | CANCELLED
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("bid_packages_tenant_idx").on(t.tenantId),
  planIdx: index("bid_packages_plan_idx").on(t.bidPlanId),
}));

// =============================================================================
// Bid Lots (lô trong gói thầu)
// =============================================================================
export const bidLots = pgTable("bid_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  bidPackageId: uuid("bid_package_id").notNull(),
  lotNumber: text("lot_number").notNull(),
  lotName: text("lot_name").notNull(),
  productGroup: text("product_group"), // HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE
  estimatedQty: numeric("estimated_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  unitId: uuid("unit_id"),
  estimatedUnitPrice: numeric("estimated_unit_price", { precision: 18, scale: 4 }),
  estimatedTotal: numeric("estimated_total", { precision: 18, scale: 2 }).notNull().default("0"),
  // Sau khi đấu
  awardedPartyId: uuid("awarded_party_id"),
  awardedQty: numeric("awarded_qty", { precision: 18, scale: 4 }),
  awardedUnitPrice: numeric("awarded_unit_price", { precision: 18, scale: 4 }),
  status: text("status").notNull().default("PENDING"), // PENDING | AWARDED | CANCELLED
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("bid_lots_tenant_idx").on(t.tenantId),
  packageIdx: index("bid_lots_package_idx").on(t.bidPackageId),
}));

// =============================================================================
// Bid Contracts (hợp đồng trúng thầu)
// =============================================================================
export const bidContracts = pgTable("bid_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  bidPackageId: uuid("bid_package_id").notNull(),
  bidLotId: uuid("bid_lot_id"),
  contractNumber: text("contract_number").notNull(),
  partyId: uuid("party_id").notNull(), // NCC trúng thầu
  contractValue: numeric("contract_value", { precision: 18, scale: 2 }).notNull().default("0"),
  usedValue: numeric("used_value", { precision: 18, scale: 2 }).notNull().default("0"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  signedDate: date("signed_date"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | EXPIRED | TERMINATED
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("bid_contracts_tenant_idx").on(t.tenantId),
  numberIdx: index("bid_contracts_number_idx").on(t.tenantId, t.contractNumber),
  lotIdx: index("bid_contracts_lot_idx").on(t.bidLotId),
}));

// =============================================================================
// Purchase Requests (dự trù mua hàng)
// =============================================================================
export const purchaseRequests = pgTable("purchase_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  prNumber: text("pr_number").notNull(),
  requestDept: text("request_dept"),
  bidPlanId: uuid("bid_plan_id"), // gắn vào KHĐT nếu có
  neededBy: date("needed_by"),
  notes: text("notes"),
  status: text("status").notNull().default("DRAFT"), // DRAFT | SUBMITTED | APPROVED | REJECTED | PO_CREATED | CANCELLED
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  totalEstimatedValue: numeric("total_estimated_value", { precision: 18, scale: 2 }).notNull().default("0"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("purchase_requests_tenant_idx").on(t.tenantId),
  numberIdx: index("purchase_requests_number_idx").on(t.tenantId, t.prNumber),
}));

export const purchaseRequestLines = pgTable("purchase_request_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  prId: uuid("pr_id").notNull(),
  productId: uuid("product_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  estimatedUnitPrice: numeric("estimated_unit_price", { precision: 18, scale: 4 }),
  suggestedPartyId: uuid("suggested_party_id"), // NCC gợi ý
  suggestedBidContractId: uuid("suggested_bid_contract_id"),
  lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
  lineNo: integer("line_no").notNull().default(0),
  notes: text("notes"),
}, (t) => ({
  prIdx: index("purchase_request_lines_pr_idx").on(t.prId),
}));

export type BidPlan = typeof bidPlans.$inferSelect;
export type NewBidPlan = typeof bidPlans.$inferInsert;
export type BidPackage = typeof bidPackages.$inferSelect;
export type NewBidPackage = typeof bidPackages.$inferInsert;
export type BidLot = typeof bidLots.$inferSelect;
export type NewBidLot = typeof bidLots.$inferInsert;
export type BidContract = typeof bidContracts.$inferSelect;
export type NewBidContract = typeof bidContracts.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert;
export type PurchaseRequestLine = typeof purchaseRequestLines.$inferSelect;
export type NewPurchaseRequestLine = typeof purchaseRequestLines.$inferInsert;
