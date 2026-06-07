// =============================================================================
// Common schemas (UUID, pagination, sort, filter)
// =============================================================================
import { z } from "zod";

export const uuidSchema = z.string().uuid("ID phải là UUID hợp lệ");

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]).default("asc");

// Filter chung cho list endpoints
export const listQuerySchema = paginationSchema.extend({
  q: z.string().trim().optional(),         // full-text search
  sort_by: z.string().optional(),
  sort_order: sortOrderSchema.optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

// Audit fields (read-only, không nhận từ client)
export const auditFieldsSchema = z.object({
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  created_by: z.string().uuid().optional(),
});
