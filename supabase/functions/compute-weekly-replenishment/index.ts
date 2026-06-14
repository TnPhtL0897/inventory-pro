// Supabase Edge Function: compute-weekly-replenishment
// Cron job (08:00 sáng thứ 6) - tạo DRAFT đề xuất bổ sung kho lẻ
//
// Deploy: supabase functions deploy compute-weekly-replenishment --no-verify-jwt
// Schedule (Supabase Dashboard → Database → Cron Jobs):
//   SELECT cron.schedule('compute-weekly-replenishment', '0 8 * * 5',
//     $$ SELECT net.http_post(
//          url := '<SUPABASE_URL>/functions/v1/compute-weekly-replenishment',
//          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
//          body := '{"triggerSource": "CRON"}'::jsonb
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

interface ComputeInput {
  productGroup?: "HOA_CHAT_SINH_PHAM" | "VAT_TU_Y_TE";
  periodDate?: string;
  triggerSource?: "CRON" | "MANUAL";
}

interface ComputeOutput {
  product_group: string;
  run_id: string;
  total_lines: number;
  total_estimated_value: number;
  alerts_created: number;
}

serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const input: ComputeInput = req.method === "POST"
    ? await req.json().catch(() => ({}))
    : {};

  const productGroup = input.productGroup;
  const periodDate = input.periodDate;
  const triggerSource = input.triggerSource ?? "CRON";

  console.log(
    `[compute-weekly-replenishment] Run at ${new Date().toISOString()}, trigger=${triggerSource}, group=${productGroup ?? "ALL"}`
  );

  const sb = serviceClient();

  try {
    // Fix Issue #21: dùng fn_compute_weekly_replenishment_all (multi-tenant + multi-group)
    // thay vì gọi fn_compute_weekly_replenishment N×2 lần
    const { data, error } = await sb.rpc("fn_compute_weekly_replenishment_all", {
      p_period_date: periodDate ?? null,
      p_trigger_source: triggerSource,
      p_trigger_user_id: null,
    });

    if (error) {
      console.error("[compute-weekly-replenishment] RPC error:", error);
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const results: ComputeOutput[] = (data ?? []).map((r: any) => ({
      product_group: r.product_group,
      run_id: r.run_id,
      total_lines: r.total_lines ?? 0,
      total_estimated_value: Number(r.total_estimated_value ?? 0),
      alerts_created: r.alerts_created ?? 0,
    }));

    const totalLines = results.reduce((s, r) => s + r.total_lines, 0);
    const totalValue = results.reduce((s, r) => s + r.total_estimated_value, 0);
    const totalAlerts = results.reduce((s, r) => s + r.alerts_created, 0);

    console.log(
      `[compute-weekly-replenishment] Total: ${totalLines} lines, ${totalValue} VND, ${totalAlerts} alerts`
    );

    return Response.json({
      success: true,
      trigger_source: triggerSource,
      results,
      summary: {
        total_runs: results.length,
        total_lines: totalLines,
        total_estimated_value: totalValue,
        total_alerts: totalAlerts,
      },
      run_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[compute-weekly-replenishment] Error:", err);
    return Response.json(
      { success: false, error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
});
