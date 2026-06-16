// =============================================================================
// Audit Log - Validation schemas
// =============================================================================

import { z } from "zod";

export const auditOperationSchema = z.enum(["INSERT", "UPDATE", "DELETE"]);
export type AuditOperation = z.infer<typeof auditOperationSchema>;

export const auditLogQuerySchema = z.object({
  table_name: z.string().optional(),
  operation: auditOperationSchema.optional(),
  user_id: z.string().uuid().optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from_date phải là YYYY-MM-DD")
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to_date phải là YYYY-MM-DD")
    .optional(),
  page: z.number().int().positive().optional(),
  page_size: z.number().int().positive().max(500).optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  tableName: z.string(),
  recordId: z.string().uuid(),
  operation: auditOperationSchema,
  oldData: z.record(z.unknown()).nullable(),
  newData: z.record(z.unknown()).nullable(),
  changedFields: z.array(z.string()).nullable(),
  changedBy: z.string().uuid().nullable(),
  changedByEmail: z.string().nullable(),
  changedByRole: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

// Danh sách bảng được audit (cho filter dropdown)
export const AUDITED_TABLES = [
  "products",
  "lots",
  "stock_movements",
  "stocktakes",
  "bid_contracts",
  "bid_lots",
  "purchase_requests",
  "goods_receipts",
  "stock_issues",
  "stock_transfers",
  "fefo_audit_log",
  "user_warehouse_roles",
  "user_global_roles",
] as const;
