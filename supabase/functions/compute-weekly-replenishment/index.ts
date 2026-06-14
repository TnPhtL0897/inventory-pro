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
    const allResults: ComputeOutput[] = [];

    if (productGroup) {
      // Single product group
      const result = await computeForGroup(sb, productGroup, periodDate, triggerSource);
      allResults.push(result);
    } else {
      // Both groups
      for (const group of ["HOA_CHAT_SINH_PHAM", "VAT_TU_Y_TE"] as const) {
        const result = await computeForGroup(sb, group, periodDate, triggerSource);
        allResults.push(result);
      }
    }

    const totalLines = allResults.reduce((s, r) => s + r.total_lines, 0);
    const totalValue = allResults.reduce((s, r) => s + r.total_estimated_value, 0);
    const totalAlerts = allResults.reduce((s, r) => s + r.alerts_created, 0);

    console.log(
      `[compute-weekly-replenishment] Total: ${totalLines} lines, ${totalValue} VND, ${totalAlerts} alerts`
    );

    return Response.json({
      success: true,
      trigger_source: triggerSource,
      results: allResults,
      summary: {
        total_runs: allResults.length,
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

async function computeForGroup(
  sb: SupabaseClient,
  productGroup: "HOA_CHAT_SINH_PHAM" | "VAT_TU_Y_TE",
  periodDate: string | undefined,
  triggerSource: string,
): Promise<ComputeOutput> {
  // Lấy danh sách tenants (multi-tenant)
  const { data: tenants, error: tenantsErr } = await sb
    .from("tenants")
    .select("id")
    .limit(100);

  if (tenantsErr) throw tenantsErr;

  let totalLines = 0;
  let totalValue = 0;
  let totalAlerts = 0;
  let lastRunId = "";

  for (const tenant of tenants ?? []) {
    const { data, error } = await sb.rpc("fn_compute_weekly_replenishment", {
      p_tenant_id: tenant.id,
      p_product_group: productGroup,
      p_period_date: periodDate ?? null,
      p_trigger_source: triggerSource,
      p_trigger_user_id: null,
    });

    if (error) {
      console.error(
        `[compute-weekly-replenishment] RPC error for tenant ${tenant.id}:`,
        error
      );
      continue;
    }

    if (data && data.length > 0) {
      const row = data[0];
      totalLines += row.total_lines ?? 0;
      totalValue += Number(row.total_estimated_value ?? 0);
      totalAlerts += row.alerts_created ?? 0;
      lastRunId = row.run_id;
    }
  }

  return {
    product_group: productGroup,
    run_id: lastRunId,
    total_lines: totalLines,
    total_estimated_value: totalValue,
    alerts_created: totalAlerts,
  };
}
