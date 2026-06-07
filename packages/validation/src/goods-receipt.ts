// =============================================================================
// Goods Receipt (GRN) schemas
// =============================================================================
import { z } from "zod";
import { uuidSchema, listQuerySchema } from "./common";

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

export const grnStatusSchema = z.enum(["DRAFT", "POSTED", "CANCELLED"]);

export const grnLineInputSchema = z.object({
  po_line_id: uuidSchema.optional().nullable(),
  product_id: uuidSchema,
  unit_id: uuidSchema,
  location_id: uuidSchema,
  quantity: numericString(z.number().positive("Số lượng phải > 0")),
  unit_cost: numericString(z.number().nonnegative("Đơn giá phải >= 0")),
  batch_no: z.string().trim().max(100).optional().nullable(),
  serial_no: z.string().trim().max(100).optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createGoodsReceiptBase = z.object({
  branch_id: uuidSchema,
  purchase_order_id: uuidSchema.optional().nullable(),
  party_id: uuidSchema,
  warehouse_id: uuidSchema,
  receipt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier_invoice_no: z.string().trim().max(100).optional().nullable(),
  supplier_invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(grnLineInputSchema).min(1, "GRN phải có ít nhất 1 dòng"),
  idempotency_keys: z.array(uuidSchema).min(1, "Cần ít nhất 1 idempotency key"),
});

export const createGoodsReceiptSchema = createGoodsReceiptBase.refine(
  (v) => v.lines.length === v.idempotency_keys.length,
  { message: "Số idempotency_keys phải bằng số dòng", path: ["idempotency_keys"] },
);

export const updateGoodsReceiptSchema = createGoodsReceiptBase
  .omit({ branch_id: true, party_id: true, warehouse_id: true, purchase_order_id: true })
  .partial();

export const cancelGrnSchema = z.object({
  reason: z.string().trim().min(1, "Phải nhập lý do hủy").max(500),
});

export type CreateGrnLineInput = z.infer<typeof grnLineInputSchema>;
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type UpdateGoodsReceiptInput = z.infer<typeof updateGoodsReceiptSchema>;
export type CancelGrnInput = z.infer<typeof cancelGrnSchema>;

export const grnListQuerySchema = listQuerySchema.extend({
  search: z.string().trim().optional(),
  party_id: uuidSchema.optional(),
  purchase_order_id: uuidSchema.optional(),
  branch_id: uuidSchema.optional(),
  status: grnStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
