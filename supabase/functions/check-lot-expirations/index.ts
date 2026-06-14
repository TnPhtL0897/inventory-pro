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
    // Lấy danh sách alerts
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

    // Insert lot_alerts (idempotent: chỉ insert nếu chưa có unresolved)
    let inserted = 0;
    let skipped = 0;
    for (const alert of alertList) {
      // Check đã tồn tại alert chưa resolve chưa
      const { data: existing } = await sb
        .from("lot_alerts")
        .select("id")
        .eq("lot_id", alert.lot_id)
        .eq("alert_type", alert.alert_type)
        .eq("resolved", false)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Lấy tenant_id từ lot
      const { data: lot } = await sb
        .from("lots")
        .select("tenant_id")
        .eq("id", alert.lot_id)
        .single();

      if (!lot) {
        skipped++;
        continue;
      }

      const { error: insertErr } = await sb.from("lot_alerts").insert({
        tenant_id: (lot as any).tenant_id,
        lot_id: alert.lot_id,
        alert_type: alert.alert_type,
        alert_level: alert.alert_level,
        message: alert.message,
      });

      if (!insertErr) inserted++;
    }

    console.log(
      `[check-lot-expirations] Inserted ${inserted} alerts, skipped ${skipped} duplicates`
    );

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
