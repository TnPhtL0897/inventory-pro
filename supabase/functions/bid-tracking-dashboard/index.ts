// Supabase Edge Function: bid-tracking-dashboard
// Multi-action: dashboard | expiring-contracts
//
// POST /functions/v1/bid-tracking-dashboard        → dashboard
// POST /functions/v1/bid-tracking-dashboard/expiring → list expiring contracts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function handleDashboard(): Promise<Response> {
  try {
    const sb = serviceClient();

    const { data: tenants, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .limit(1);

    if (tErr || !tenants || tenants.length === 0) {
      return Response.json({ error: "No tenant found" }, { status: 404 });
    }

    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: tenants[0].id,
      is_local: false,
    });

    const { data: dashboard, error: dErr } = await sb.rpc("fn_bid_contract_dashboard");

    if (dErr) {
      console.error("[bid-tracking-dashboard] RPC error:", dErr);
      return Response.json({ error: dErr.message }, { status: 500 });
    }

    const row = (Array.isArray(dashboard) ? dashboard[0] : dashboard) as {
      total_contracts: number;
      active_contracts: number;
      expiring_30_days: number;
      expiring_60_days: number;
      expiring_90_days: number;
      total_contract_value: number;
      total_used_value: number;
      total_remaining_value: number;
      avg_usage_percent: number;
    };

    return Response.json({
      totalContracts: Number(row.total_contracts),
      activeContracts: Number(row.active_contracts),
      expiring30Days: Number(row.expiring_30_days),
      expiring60Days: Number(row.expiring_60_days),
      expiring90Days: Number(row.expiring_90_days),
      totalContractValue: Number(row.total_contract_value),
      totalUsedValue: Number(row.total_used_value),
      totalRemainingValue: Number(row.total_remaining_value),
      avgUsagePercent: Number(row.avg_usage_percent),
    });
  } catch (err) {
    console.error("[bid-tracking-dashboard] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function handleExpiring(): Promise<Response> {
  try {
    const sb = serviceClient();

    const { data: tenants, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .limit(1);

    if (tErr || !tenants || tenants.length === 0) {
      return Response.json({ error: "No tenant found" }, { status: 404 });
    }

    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: tenants[0].id,
      is_local: false,
    });

    const { data: contracts, error: cErr } = await sb.rpc(
      "fn_list_bid_contracts_expiring"
    );

    if (cErr) {
      console.error("[bid-tracking-dashboard/expiring] RPC error:", cErr);
      return Response.json({ error: cErr.message }, { status: 500 });
    }

    return Response.json({
      items: (contracts ?? []).map((c: any) => ({
        contractId: c.contract_id,
        contractNumber: c.contract_number,
        supplierName: c.supplier_name,
        endDate: c.end_date,
        daysUntilExpiry: Number(c.days_until_expiry),
        alertLevel: c.alert_level,
        totalContractValue: Number(c.total_contract_value),
        usedValue: Number(c.used_value),
        remainingValue: Number(c.remaining_value),
        usagePercent: Number(c.usage_percent),
        message: c.message,
      })),
    });
  } catch (err) {
    console.error("[bid-tracking-dashboard/expiring] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  if (url.pathname.endsWith("/expiring")) {
    return handleExpiring();
  }
  return handleDashboard();
});
