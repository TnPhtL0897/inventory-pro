// Supabase Edge Function: invite-user
// Admin tạo user mới + gán role ngay (multi-action: create | add_role | remove_role)
//
// POST /functions/v1/invite-user        → Tạo user mới (email + password tạm + role)
//
// Body: {
//   email, full_name, phone?,
//   global_role_codes?: string[],
//   warehouse_roles?: [{ role_code, branch_id }]
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

interface InviteUserRequest {
  email: string;
  full_name: string;
  phone?: string;
  global_role_codes?: string[];
  warehouse_roles?: Array<{ role_code: string; branch_id: string }>;
}

const DEFAULT_TEMP_PASSWORD = "Welcome@2026"; // user phải đổi lần đầu login

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body: InviteUserRequest = await req.json();

    // Validate
    if (!body.email || !body.full_name) {
      return Response.json(
        { error: "Missing required fields: email, full_name" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return Response.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const sb = serviceClient();

    // Lấy tenant đầu tiên (TODO: từ JWT)
    const { data: tenants, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .limit(1);

    if (tErr || !tenants || tenants.length === 0) {
      return Response.json({ error: "No tenant found" }, { status: 404 });
    }
    const tenantId = tenants[0].id;

    // 1. Tạo user trong auth.users (Supabase Auth)
    const { data: authUser, error: createErr } = await sb.auth.admin.createUser({
      email: body.email,
      password: DEFAULT_TEMP_PASSWORD,
      email_confirm: true, // tự confirm, không cần email
      user_metadata: {
        full_name: body.full_name,
        phone: body.phone ?? null,
      },
    });

    if (createErr) {
      console.error("[invite-user] createUser error:", createErr);
      if (createErr.message?.includes("already")) {
        return Response.json(
          { error: "Email đã tồn tại trong hệ thống" },
          { status: 409 }
        );
      }
      return Response.json({ error: createErr.message }, { status: 500 });
    }

    const userId = authUser.user.id;

    // 2. Insert vào bảng users (nếu có) - skip nếu auth.users là canonical
    // 3. Gán global roles nếu có
    if (body.global_role_codes && body.global_role_codes.length > 0) {
      // Tìm role IDs theo code
      const { data: roles, error: rolesErr } = await sb
        .from("roles")
        .select("id, code")
        .in("code", body.global_role_codes);

      if (rolesErr) {
        console.error("[invite-user] get roles error:", rolesErr);
      } else if (roles && roles.length > 0) {
        const userRoles = roles.map((r) => ({
          user_id: userId,
          role_id: r.id,
          tenant_id: tenantId,
        }));
        const { error: insertErr } = await sb
          .from("user_global_roles")
          .insert(userRoles);

        if (insertErr) {
          console.error("[invite-user] assign global roles error:", insertErr);
        }
      }
    }

    // 4. Gán warehouse roles nếu có
    if (body.warehouse_roles && body.warehouse_roles.length > 0) {
      const roleCodes = body.warehouse_roles.map((r) => r.role_code);
      const { data: wroles } = await sb
        .from("roles")
        .select("id, code")
        .in("code", roleCodes);

      if (wroles && wroles.length > 0) {
        const roleMap = new Map(wroles.map((r) => [r.code, r.id]));

        const assignments = body.warehouse_roles
          .filter((r) => roleMap.has(r.role_code))
          .map((r) => ({
            user_id: userId,
            role_id: roleMap.get(r.role_code)!,
            branch_id: r.branch_id,
            tenant_id: tenantId,
          }));

        if (assignments.length > 0) {
          const { error: wInsertErr } = await sb
            .from("user_warehouse_roles")
            .insert(assignments);

          if (wInsertErr) {
            console.error("[invite-user] assign warehouse roles error:", wInsertErr);
          }
        }
      }
    }

    return Response.json({
      success: true,
      user_id: userId,
      email: body.email,
      full_name: body.full_name,
      temp_password: DEFAULT_TEMP_PASSWORD,
      message: `✅ Đã tạo user ${body.email}. User phải đổi mật khẩu khi đăng nhập lần đầu.`,
    });
  } catch (err) {
    console.error("[invite-user] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
