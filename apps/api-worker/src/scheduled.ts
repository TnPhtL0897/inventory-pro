/**
 * Scheduled handler - chạy bởi CF Cron Triggers
 *
 * Patterns (từ wrangler.toml):
 * - "0 2 25 * *" = 02:00 ngày 25 hàng tháng → Replenishment auto-run cho TẤT CẢ tenants
 *
 * Lưu ý: scheduled handler KHÔNG có auth context (cron không có JWT).
 * createdBy của PR sẽ là null. Mỗi tenant tự chạy riêng.
 */

import { createDb } from "./db";
import { runForecast } from "./routes/replenishment";
import { sql } from "drizzle-orm";
import type { Bindings } from "./types";

export async function handleScheduled(
  event: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  const cron = event.cron;
  const triggeredAt = new Date(event.scheduledTime).toISOString();
  console.log(JSON.stringify({
    level: "info",
    msg: "scheduled.trigger",
    cron,
    triggeredAt,
  }));

  ctx.waitUntil(runScheduledTask(cron, env, triggeredAt));
}

async function runScheduledTask(
  cron: string,
  env: Bindings,
  triggeredAt: string
): Promise<void> {
  try {
    if (cron === "0 2 25 * *") {
      await runScheduledReplenishment(env, triggeredAt);
    } else {
      console.log(JSON.stringify({
        level: "warn",
        msg: "scheduled.unknown_cron",
        cron,
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "scheduled.error",
      cron,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
  }
}

// =============================================================================
// 25 hàng tháng: Replenishment cho tháng tiếp theo
// =============================================================================
async function runScheduledReplenishment(
  env: Bindings,
  triggeredAt: string
): Promise<void> {
  const { db, client } = createDb(env.DATABASE_URL);
  const now = new Date();
  const nextMonth = now.getMonth() + 2; // 1..12 (next month)
  const fiscalYear = nextMonth === 13 ? now.getFullYear() + 1 : now.getFullYear();
  const adjustedMonth = nextMonth === 13 ? 1 : nextMonth;
  const asOfDate = now.toISOString().split("T")[0];

  // Tìm tất cả tenants active
  const tenants = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM tenants WHERE is_active = true`
  );

  console.log(JSON.stringify({
    level: "info",
    msg: "scheduled.replenishment.start",
    tenantCount: tenants.length,
    fiscalMonth: adjustedMonth,
    fiscalYear,
    asOfDate,
  }));

  let successCount = 0;
  let failCount = 0;

  for (const tenant of tenants) {
    try {
      // Idempotency check: skip nếu đã chạy tháng này
      const [existing] = await db.execute<{ id: string }>(
        sql`SELECT id FROM month_end_forecast_runs
            WHERE tenant_id = ${tenant.id}
              AND fiscal_year = ${fiscalYear}
              AND fiscal_month = ${adjustedMonth}
            LIMIT 1`
      );
      if (existing) {
        console.log(JSON.stringify({
          level: "info",
          msg: "scheduled.replenishment.skipped",
          tenantId: tenant.id,
          reason: "already run this month",
        }));
        continue;
      }

      // Gọi runForecast với saveAsPR=true (scheduled = auto-create PR)
      const result = await runForecast(
        env.DATABASE_URL,
        tenant.id,
        {
          fiscalMonth: adjustedMonth,
          fiscalYear,
          asOfDate,
          saveAsPurchaseRequest: true,
          notes: `[AUTO] Scheduled run on ${triggeredAt}`,
        },
        // system user (null vì cron không có user context)
        // createTable tạo createdBy null OK
        null as unknown as string,
        true // saveAsPR
      );

      // Save run history
      await db.execute(
        sql`INSERT INTO month_end_forecast_runs
            (tenant_id, run_type, fiscal_year, fiscal_month, as_of_date, status,
             warehouse_count, product_count, total_estimated_value, created_purchase_request_ids)
            VALUES (${tenant.id}, 'SCHEDULED', ${fiscalYear}, ${adjustedMonth}, ${asOfDate},
                    'COMPLETED', ${result.warehouseCount}, ${result.productCount},
                    ${result.totalEstimatedValue}, ${JSON.stringify(result.createdPurchaseRequestIds)}::jsonb)`
      );

      successCount++;
      console.log(JSON.stringify({
        level: "info",
        msg: "scheduled.replenishment.tenant_done",
        tenantId: tenant.id,
        warehouseCount: result.warehouseCount,
        productCount: result.productCount,
        totalEstimatedValue: result.totalEstimatedValue,
        prCount: result.createdPurchaseRequestIds.length,
      }));
    } catch (err) {
      failCount++;
      console.error(JSON.stringify({
        level: "error",
        msg: "scheduled.replenishment.tenant_failed",
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  console.log(JSON.stringify({
    level: "info",
    msg: "scheduled.replenishment.complete",
    successCount,
    failCount,
    totalTenants: tenants.length,
  }));
}
