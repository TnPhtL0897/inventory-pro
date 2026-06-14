// Supabase Edge Function: check-lot-expirations
// Cron job (06:00 sáng hàng ngày) - quét lots sắp hết hạn 30/15/7 ngày + tạo lot_alerts
//
// Deploy: supabase functions deploy check-lot-expirations --no-verify-jwt
// Schedule:
//   SELECT cron.schedule('check-lot-expirations', '0 6 * * *',
//     $$ SELECT net.http_post(
//          url := '<SUPABASE_URL>/functions/v1/check-lot-expirations',
//          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
//        ) $$);

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface ExpirationAlert {
  lot_id: string;
  alert_type: string;
  alert_level: string;
  message: string;
}

serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  console.log("[check-lot-expirations] Running cron job at", new Date().toISOString());

  const sb = serviceClient();

  try {
    // Lấy danh sách alerts từ RPC
    const { data: alerts, error: alertsErr } = await sb.rpc("fn_check_lot_expirations");
    if (alertsErr) {
      console.error("[check-lot-expirations] RPC error:", alertsErr);
      return Response.json(
        { success: false, error: alertsErr.message },
        { status: 500 }
      );
    }

    const alertList = (alerts ?? []) as ExpirationAlert[];
    console.log(`[check-lot-expirations] Found ${alertList.length} alerts`);

    if (alertList.length === 0) {
      return Response.json({ success: true, total_alerts: 0, inserted: 0, run_at: new Date().toISOString() });
    }

    // OPTIMIZE Fix Issue #4: bulk fetch lot_tenant + check existing + bulk insert
    const lotIds = alertList.map((a) => a.lot_id);

    // 1 query: lấy tenant_id cho tất cả lots
    const { data: lots, error: lotsErr } = await sb
      .from("lots")
      .select("id, tenant_id")
      .in("id", lotIds);
    if (lotsErr) throw lotsErr;
    const lotMap = new Map(((lots ?? []) as any[]).map((l) => [l.id, l.tenant_id]));

    // 1 query: check existing alerts (idempotent)
    const { data: existingAlerts } = await sb
      .from("lot_alerts")
      .select("lot_id")
      .eq("alert_type", "EXPIRING_SOON")
      .eq("resolved", false)
      .in("lot_id", lotIds);
    const existingSet = new Set(((existingAlerts ?? []) as any[]).map((a) => a.lot_id));

    // Bulk insert (chỉ insert những lot chưa có alert)
    const toInsert = alertList
      .filter((a) => !existingSet.has(a.lot_id))
      .map((a) => {
        const tenantId = lotMap.get(a.lot_id);
        if (!tenantId) return null;
        return {
          tenant_id: tenantId,
          lot_id: a.lot_id,
          alert_type: a.alert_type,
          alert_level: a.alert_level,
          message: a.message,
        };
      })
      .filter(Boolean) as any[];

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insertErr } = await sb.from("lot_alerts").insert(toInsert);
      if (!insertErr) inserted = toInsert.length;
    }

    const skipped = alertList.length - inserted;
    console.log(`[check-lot-expirations] Inserted ${inserted} alerts, skipped ${skipped} duplicates`);

    return Response.json({
      success: true,
      total_alerts: alertList.length,
      inserted,
      skipped,
      run_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[check-lot-expirations] Unexpected error:", err);
    return Response.json(
      { success: false, error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
});
