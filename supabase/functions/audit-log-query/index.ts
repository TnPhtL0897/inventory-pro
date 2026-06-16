// Supabase Edge Function: audit-log-query
// Query audit log với filter (table, operation, user, date range) + pagination
//
// POST /functions/v1/audit-log-query
// Body: { table_name?, operation?, user_id?, from_date?, to_date?, page?, page_size? }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface AuditQueryRequest {
  table_name?: string;
  operation?: "INSERT" | "UPDATE" | "DELETE";
  user_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body: AuditQueryRequest = await req.json();

    const sb = serviceClient();

    // Lấy tenant đầu tiên (TODO: lấy từ JWT)
    const { data: tenants, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .limit(1);

    if (tErr || !tenants || tenants.length === 0) {
      return Response.json({ error: "No tenant found" }, { status: 404 });
    }

    // Set tenant context
    await sb.rpc("set_config", {
      setting_name: "app.tenant_id",
      setting_value: tenants[0].id,
      is_local: false,
    });

    const { data: logs, error: qErr } = await sb.rpc("fn_query_audit_log", {
      p_table_name: body.table_name ?? null,
      p_operation: body.operation ?? null,
      p_user_id: body.user_id ?? null,
      p_from_date: body.from_date ?? null,
      p_to_date: body.to_date ?? null,
      p_page: body.page ?? 1,
      p_page_size: body.page_size ?? 50,
    });

    if (qErr) {
      console.error("[audit-log-query] RPC error:", qErr);
      return Response.json({ error: qErr.message }, { status: 500 });
    }

    return Response.json({
      items: logs ?? [],
      page: body.page ?? 1,
      pageSize: body.page_size ?? 50,
    });
  } catch (err) {
    console.error("[audit-log-query] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
