// =============================================================================
// Open-Vial Tracking - Validation schemas
// =============================================================================

import { z } from "zod";

// =============================================================================
// Open vial action
// =============================================================================

export const openVialActionSchema = z.object({
  action: z.enum(["open", "update-volume"], {
    errorMap: () => ({ message: "action phải là 'open' hoặc 'update-volume'" }),
  }),
  lot_id: z.string().uuid("lot_id phải là UUID hợp lệ"),
  quantity_taken: z.number().nonnegative("quantity_taken phải >= 0"),
  quantity_remaining: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export type OpenVialActionInput = z.infer<typeof openVialActionSchema>;

export const openVialResponseSchema = z.object({
  success: z.boolean(),
  action: z.enum(["open", "update-volume"]),
  history_id: z.string().uuid().optional(),
  open_vial_expiration_date: z.string().optional(),
  print_queue_id: z.string().uuid().optional(),
  new_remaining: z.number().optional(),
  message: z.string(),
});

export type OpenVialResponse = z.infer<typeof openVialResponseSchema>;

// =============================================================================
// QC retest
// =============================================================================

export const openVialQcRetestSchema = z.object({
  lot_id: z.string().uuid("lot_id phải là UUID hợp lệ"),
  qc_method: z.string().min(3, "qc_method phải có ít nhất 3 ký tự").max(200),
  qc_result: z.enum(["PASS", "FAIL", "PENDING"], {
    errorMap: () => ({ message: "qc_result phải là PASS, FAIL, hoặc PENDING" }),
  }),
  qc_notes: z
    .string()
    .min(10, "qc_notes phải có ít nhất 10 ký tự")
    .max(2000, "qc_notes không quá 2000 ký tự"),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "valid_until phải là YYYY-MM-DD")
    .optional(),
  control_normal_lot_id: z.string().uuid().optional(),
  control_pathological_lot_id: z.string().uuid().optional(),
  attachments: z.array(z.unknown()).optional(),
});

export type OpenVialQcRetestInput = z.infer<typeof openVialQcRetestSchema>;

export const openVialQcRetestResponseSchema = z.object({
  success: z.boolean(),
  qc_record_id: z.string().uuid(),
  message: z.string(),
});

export type OpenVialQcRetestResponse = z.infer<typeof openVialQcRetestResponseSchema>;

// =============================================================================
// Open-vial status (from fn_get_open_vial_status)
// =============================================================================

export const openVialStatusSchema = z.object({
  isOpen: z.boolean(),
  openedAt: z.string().nullable(),
  openedByUser: z.string().uuid().nullable(),
  openVialExpirationDate: z.string().nullable(),
  daysUntilExpiry: z.number().int().nullable(),
  volumeRemaining: z.number().nullable(),
  needsQcRetest: z.boolean(),
  qcRetestReason: z.string().nullable(),
  lastQcRetestAt: z.string().nullable(),
  lastQcRetestResult: z.string().nullable(),
  qcRetestValidUntil: z.string().nullable(),
  openVialCount: z.number().int(),
});

export type OpenVialStatus = z.infer<typeof openVialStatusSchema>;

// =============================================================================
// Open-vial expiring list
// =============================================================================

export const openVialExpiringItemSchema = z.object({
  lotId: z.string().uuid(),
  lotNumber: z.string(),
  productName: z.string(),
  productSku: z.string(),
  openVialExpirationDate: z.string(),
  daysUntilExpiry: z.number().int(),
  alertLevel: z.enum(["INFO", "WARNING", "CRITICAL"]),
  message: z.string(),
});

export type OpenVialExpiringItem = z.infer<typeof openVialExpiringItemSchema>;
