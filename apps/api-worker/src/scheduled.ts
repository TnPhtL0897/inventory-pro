/**
 * Scheduled handler - chạy bởi CF Cron Triggers
 *
 * Patterns (từ wrangler.toml):
 * - "0 2 25 * *" = 02:00 ngày 25 hàng tháng → Replenishment auto-run
 * - "0 3 * * 0" = 03:00 Chủ nhật → Stock expiry check
 *
 * Lưu ý: handler này KHÔNG có auth context (cron không có JWT).
 * Cần dùng SERVICE_ROLE_KEY để bypass RLS, hoặc gọi SQL functions trực tiếp.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import type { Bindings } from "./types";

export async function handleScheduled(
  event: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  const cron = event.cron;
  console.log(JSON.stringify({
    level: "info",
    msg: "scheduled.trigger",
    cron,
    scheduledTime: new Date(event.scheduledTime).toISOString(),
  }));

  ctx.waitUntil(runScheduledTask(cron, env));
}

async function runScheduledTask(cron: string, env: Bindings): Promise<void> {
  try {
    if (cron === "0 2 25 * *") {
      // 25 hàng tháng: Replenishment cho tháng tiếp theo
      await runScheduledReplenishment(env);
    } else if (cron === "0 3 * * 0") {
      // Chủ nhật: Stock expiry check
      await runScheduledExpiryCheck(env);
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
// 25 hàng tháng: Replenishment auto-run
// =============================================================================
async function runScheduledReplenishment(env: Bindings): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  const now = new Date();
  const fiscalMonth = now.getMonth() + 1; // 1..12 (current month)
  const fiscalYear = now.getFullYear();

  // Tìm tất cả tenants active
  const tenants = await db.execute<{ id: string }>(sql`SELECT id FROM tenants WHERE is_active = true`);

  for (const tenant of tenants) {
    try {
      // Gọi lại logic forecast + save PR (giống POST /replenishment/run)
      // TODO: extract runForecast thành reusable function
      // Tạm thời chỉ log
      console.log(JSON.stringify({
        level: "info",
        msg: "scheduled.replenishment.tenant_skipped",
        tenantId: tenant.id,
        fiscalMonth,
        fiscalYear,
        note: "Scheduled replenishment chưa wired - dùng POST /replenishment/run manually",
      }));
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        msg: "scheduled.replenishment.tenant_failed",
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }
}

// =============================================================================
// Chủ nhật: Stock expiry check
// =============================================================================
async function runScheduledExpiryCheck(env: Bindings): Promise<void> {
  const db = getDb(env.DATABASE_URL);

  // Tìm lots sắp expire trong 30 ngày
  const expiring = await db.execute<{ tenant_id: string; count: number }>(sql`
    SELECT tenant_id, COUNT(*)::int as count
    FROM lots
    WHERE status = 'ACTIVE'
      AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    GROUP BY tenant_id
  `);

  for (const row of expiring) {
    console.log(JSON.stringify({
      level: "info",
      msg: "scheduled.expiry.tenant_alert",
      tenantId: row.tenant_id,
      expiringCount: row.count,
    }));
  }
}
