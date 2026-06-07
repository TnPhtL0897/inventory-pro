// =============================================================================
// Bidding Management schemas (Đấu thầu)
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// =============================================================================
// Enums
// =============================================================================
export const bidPackageTypeSchema = z.enum([
  "OPEN", "LIMITED", "DIRECT", "COMPETITIVE_QUOTE"
]);

export const bidPackageStatusSchema = z.enum([
  "DRAFT", "APPROVED", "PUBLISHED", "CLOSED", "AWARDED", "CANCELLED"
]);

export const bidLotStatusSchema = z.enum([
  "DRAFT", "PUBLISHED", "EVALUATING", "AWARDED", "CANCELLED", "NO_BIDDER"
]);

export const bidContractStatusSchema = z.enum([
  "DRAFT", "ACTIVE", "EXPIRED", "TERMINATED", "COMPLETED"
]);

export const purchaseRequestStatusSchema = z.enum([
  "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "MERGED"
]);

// =============================================================================
// BidPlan
// =============================================================================
export const createBidPlanSchema = z.object({
  fiscal_year: z.number().int().min(2000).max(2100),
  title: z.string().min(1, "Tiêu đề không được trống").max(500),
  total_estimated_value: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateBidPlanSchema = createBidPlanSchema.pick({
  title: true, total_estimated_value: true, notes: true,
}).partial();

export const approveBidPlanSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const bidPlanListQuerySchema = listQuerySchema.extend({
  fiscal_year: z.coerce.number().int().optional(),
  status: z.string().optional(),
});

// =============================================================================
// PurchaseRequest
// =============================================================================
export const prLineInputSchema = z.object({
  product_id: uuidSchema,
  unit_id: uuidSchema,
  quantity: z.coerce.number().positive("Số lượng phải > 0"),
  estimated_unit_price: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const createPurchaseRequestSchema = z.object({
  branch_id: uuidSchema,
  bid_plan_id: uuidSchema.optional().nullable(),
  request_dept: z.string().min(1, "Tên khoa/phòng không được trống").max(200),
  fiscal_year: z.number().int().optional().nullable(),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(prLineInputSchema).min(1, "Dự trù phải có ít nhất 1 dòng"),
});

export const updatePurchaseRequestSchema = z.object({
  request_dept: z.string().min(1).max(200),
  notes: z.string().optional().nullable(),
  lines: z.array(prLineInputSchema).min(1),
});

export const purchaseRequestListQuerySchema = listQuerySchema.extend({
  branch_id: uuidSchema.optional(),
  bid_plan_id: uuidSchema.optional(),
  status: z.string().optional(),
  fiscal_year: z.coerce.number().int().optional(),
});

// =============================================================================
// BidPackage
// =============================================================================
export const createBidPackageSchema = z.object({
  package_name: z.string().min(1, "Tên gói thầu không được trống").max(500),
  bid_plan_id: uuidSchema.optional().nullable(),
  bid_package_type: bidPackageTypeSchema,
  publish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  bid_open_date: z.string().optional().nullable(),
  bid_close_date: z.string().optional().nullable(),
  total_estimated_value: z.coerce.number().nonnegative().optional().nullable(),
  procurement_method: z.string().optional().nullable(),
  decision_no: z.string().max(100).optional().nullable(),
  decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateBidPackageSchema = createBidPackageSchema.pick({
  package_name: true, publish_date: true, bid_open_date: true, bid_close_date: true,
  total_estimated_value: true, procurement_method: true, decision_no: true,
  decision_date: true, notes: true,
}).partial();

export const publishBidPackageSchema = z.object({
  publish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bid_open_date: z.string().optional().nullable(),
  bid_close_date: z.string().optional().nullable(),
});

export const bidPackageListQuerySchema = listQuerySchema.extend({
  bid_plan_id: uuidSchema.optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

// =============================================================================
// BidLot
// =============================================================================
export const bidLotLineInputSchema = z.object({
  product_id: uuidSchema,
  unit_id: uuidSchema,
  quantity: z.coerce.number().positive("Số lượng phải > 0"),
  estimated_unit_price: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const createBidLotSchema = z.object({
  lot_no: z.string().min(1, "Mã lô không được trống").max(50),
  lot_name: z.string().min(1, "Tên lô không được trống").max(500),
  bid_package_id: uuidSchema,
  product_category: z.string().max(200).optional().nullable(),
  estimated_value: z.coerce.number().nonnegative().optional().nullable(),
  quantity_total: z.coerce.number().nonnegative().optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  lines: z.array(bidLotLineInputSchema).optional().default([]),
});

export const updateBidLotSchema = z.object({
  lot_name: z.string().min(1).max(500),
  product_category: z.string().max(200).optional().nullable(),
  estimated_value: z.coerce.number().nonnegative().optional().nullable(),
  quantity_total: z.coerce.number().nonnegative().optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
  lines: z.array(bidLotLineInputSchema).optional(),
});

export const bidLotListQuerySchema = listQuerySchema.extend({
  bid_package_id: uuidSchema.optional(),
  status: z.string().optional(),
});

export const addBidderSchema = z.object({
  party_id: uuidSchema,
  bid_price: z.coerce.number().nonnegative().optional().nullable(),
  bid_date: z.string().optional().nullable(),
  evaluation_score: z.coerce.number().min(0).max(100).optional().nullable(),
  rank: z.number().int().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const awardBidLotSchema = z.object({
  bidder_id: uuidSchema,
  awarded_value: z.coerce.number().positive("Giá trúng phải > 0"),
  awarded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decision_no: z.string().max(100).optional().nullable(),
});

// =============================================================================
// BidContract
// =============================================================================
export const createBidContractSchema = z.object({
  bid_lot_id: uuidSchema,
  contract_no: z.string().max(100).optional().nullable(),  // auto-gen nếu để trống
  contract_name: z.string().max(500).optional().nullable(),
  winning_party_id: uuidSchema,
  contract_value: z.coerce.number().positive("Giá trị HĐ phải > 0"),
  contract_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contract_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_terms: z.number().int().nonnegative().optional().nullable(),
  advance_payment_pct: z.coerce.number().min(0).max(100).optional().nullable(),
  retention_pct: z.coerce.number().min(0).max(100).optional().nullable(),
  warranty_months: z.number().int().nonnegative().optional().nullable(),
  signing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((data) => new Date(data.contract_end_date) >= new Date(data.contract_start_date), {
  message: "Ngày kết thúc phải sau ngày bắt đầu",
  path: ["contract_end_date"],
});

export const updateBidContractSchema = z.object({
  contract_name: z.string().max(500).optional().nullable(),
  contract_value: z.coerce.number().positive(),
  contract_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contract_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_terms: z.number().int().nonnegative().optional().nullable(),
  advance_payment_pct: z.coerce.number().min(0).max(100).optional().nullable(),
  retention_pct: z.coerce.number().min(0).max(100).optional().nullable(),
  warranty_months: z.number().int().nonnegative().optional().nullable(),
  signing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const terminateBidContractSchema = z.object({
  reason: z.string().min(1, "Phải nhập lý do terminate").max(500),
});

export const bidContractListQuerySchema = listQuerySchema.extend({
  bid_lot_id: uuidSchema.optional(),
  winning_party_id: uuidSchema.optional(),
  status: z.string().optional(),
  expiring_soon: z.coerce.boolean().optional(),
});
