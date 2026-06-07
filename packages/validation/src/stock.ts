// =============================================================================
// Stock movement schemas
// Theo ADR-0002: mọi write operation phải có Idempotency-Key
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const stockMovementTypeSchema = z.enum([
  "IN",
  "OUT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUST_IN",
  "ADJUST_OUT",
  "RETURN_IN",
  "RETURN_OUT",
]);
export type StockMovementTypeInput = z.infer<typeof stockMovementTypeSchema>;

export const stockReferenceTypeSchema = z.enum([
  "MANUAL",
  "GRN",
  "ISSUE",
  "TRANSFER",
  "STOCKTAKE",
  "SALE_RETURN",
  "PURCHASE_RETURN",
]);

// -----------------------------------------------------------------------------
// Record stock movement (ghi 1 movement)
// -----------------------------------------------------------------------------
export const recordMovementSchema = z.object({
  branch_id: uuidSchema,
  warehouse_id: uuidSchema,
  location_id: uuidSchema,
  product_id: uuidSchema,
  unit_id: uuidSchema,
  movement_type: stockMovementTypeSchema,
  quantity: z
    .number({ invalid_type_error: "Số lượng phải là số" })
    .positive("Số lượng phải > 0")
    .finite(),
  unit_cost: z.number().nonnegative().optional().nullable(),
  ref_type: stockReferenceTypeSchema.default("MANUAL"),
  ref_id: uuidSchema.optional().nullable(),
  ref_line_id: uuidSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  batch_no: z.string().trim().max(100).optional().nullable(),
  serial_no: z.string().trim().max(100).optional().nullable(),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
    .optional()
    .nullable(),
  // Idempotency-Key BẮT BUỘC - client phải sinh UUID và retry an toàn
  idempotency_key: uuidSchema,
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;

// -----------------------------------------------------------------------------
// List / filter movements
// -----------------------------------------------------------------------------
export const movementListQuerySchema = listQuerySchema.extend({
  branch_id: uuidSchema.optional(),
  warehouse_id: uuidSchema.optional(),
  product_id: uuidSchema.optional(),
  movement_type: stockMovementTypeSchema.optional(),
  ref_type: stockReferenceTypeSchema.optional(),
  ref_id: uuidSchema.optional(),
  date_from: z.string().datetime().optional(),     // ISO 8601
  date_to: z.string().datetime().optional(),
});

// -----------------------------------------------------------------------------
// Stock query (current inventory)
// -----------------------------------------------------------------------------
export const stockQuerySchema = listQuerySchema.extend({
  branch_id: uuidSchema.optional(),
  warehouse_id: uuidSchema.optional(),
  product_id: uuidSchema.optional(),
  category_id: uuidSchema.optional(),
  warehouse_allow_negative: z.coerce.boolean().optional(),
  // Lọc sản phẩm có tồn dưới min_stock (cho dashboard alert)
  below_min_stock: z.coerce.boolean().optional(),
});

export type StockQuery = z.infer<typeof stockQuerySchema>;
