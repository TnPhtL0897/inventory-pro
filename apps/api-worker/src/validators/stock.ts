/**
 * Zod schemas cho stock endpoints
 */

import { z } from "zod";

const uuid = z.string().uuid();
const decimalString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const listStockQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  branchId: uuid.optional(),
  warehouseId: uuid.optional(),
  productId: uuid.optional(),
  search: z.string().trim().optional(), // search by product name/sku
  lowStockOnly: z.coerce.boolean().optional(), // qty <= minStock
});

// =============================================================================
// Stock Issues
// =============================================================================
export const stockIssueLineRequest = z.object({
  productId: uuid,
  locationId: uuid,
  unitId: uuid,
  batchNo: z.string().default(""),
  serialNo: z.string().default(""),
  quantity: decimalString,
  unitCost: decimalString.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  lineNo: z.coerce.number().int().default(0),
});

export const createStockIssueRequest = z.object({
  branchId: uuid,
  issueNumber: z.string().trim().min(1).max(50).optional(),
  partyId: uuid.optional().nullable(),
  warehouseId: uuid,
  purpose: z.enum(["SALE", "INTERNAL_USE", "SCRAP", "SAMPLE", "GIFT", "TRANSFER_OUT", "ADJUSTMENT"]).default("INTERNAL_USE"),
  issueDate: z.string().date(),
  referenceNo: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(stockIssueLineRequest).min(1),
});

export type CreateStockIssueRequest = z.infer<typeof createStockIssueRequest>;

// =============================================================================
// Stock Transfers
// =============================================================================
export const stockTransferLineRequest = z.object({
  productId: uuid,
  unitId: uuid,
  fromLocationId: uuid,
  toLocationId: uuid,
  batchNo: z.string().default(""),
  serialNo: z.string().default(""),
  quantity: decimalString,
  unitCost: decimalString.optional().nullable(),
  lineNo: z.coerce.number().int().default(0),
});

export const createStockTransferRequest = z.object({
  transferNumber: z.string().trim().min(1).max(50).optional(),
  fromBranchId: uuid,
  fromWarehouseId: uuid,
  toBranchId: uuid,
  toWarehouseId: uuid,
  transferDate: z.string().date(),
  expectedReceiptDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(stockTransferLineRequest).min(1),
});

export type CreateStockTransferRequest = z.infer<typeof createStockTransferRequest>;

// =============================================================================
// Stock Takes
// =============================================================================
export const stockTakeLineRequest = z.object({
  productId: uuid,
  locationId: uuid,
  unitId: uuid,
  batchNo: z.string().default(""),
  serialNo: z.string().default(""),
  systemQty: decimalString.default("0"),
  countedQty: decimalString.optional().nullable(),
  lineNo: z.coerce.number().int().default(0),
});

export const createStockTakeRequest = z.object({
  branchId: uuid,
  stockTakeNumber: z.string().trim().min(1).max(50).optional(),
  warehouseId: uuid,
  stockTakeDate: z.string().date(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(stockTakeLineRequest).min(1),
});

export type CreateStockTakeRequest = z.infer<typeof createStockTakeRequest>;
