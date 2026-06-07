// =============================================================================
// Stock Transfer (chuyển kho) schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

export const stockTransferStatusSchema = z.enum(["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"]);
export type StockTransferStatusInput = z.infer<typeof stockTransferStatusSchema>;

export const createStockTransferLineSchema = z.object({
  productId: uuidSchema,
  unitId: uuidSchema,
  fromLocationId: uuidSchema,
  toLocationId: uuidSchema,
  quantity: z.number().positive("Số lượng phải > 0").finite(),
  batchNo: z.string().trim().max(100).optional().nullable(),
  serialNo: z.string().trim().max(100).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: uuidSchema,
});

export const createStockTransferSchema = z
  .object({
    fromBranchId: uuidSchema,
    fromWarehouseId: uuidSchema,
    toBranchId: uuidSchema,
    toWarehouseId: uuidSchema,
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedReceiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    lines: z.array(createStockTransferLineSchema).min(1, "Phải có ít nhất 1 dòng"),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Kho nguồn và kho đích phải khác nhau",
    path: ["toWarehouseId"],
  })
  .refine(
    (v) => {
      const keys = v.lines.map((l) => l.idempotencyKey);
      return keys.length === new Set(keys).size;
    },
    { message: "Idempotency keys phải unique", path: ["lines"] },
  );

export const updateStockTransferSchema = z.object({
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedReceiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(createStockTransferLineSchema).optional(),
});

export const receiveStockTransferLineSchema = z.object({
  lineId: uuidSchema,
  receivedQty: z.number().nonnegative("Số lượng nhận phải >= 0").finite(),
});

export const receiveStockTransferSchema = z.object({
  lines: z.array(receiveStockTransferLineSchema).min(1, "Phải có ít nhất 1 dòng nhận"),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const stockTransferListQuerySchema = listQuerySchema.extend({
  fromBranchId: uuidSchema.optional(),
  toBranchId: uuidSchema.optional(),
  fromWarehouseId: uuidSchema.optional(),
  toWarehouseId: uuidSchema.optional(),
  status: stockTransferStatusSchema.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type UpdateStockTransferInput = z.infer<typeof updateStockTransferSchema>;
export type ReceiveStockTransferInput = z.infer<typeof receiveStockTransferSchema>;
