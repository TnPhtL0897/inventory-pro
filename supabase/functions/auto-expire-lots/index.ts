// Supabase Edge Function: auto-expire-lots
// Cron job (00:30 sáng hàng ngày) - auto EXPIRED lô hết hạn + tạo DisposalRequest
//
// Deploy: supabase functions deploy auto-expire-lots --no-verify-jwt
// Schedule (Supabase Dashboard → Database → Cron Jobs):
//   SELECT cron.schedule('auto-expire-lots', '30 0 * * *',
//     $$ SELECT net.http_post(
//          url := '<SUPABASE_URL>/functions/v1/auto-expire-lots',
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

serve(async (req: Request) => {
  // Cho phép cả GET (test) và POST (cron)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  console.log("[auto-expire-lots] Running cron job at", new Date().toISOString());

  const sb = serviceClient();

  try {
    // Gọi function fn_auto_expire_lots
    const { data, error } = await sb.rpc("fn_auto_expire_lots");

    if (error) {
      console.error("[auto-expire-lots] RPC error:", error);
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const result = data?.[0] ?? { total_expired: 0, total_disposal_created: 0 };
    console.log("[auto-expire-lots] Result:", result);

    return Response.json({
      success: true,
      total_expired: result.total_expired,
      total_disposal_created: result.total_disposal_created,
      run_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[auto-expire-lots] Unexpected error:", err);
    return Response.json(
      { success: false, error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
});
