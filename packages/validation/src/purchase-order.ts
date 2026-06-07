// =============================================================================
// Purchase Order schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export const poStatusSchema = z.enum(["DRAFT", "APPROVED", "POSTED", "COMPLETED", "CANCELLED"]);
export type PoStatusInput = z.infer<typeof poStatusSchema>;

export const poLineStatusSchema = z.enum(["OPEN", "PARTIAL", "RECEIVED", "CANCELLED"]);

// -----------------------------------------------------------------------------
// Lines
// -----------------------------------------------------------------------------
const numericString = (schema: z.ZodNumber) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({ code: "custom", message: "Số không hợp lệ" });
        return z.NEVER;
      }
      return v;
    }
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Số không hợp lệ" });
      return z.NEVER;
    }
    return n;
  }).pipe(schema);

export const poLineInputSchema = z.object({
  product_id: uuidSchema,
  unit_id: uuidSchema,
  quantity: numericString(z.number().positive("Số lượng phải > 0")),
  unit_price: numericString(z.number().nonnegative("Đơn giá phải >= 0")),
  discount_pct: numericString(z.number().min(0).max(100)).default(0),
  tax_pct: numericString(z.number().min(0).max(1000)).default(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type PoLineInput = z.infer<typeof poLineInputSchema>;

// -----------------------------------------------------------------------------
// Create / Update header
// -----------------------------------------------------------------------------
export const createPurchaseOrderSchema = z.object({
  branch_id: uuidSchema,
  party_id: uuidSchema,
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD"),
  expected_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
    .optional()
    .nullable(),
  currency: z.string().length(3).default("VND"),
  exchange_rate: numericString(z.number().positive()).default(1),
  discount_amount: numericString(z.number().nonnegative()).default(0),
  shipping_amount: numericString(z.number().nonnegative()).default(0),
  payment_terms: z.coerce.number().int().nonnegative().default(0),
  shipping_address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  internal_notes: z.string().trim().max(2000).optional().nullable(),
  // ⭐ BẮT BUỘC: Mỗi PO phải gắn với 1 hợp đồng thầu
  bid_contract_id: uuidSchema,
  bid_lot_id: uuidSchema.optional().nullable(),
  lines: z.array(poLineInputSchema).min(1, "PO phải có ít nhất 1 dòng"),
});

export const updatePurchaseOrderSchema = z.object({
  party_id: uuidSchema,
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  discount_amount: numericString(z.number().nonnegative()).optional(),
  shipping_amount: numericString(z.number().nonnegative()).optional(),
  shipping_address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  internal_notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(poLineInputSchema).min(1).optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

// -----------------------------------------------------------------------------
// Workflow actions
// -----------------------------------------------------------------------------
export const approvePoSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const cancelPoSchema = z.object({
  reason: z.string().trim().min(1, "Phải nhập lý do hủy").max(500),
});

// -----------------------------------------------------------------------------
// List query
// -----------------------------------------------------------------------------
export const poListQuerySchema = listQuerySchema.extend({
  search: z.string().trim().optional(),
  party_id: uuidSchema.optional(),
  branch_id: uuidSchema.optional(),
  status: poStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
