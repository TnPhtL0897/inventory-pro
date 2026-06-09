// Supabase Edge Function: auth-me
// Returns current user info from JWT + their tenant + roles
// Replaces: GET /api/v1/auth/me (C# AuthController)
//
// Deploy: supabase functions deploy auth-me
// Invoke: GET /functions/v1/auth-me  (with Authorization: Bearer <jwt>)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Create client with user's JWT (RLS applies)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });

    // Get user from JWT
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Invalid or expired token" }, 401);
    }

    // Read profile from users table (RLS-scoped)
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("id, tenant_id, email, full_name, is_active")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: "User profile not found" }, 404);
    }

    if (!profile.is_active) {
      return json({ error: "User is inactive" }, 403);
    }

    // Read roles for this user
    const { data: roleLinks, error: roleErr } = await supabase
      .from("user_roles")
      .select("role_id, branch_id, roles(code, name)")
      .eq("user_id", user.id);

    if (roleErr) {
      return json({ error: "Failed to load roles" }, 500);
    }

    const roles = (roleLinks ?? []).map((r: any) => ({
      code: r.roles?.code,
      name: r.roles?.name,
      branch_id: r.branch_id,
    }));

    return json({
      id: profile.id,
      tenant_id: profile.tenant_id,
      email: profile.email,
      full_name: profile.full_name,
      roles,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
