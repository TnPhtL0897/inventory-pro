// Supabase Edge Function: fefo-pick
// Auto-pick lô theo FEFO mở rộng (open-vial trước → expiration_date sớm nhất)
// Plus: Compliance report cho DEPT_HEAD
//
// Routes (single function, multi-action):
//   POST /functions/v1/fefo-pick           → Auto-pick
//   POST /functions/v1/fefo-pick/compliance → Compliance report
//
// Body pick: { product_id, warehouse_id, quantity, document_type?, document_id?, document_number? }
// Body compliance: { year, month }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface PickRequest {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  document_type?: string;
  document_id?: string;
  document_number?: string;
}

interface PickRow {
  lot_id: string;
  lot_number: string;
  expiration_date: string;
  open_vial_expiration_date: string | null;
  is_open_vial: boolean;
  available_quantity: number;
  pick_order: number;
  pick_reason: string;
}

async function handlePick(req: Request): Promise<Response> {
  try {
    const body: PickRequest = await req.json();

    // Validate
    if (!body.product_id || !body.warehouse_id || !body.quantity) {
      return Response.json(
        { error: "Missing required fields: product_id, warehouse_id, quantity" },
        { status: 400 }
      );
    }

    if (body.quantity <= 0) {
      return Response.json({ error: "Quantity must be > 0" }, { status: 400 });
    }

    const sb = serviceClient();

    // Lấy tenant_id từ warehouse
    const { data: wh, error: whErr } = await sb
      .from("warehouses")
      .select("tenant_id")
      .eq("id", body.warehouse_id)
      .single();

    if (whErr || !wh) {
      return Response.json({ error: "Warehouse not found" }, { status: 404 });
    }

    // Set app.tenant_id cho RLS
    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: wh.tenant_id,
      is_local: false,
    });

    // Gọi fn_pick_lot_fefo
    const { data: picks, error: pickErr } = await sb.rpc("fn_pick_lot_fefo", {
      p_product_id: body.product_id,
      p_warehouse_id: body.warehouse_id,
      p_quantity: body.quantity,
    });

    if (pickErr) {
      console.error("[fefo-pick] RPC error:", pickErr);
      return Response.json({ error: pickErr.message }, { status: 500 });
    }

    const rows: PickRow[] = (picks ?? []) as PickRow[];
    const realPicks = rows.filter((r) => r.lot_id !== null);
    const insufficientRow = rows.find((r) => r.lot_id === null);

    const totalPicked = realPicks.reduce(
      (sum, r) => sum + Number(r.available_quantity),
      0
    );
    const shortage = insufficientRow
      ? Number(insufficientRow.available_quantity)
      : 0;

    // Cảnh báo lô sắp hết hạn (< 7 ngày)
    const warnings: string[] = [];
    for (const p of realPicks) {
      const expirationDate = p.open_vial_expiration_date || p.expiration_date;
      const daysLeft = Math.floor(
        (new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft < 7) {
        warnings.push(
          `⚠️ Lô ${p.lot_number} ${p.is_open_vial ? "(open-vial)" : ""} còn ${daysLeft} ngày`
        );
      }
    }

    return Response.json({
      picks: realPicks.map((p) => ({
        lot_id: p.lot_id,
        lot_number: p.lot_number,
        expiration_date: p.expiration_date,
        open_vial_expiration_date: p.open_vial_expiration_date,
        is_open_vial: p.is_open_vial,
        pick_quantity: Number(p.available_quantity),
        pick_order: p.pick_order,
        pick_reason: p.pick_reason,
      })),
      total_requested: body.quantity,
      total_picked: totalPicked,
      shortage,
      is_sufficient: shortage === 0,
      warnings,
    });
  } catch (err) {
    console.error("[fefo-pick] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function handleComplianceReport(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { year?: number; month?: number };

    if (!body.year || !body.month) {
      return Response.json(
        { error: "Missing required fields: year, month" },
        { status: 400 }
      );
    }

    const sb = serviceClient();

    // Lấy tenant đầu tiên (giả định DEPT_HEAD xem báo cáo của tenant mình)
    // TODO: lấy từ JWT khi integrate với Auth
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

    const { data: report, error: rErr } = await sb.rpc(
      "fn_fefo_compliance_report",
      {
        p_tenant_id: tenants[0].id,
        p_year: body.year,
        p_month: body.month,
      }
    );

    if (rErr) {
      console.error("[fefo-pick/compliance] RPC error:", rErr);
      return Response.json({ error: rErr.message }, { status: 500 });
    }

    const row = (Array.isArray(report) ? report[0] : report) as {
      total_picks: number;
      compliant_picks: number;
      override_picks: number;
      expired_picks: number;
      compliance_rate: number;
      override_rate: number;
      top_overridden_products: unknown;
      top_override_users: unknown;
      top_override_reasons: unknown;
    };

    return Response.json({
      totalPicks: Number(row.total_picks),
      compliantPicks: Number(row.compliant_picks),
      overridePicks: Number(row.override_picks),
      expiredPicks: Number(row.expired_picks),
      complianceRate: Number(row.compliance_rate),
      overrideRate: Number(row.override_rate),
      topOverriddenProducts: row.top_overridden_products,
      topOverrideUsers: row.top_override_users,
      topOverrideReasons: row.top_override_reasons,
    });
  } catch (err) {
    console.error("[fefo-pick/compliance] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// Single dispatcher: route by URL path
serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname.endsWith("/compliance")) {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    return handleComplianceReport(req);
  }

  // Default: pick
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  return handlePick(req);
});
