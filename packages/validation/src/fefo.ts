// =============================================================================
// FEFO Enforcement (First-Expire-First-Out) - Validation schemas
// =============================================================================

import { z } from "zod";

// Override reason enum
export const FEFO_OVERRIDE_REASONS = [
  "FEFO_INSUFFICIENT",
  "FEFO_EXPIRED_SOON",
  "FEFO_RECALLED",
  "EMERGENCY",
  "NO_OTHER_LOT",
  "OTHER",
] as const;

export type FefoOverrideReason = (typeof FEFO_OVERRIDE_REASONS)[number];

// =============================================================================
// FEFO Pick Request
// =============================================================================

export const fefoPickRequestSchema = z.object({
  product_id: z.string().uuid("product_id phải là UUID hợp lệ"),
  warehouse_id: z.string().uuid("warehouse_id phải là UUID hợp lệ"),
  quantity: z.number().positive("quantity phải > 0"),
  document_type: z.string().optional(),
  document_id: z.string().uuid().optional(),
  document_number: z.string().optional(),
});

export type FefoPickRequest = z.infer<typeof fefoPickRequestSchema>;

// =============================================================================
// FEFO Pick Line (response)
// =============================================================================

export const fefoPickLineSchema = z.object({
  lot_id: z.string().uuid(),
  lot_number: z.string(),
  expiration_date: z.string(),
  open_vial_expiration_date: z.string().nullable(),
  is_open_vial: z.boolean(),
  pick_quantity: z.number().nonnegative(),
  pick_order: z.number().int().positive(),
  pick_reason: z.string(),
});

export type FefoPickLine = z.infer<typeof fefoPickLineSchema>;

export const fefoPickResponseSchema = z.object({
  picks: z.array(fefoPickLineSchema),
  total_requested: z.number(),
  total_picked: z.number(),
  shortage: z.number(),
  is_sufficient: z.boolean(),
  warnings: z.array(z.string()),
});

export type FefoPickResponse = z.infer<typeof fefoPickResponseSchema>;

// =============================================================================
// FEFO Override Request
// =============================================================================

export const fefoOverrideRequestSchema = z.object({
  product_id: z.string().uuid("product_id phải là UUID hợp lệ"),
  warehouse_id: z.string().uuid("warehouse_id phải là UUID hợp lệ"),
  requested_quantity: z.number().positive("requested_quantity phải > 0"),
  actual_lot_id: z.string().uuid("actual_lot_id phải là UUID hợp lệ"),
  override_reason: z.enum(FEFO_OVERRIDE_REASONS, {
    errorMap: () => ({ message: `override_reason phải là một trong: ${FEFO_OVERRIDE_REASONS.join(", ")}` }),
  }),
  override_description: z
    .string()
    .min(10, "Mô tả phải có ít nhất 10 ký tự")
    .max(1000, "Mô tả không quá 1000 ký tự"),
  document_type: z.string().optional(),
  document_id: z.string().uuid().optional(),
  document_number: z.string().optional(),
});

export type FefoOverrideRequest = z.infer<typeof fefoOverrideRequestSchema>;

// =============================================================================
// FEFO Override Response
// =============================================================================

export const fefoOverrideResponseSchema = z.object({
  success: z.boolean(),
  audit_id: z.string().uuid(),
  audit_level: z.enum(["INFO", "WARNING", "CRITICAL"]),
  message: z.string(),
});

export type FefoOverrideResponse = z.infer<typeof fefoOverrideResponseSchema>;

// =============================================================================
// FEFO Audit Log Entry
// =============================================================================

export const fefoAuditLogSchema = z.object({
  id: z.string().uuid(),
  document_type: z.string().nullable(),
  document_number: z.string().nullable(),
  product_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  requested_quantity: z.number(),
  fefo_first_lot_id: z.string().uuid().nullable(),
  fefo_first_lot_expiration: z.string().nullable(),
  actual_lot_id: z.string().uuid(),
  actual_lot_number: z.string(),
  actual_lot_expiration: z.string(),
  actual_lot_status: z.string(),
  is_fefo_compliant: z.boolean(),
  is_expired_used: z.boolean(),
  override_reason: z.string().nullable(),
  override_description: z.string().nullable(),
  audit_level: z.enum(["INFO", "WARNING", "CRITICAL"]),
  user_email: z.string().email().optional(),
  created_at: z.string(),
});

export type FefoAuditLog = z.infer<typeof fefoAuditLogSchema>;

// =============================================================================
// FEFO Compliance Report
// =============================================================================

export const fefoComplianceReportSchema = z.object({
  total_picks: z.number().int().nonnegative(),
  compliant_picks: z.number().int().nonnegative(),
  override_picks: z.number().int().nonnegative(),
  expired_picks: z.number().int().nonnegative(),
  compliance_rate: z.number().min(0).max(1),
  override_rate: z.number().min(0).max(1),
  top_overridden_products: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        sku: z.string(),
        name: z.string(),
        override_count: z.number().int().nonnegative(),
      })
    )
    .nullable(),
  top_override_users: z
    .array(
      z.object({
        user_id: z.string().uuid(),
        email: z.string().nullable(),
        override_count: z.number().int().nonnegative(),
      })
    )
    .nullable(),
  top_override_reasons: z
    .array(
      z.object({
        override_reason: z.string(),
        reason_count: z.number().int().nonnegative(),
      })
    )
    .nullable(),
});

export type FefoComplianceReport = z.infer<typeof fefoComplianceReportSchema>;
