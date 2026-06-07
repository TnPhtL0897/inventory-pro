// =============================================================================
// Stock Issue schemas
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

export const issuePurposeSchema = z.enum([
  "SALE", "INTERNAL_USE", "SCRAP", "SAMPLE", "GIFT", "TRANSFER_OUT", "ADJUSTMENT",
]);
export type IssuePurposeInput = z.infer<typeof issuePurposeSchema>;

export const issueStatusSchema = z.enum(["DRAFT", "POSTED", "CANCELLED"]);

export const issueLineInputSchema = z.object({
  product_id: uuidSchema,
  unit_id: uuidSchema,
  location_id: uuidSchema,
  quantity: numericString(z.number().positive("Số lượng phải > 0")),
  unit_price: numericString(z.number().nonnegative()).default(0),
  batch_no: z.string().trim().max(100).optional().nullable(),
  serial_no: z.string().trim().max(100).optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createStockIssueBase = z.object({
  branch_id: uuidSchema,
  party_id: uuidSchema.optional().nullable(),
  warehouse_id: uuidSchema,
  purpose: issuePurposeSchema.default("SALE"),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference_no: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(issueLineInputSchema).min(1, "Phiếu xuất phải có ít nhất 1 dòng"),
  idempotency_keys: z.array(uuidSchema).min(1),
});

export const createStockIssueSchema = createStockIssueBase.refine(
  (v) => v.lines.length === v.idempotency_keys.length,
  { message: "Số idempotency_keys phải bằng số dòng", path: ["idempotency_keys"] },
);

export const updateStockIssueSchema = createStockIssueBase
  .omit({ branch_id: true, warehouse_id: true, party_id: true })
  .partial();

export const cancelIssueSchema = z.object({
  reason: z.string().trim().min(1, "Phải nhập lý do hủy").max(500),
});

export type CreateIssueLineInput = z.infer<typeof issueLineInputSchema>;
export type CreateStockIssueInput = z.infer<typeof createStockIssueSchema>;
export type UpdateStockIssueInput = z.infer<typeof updateStockIssueSchema>;
export type CancelIssueInput = z.infer<typeof cancelIssueSchema>;

export const issueListQuerySchema = listQuerySchema.extend({
  search: z.string().trim().optional(),
  party_id: uuidSchema.optional(),
  branch_id: uuidSchema.optional(),
  warehouse_id: uuidSchema.optional(),
  purpose: issuePurposeSchema.optional(),
  status: issueStatusSchema.optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
