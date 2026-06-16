// Supabase Edge Function: open-vial-qc
// QC_OFFICER complete QC lại cho lô open-vial quá hạn
//
// POST /functions/v1/open-vial-qc
// Body: {
//   lot_id, qc_method, qc_result, qc_notes,
//   valid_until?, control_normal_lot_id?, control_pathological_lot_id?,
//   attachments?
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

interface QcRetestRequest {
  lot_id: string;
  qc_method: string;
  qc_result: "PASS" | "FAIL" | "PENDING";
  qc_notes: string;
  valid_until?: string;
  control_normal_lot_id?: string;
  control_pathological_lot_id?: string;
  attachments?: unknown[];
}

const VALID_RESULTS = ["PASS", "FAIL", "PENDING"];

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body: QcRetestRequest = await req.json();

    // Validate
    if (!body.lot_id || !body.qc_method || !body.qc_result) {
      return Response.json(
        { error: "Missing required fields: lot_id, qc_method, qc_result" },
        { status: 400 }
      );
    }

    if (!VALID_RESULTS.includes(body.qc_result)) {
      return Response.json(
        { error: `Invalid qc_result. Must be: ${VALID_RESULTS.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.qc_notes.trim().length < 10) {
      return Response.json(
        { error: "qc_notes phải có ít nhất 10 ký tự" },
        { status: 400 }
      );
    }

    const sb = serviceClient();

    // Lấy tenant_id từ lot
    const { data: lot, error: lotErr } = await sb
      .from("lots")
      .select("tenant_id, lot_number")
      .eq("id", body.lot_id)
      .single();

    if (lotErr || !lot) {
      return Response.json({ error: "Lot not found" }, { status: 404 });
    }

    // Set tenant context
    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: lot.tenant_id,
      is_local: false,
    });

    // Gọi fn_complete_open_vial_qc
    const { data: qcRecordId, error: qcErr } = await sb.rpc(
      "fn_complete_open_vial_qc",
      {
        p_lot_id: body.lot_id,
        p_qc_method: body.qc_method,
        p_qc_result: body.qc_result,
        p_qc_notes: body.qc_notes,
        p_valid_until: body.valid_until ?? null,
        p_control_normal_lot_id: body.control_normal_lot_id ?? null,
        p_control_pathological_lot_id: body.control_pathological_lot_id ?? null,
        p_attachments: body.attachments ?? [],
      }
    );

    if (qcErr) {
      console.error("[open-vial-qc] RPC error:", qcErr);
      return Response.json({ error: qcErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      qc_record_id: qcRecordId,
      message:
        body.qc_result === "PASS"
          ? `✅ QC lại PASS cho lô ${lot.lot_number}. Lô có thể tiếp tục sử dụng đến ${body.valid_until ?? "vô thời hạn"}.`
          : body.qc_result === "FAIL"
          ? `🔴 QC lại FAIL cho lô ${lot.lot_number}. Lô đã chuyển sang QC_FAILED, cần hủy.`
          : `⏳ QC lại PENDING cho lô ${lot.lot_number}.`,
    });
  } catch (err) {
    console.error("[open-vial-qc] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
