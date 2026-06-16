// Supabase Edge Function: fefo-override
// Ghi audit log khi thủ kho chọn lô khác FEFO (có lý do)
//
// POST /functions/v1/fefo-override
// Body: {
//   product_id, warehouse_id, requested_quantity,
//   actual_lot_id,
//   override_reason: 'FEFO_INSUFFICIENT' | 'FEFO_EXPIRED_SOON' | ...,
//   override_description: 'L001 chỉ còn 5, không đủ cho 10',
//   document_type?, document_id?, document_number?
// }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface OverrideRequest {
  product_id: string;
  warehouse_id: string;
  requested_quantity: number;
  actual_lot_id: string;
  override_reason:
    | "FEFO_INSUFFICIENT"
    | "FEFO_EXPIRED_SOON"
    | "FEFO_RECALLED"
    | "EMERGENCY"
    | "NO_OTHER_LOT"
    | "OTHER";
  override_description: string;
  document_type?: string;
  document_id?: string;
  document_number?: string;
}

const VALID_REASONS = [
  "FEFO_INSUFFICIENT",
  "FEFO_EXPIRED_SOON",
  "FEFO_RECALLED",
  "EMERGENCY",
  "NO_OTHER_LOT",
  "OTHER",
];

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body: OverrideRequest = await req.json();

    // Validate
    if (
      !body.product_id ||
      !body.warehouse_id ||
      !body.requested_quantity ||
      !body.actual_lot_id ||
      !body.override_reason ||
      !body.override_description
    ) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!VALID_REASONS.includes(body.override_reason)) {
      return Response.json(
        { error: `Invalid override_reason. Must be one of: ${VALID_REASONS.join(", ")}` },
        { status: 400 }
      );
    }

    // Description tối thiểu 10 ký tự (đủ ý nghĩa)
    if (body.override_description.trim().length < 10) {
      return Response.json(
        { error: "override_description phải có ít nhất 10 ký tự" },
        { status: 400 }
      );
    }

    // Nếu dùng lô EXPIRED → mô tả phải > 50 ký tự
    const sb = serviceClient();

    const { data: lot, error: lotErr } = await sb
      .from("lots")
      .select("status, lot_number, expiration_date, tenant_id")
      .eq("id", body.actual_lot_id)
      .single();

    if (lotErr || !lot) {
      return Response.json({ error: "Lot not found" }, { status: 404 });
    }

    if (lot.status === "EXPIRED" && body.override_description.trim().length < 50) {
      return Response.json(
        { error: "Dùng lô HẾT HẠN cần mô tả chi tiết >= 50 ký tự" },
        { status: 400 }
      );
    }

    // Set tenant context
    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: lot.tenant_id,
      is_local: false,
    });

    // Ghi audit log
    const { data: auditId, error: auditErr } = await sb.rpc("fn_record_fefo_pick", {
      p_product_id: body.product_id,
      p_warehouse_id: body.warehouse_id,
      p_requested_quantity: body.requested_quantity,
      p_actual_lot_id: body.actual_lot_id,
      p_document_type: body.document_type ?? null,
      p_document_id: body.document_id ?? null,
      p_document_number: body.document_number ?? null,
      p_override_reason: body.override_reason,
      p_override_description: body.override_description,
    });

    if (auditErr) {
      console.error("[fefo-override] RPC error:", auditErr);
      return Response.json({ error: auditErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      audit_id: auditId,
      audit_level: lot.status === "EXPIRED" ? "CRITICAL" : "WARNING",
      message:
        lot.status === "EXPIRED"
          ? "🔴 Đã ghi audit log CRITICAL — DEPT_HEAD sẽ nhận cảnh báo ngay"
          : "⚠️ Đã ghi audit log override",
    });
  } catch (err) {
    console.error("[fefo-override] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
