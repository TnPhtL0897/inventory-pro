/**
 * Drizzle schema: month_end_forecast_runs (lịch sử chạy dự trù cuối tháng)
 */

import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const monthEndForecastRuns = pgTable("month_end_forecast_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id"),
  runType: text("run_type").notNull(), // MANUAL | SCHEDULED
  fiscalYear: integer("fiscal_year").notNull(),
  fiscalMonth: integer("fiscal_month").notNull(), // 1..12
  asOfDate: date("as_of_date").notNull(),
  triggeredByUser: uuid("triggered_by_user"),
  status: text("status").notNull().default("COMPLETED"), // COMPLETED | FAILED
  warehouseCount: integer("warehouse_count").notNull().default(0),
  productCount: integer("product_count").notNull().default(0),
  totalEstimatedValue: numeric("total_estimated_value", { precision: 18, scale: 2 }).notNull().default("0"),
  createdPurchaseRequestIds: jsonb("created_purchase_request_ids").notNull().default([]),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("month_end_forecast_runs_tenant_idx").on(t.tenantId),
  uniqueMonthIdx: index("month_end_forecast_runs_unique_idx").on(t.tenantId, t.fiscalYear, t.fiscalMonth),
}));

export type MonthEndForecastRun = typeof monthEndForecastRuns.$inferSelect;
export type NewMonthEndForecastRun = typeof monthEndForecastRuns.$inferInsert;
