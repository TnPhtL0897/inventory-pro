// Supabase Edge Function: open-vial-action
// Mở nắp lô HC-SP + cập nhật volume
//
// POST /functions/v1/open-vial-action
// Action: "open" | "update-volume"
//   - open: body = { lot_id, quantity_taken, quantity_remaining, notes? }
//   - update-volume: body = { lot_id, quantity_taken }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface OpenVialRequest {
  action: "open" | "update-volume";
  lot_id: string;
  quantity_taken: number;
  quantity_remaining?: number;
  notes?: string;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body: OpenVialRequest = await req.json();

    if (!body.action || !body.lot_id) {
      return Response.json(
        { error: "Missing required fields: action, lot_id" },
        { status: 400 }
      );
    }

    if (body.quantity_taken === undefined || body.quantity_taken < 0) {
      return Response.json(
        { error: "quantity_taken phải >= 0" },
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

    // Set app.tenant_id cho RLS
    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: lot.tenant_id,
      is_local: false,
    });

    if (body.action === "open") {
      if (body.quantity_remaining === undefined) {
        return Response.json(
          { error: "quantity_remaining is required for action=open" },
          { status: 400 }
        );
      }

      const { data: result, error: openErr } = await sb.rpc("fn_open_vial", {
        p_lot_id: body.lot_id,
        p_quantity_taken: body.quantity_taken,
        p_quantity_remaining: body.quantity_remaining,
        p_notes: body.notes ?? null,
      });

      if (openErr) {
        console.error("[open-vial-action/open] RPC error:", openErr);
        return Response.json({ error: openErr.message }, { status: 500 });
      }

      const row = (Array.isArray(result) ? result[0] : result) as {
        history_id: string;
        open_vial_expiration_date: string;
        print_queue_id: string;
      };

      return Response.json({
        success: true,
        action: "open",
        history_id: row.history_id,
        open_vial_expiration_date: row.open_vial_expiration_date,
        print_queue_id: row.print_queue_id,
        message: `🧪 Đã mở nắp lô ${lot.lot_number}. HSD open-vial: ${row.open_vial_expiration_date}. Nhãn sẽ in tự động.`,
      });
    }

    if (body.action === "update-volume") {
      const { data: newRemaining, error: updErr } = await sb.rpc(
        "fn_update_open_vial_volume",
        {
          p_lot_id: body.lot_id,
          p_quantity_taken: body.quantity_taken,
        }
      );

      if (updErr) {
        console.error("[open-vial-action/update-volume] RPC error:", updErr);
        return Response.json({ error: updErr.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        action: "update-volume",
        new_remaining: Number(newRemaining),
        message: `Volume còn lại: ${newRemaining}`,
      });
    }

    return Response.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (err) {
    console.error("[open-vial-action] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
