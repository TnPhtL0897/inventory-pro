// =============================================================================
// Stock Take (kiểm kê) schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

export const stockTakeStatusSchema = z.enum(["DRAFT", "COUNTED", "POSTED", "CANCELLED"]);
export type StockTakeStatusInput = z.infer<typeof stockTakeStatusSchema>;

export const createStockTakeLineSchema = z.object({
  productId: uuidSchema,
  unitId: uuidSchema,
  locationId: uuidSchema,
  batchNo: z.string().trim().max(100).optional().nullable(),
  serialNo: z.string().trim().max(100).optional().nullable(),
});

export const createStockTakeSchema = z.object({
  branchId: uuidSchema,
  warehouseId: uuidSchema,
  stockTakeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional().nullable(),
  // null/undefined = auto-snapshot toàn bộ stock trong warehouse
  lines: z.array(createStockTakeLineSchema).optional().nullable(),
});

export const updateCountedQtyLineSchema = z.object({
  lineId: uuidSchema,
  countedQty: z.number().nonnegative("Số đếm phải >= 0").finite().nullable(),
  notes: z.string().trim().max(1000).optional(),
});

export const bulkUpdateCountedQtySchema = z.object({
  updates: z.array(updateCountedQtyLineSchema),
});

export const stockTakeListQuerySchema = listQuerySchema.extend({
  branchId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  status: stockTakeStatusSchema.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type CreateStockTakeInput = z.infer<typeof createStockTakeSchema>;
export type UpdateCountedQtyInput = z.infer<typeof updateCountedQtyLineSchema>;
export type BulkUpdateCountedQtyInput = z.infer<typeof bulkUpdateCountedQtySchema>;
