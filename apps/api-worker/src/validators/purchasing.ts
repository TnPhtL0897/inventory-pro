import { z } from "zod";

const uuid = z.string().uuid();
const decimalString = z.union([z.string(), z.number()]).transform((v) => String(v));

// =============================================================================
// Purchase Orders
// =============================================================================
export const poLineRequest = z.object({
  productId: uuid,
  unitId: uuid,
  quantity: decimalString,
  unitPrice: decimalString,
  taxRate: decimalString.default("0"),
  lineNo: z.coerce.number().int().default(0),
});

export const createPurchaseOrderRequest = z.object({
  branchId: uuid,
  poNumber: z.string().trim().min(1).max(50).optional(),
  partyId: uuid,
  bidContractId: uuid.optional().nullable(),
  bidLotId: uuid.optional().nullable(),
  orderDate: z.string().date(),
  expectedDeliveryDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(poLineRequest).min(1),
});

export type CreatePurchaseOrderRequest = z.infer<typeof createPurchaseOrderRequest>;

// =============================================================================
// Goods Receipts
// =============================================================================
export const grnLineRequest = z.object({
  poLineId: uuid.optional().nullable(),
  productId: uuid,
  locationId: uuid,
  unitId: uuid,
  batchNo: z.string().default(""),
  serialNo: z.string().default(""),
  quantity: decimalString,
  unitPrice: decimalString,
  expiryDate: z.string().date().optional().nullable(),
  lineNo: z.coerce.number().int().default(0),
});

export const createGoodsReceiptRequest = z.object({
  branchId: uuid,
  grnNumber: z.string().trim().min(1).max(50).optional(),
  poId: uuid.optional().nullable(),
  partyId: uuid,
  bidContractId: uuid.optional().nullable(),
  bidLotId: uuid.optional().nullable(),
  warehouseId: uuid,
  receiptDate: z.string().date(),
  supplierInvoiceNo: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(grnLineRequest).min(1),
});

export type CreateGoodsReceiptRequest = z.infer<typeof createGoodsReceiptRequest>;
