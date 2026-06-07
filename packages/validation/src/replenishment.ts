// =============================================================================
// Replenishment (Dự trù cuối tháng) schemas
// =============================================================================
import { z } from "zod";
import { listQuerySchema } from "./common";

/**
 * Request body cho POST /api/v1/replenishment/preview và /run.
 * Algorithm: tính forecast trend 3 tháng gần nhất + đề xuất bổ sung cho kho chẵn.
 */
export const runReplenishmentRequestSchema = z.object({
  fiscal_year: z.number().int().min(2000).max(2100),
  fiscal_month: z.number().int().min(1).max(12),
  as_of_date: z.string().date().optional().nullable(),     // ISO date; null = cuối tháng trước
  save_as_purchase_request: z.boolean().default(false),     // true = tạo PR DRAFT
  notes: z.string().max(500).optional().nullable(),
});
export type RunReplenishmentInput = z.infer<typeof runReplenishmentRequestSchema>;

/** 1 dòng đề xuất bổ sung (response). */
export const forecastLineSchema = z.object({
  product_id: z.string().uuid(),
  product_sku: z.string(),
  product_name: z.string(),
  unit_id: z.string().uuid(),
  unit_code: z.string(),
  current_stock: z.number(),
  min_stock: z.number(),
  max_stock: z.number().nullable(),
  avg_daily_out: z.number(),
  forecast_next_month: z.number(),
  suggested_replenish_qty: z.number(),
  estimated_unit_price: z.number(),
  estimated_total: z.number(),
  bid_contract_id: z.string().uuid().nullable(),
  bid_contract_no: z.string().nullable(),
  bid_lot_id: z.string().uuid().nullable(),
  bid_lot_name: z.string().nullable(),
  reason: z.string(),
});

/** Preview response. */
export const forecastPreviewSchema = z.object({
  tenant_id: z.string().uuid(),
  as_of_date: z.string().date(),
  fiscal_year: z.number(),
  fiscal_month: z.number(),
  warehouse_count: z.number(),
  product_count: z.number(),
  total_estimated_value: z.number(),
  lines: z.array(forecastLineSchema),
});

/** 1 record lịch sử chạy. */
export const replenishmentRunSchema = z.object({
  id: z.string().uuid(),
  run_type: z.enum(["MANUAL", "SCHEDULED"]),
  fiscal_year: z.number(),
  fiscal_month: z.number(),
  as_of_date: z.string().date(),
  triggered_by_user: z.string().uuid().nullable(),
  status: z.enum(["COMPLETED", "FAILED"]),
  warehouse_count: z.number(),
  product_count: z.number(),
  total_estimated_value: z.number(),
  created_purchase_request_ids: z.array(z.string().uuid()),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
});

/** Query params cho GET /runs. */
export const listReplenishmentRunsQuerySchema = listQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type ListReplenishmentRunsInput = z.infer<typeof listReplenishmentRunsQuerySchema>;
