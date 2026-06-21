import { z } from "zod";

const uuid = z.string().uuid();
const decimalString = z.union([z.string(), z.number()]).transform((v) => String(v));

// =============================================================================
// Bid Plans
// =============================================================================
export const createBidPlanRequest = z.object({
  planNumber: z.string().trim().min(1).max(50).optional(),
  planName: z.string().trim().min(1).max(200),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  approvalDate: z.string().date().optional().nullable(),
  totalEstimatedValue: decimalString.default("0"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateBidPlanRequest = createBidPlanRequest.partial().extend({
  status: z.enum(["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

export type CreateBidPlanRequest = z.infer<typeof createBidPlanRequest>;

// =============================================================================
// Bid Packages
// =============================================================================
export const createBidPackageRequest = z.object({
  bidPlanId: uuid,
  packageNumber: z.string().trim().min(1).max(50).optional(),
  packageName: z.string().trim().min(1).max(200),
  bidMethod: z.enum(["OPEN_TENDER", "RESTRICTED", "DIRECT", "COMPETITIVE_QUOTATION"]).default("OPEN_TENDER"),
  publishDate: z.string().date().optional().nullable(),
  bidOpenDate: z.string().date().optional().nullable(),
  bidCloseDate: z.string().date().optional().nullable(),
  estimatedValue: decimalString.default("0"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateBidPackageRequest = z.infer<typeof createBidPackageRequest>;

// =============================================================================
// Bid Lots
// =============================================================================
export const createBidLotRequest = z.object({
  bidPackageId: uuid,
  lotNumber: z.string().trim().min(1).max(50).optional(),
  lotName: z.string().trim().min(1).max(200),
  productGroup: z.enum(["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE"]).optional().nullable(),
  estimatedQty: decimalString.default("0"),
  unitId: uuid.optional().nullable(),
  estimatedUnitPrice: decimalString.optional().nullable(),
  estimatedTotal: decimalString.default("0"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateBidLotRequest = z.infer<typeof createBidLotRequest>;

// =============================================================================
// Bid Contracts
// =============================================================================
export const createBidContractRequest = z.object({
  bidPackageId: uuid,
  bidLotId: uuid.optional().nullable(),
  contractNumber: z.string().trim().min(1).max(50).optional(),
  partyId: uuid,
  contractValue: decimalString.default("0"),
  startDate: z.string().date(),
  endDate: z.string().date(),
  signedDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
  message: "endDate must be after startDate",
});

export type CreateBidContractRequest = z.infer<typeof createBidContractRequest>;

// =============================================================================
// Purchase Requests
// =============================================================================
export const prLineRequest = z.object({
  productId: uuid,
  unitId: uuid,
  quantity: decimalString,
  estimatedUnitPrice: decimalString.optional().nullable(),
  suggestedPartyId: uuid.optional().nullable(),
  suggestedBidContractId: uuid.optional().nullable(),
  lineNo: z.coerce.number().int().default(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const createPurchaseRequestRequest = z.object({
  branchId: uuid,
  prNumber: z.string().trim().min(1).max(50).optional(),
  requestDept: z.string().trim().max(100).optional().nullable(),
  bidPlanId: uuid.optional().nullable(),
  neededBy: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(prLineRequest).min(1),
});

export type CreatePurchaseRequestRequest = z.infer<typeof createPurchaseRequestRequest>;
