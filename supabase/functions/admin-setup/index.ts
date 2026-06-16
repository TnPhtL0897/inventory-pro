// Supabase Edge Function: admin-setup
// Tạo admin user + gán role (đúng schema: users, roles, user_roles)
// Multi-action: setup-admin | check-schema

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

interface SetupAdminRequest {
  email: string;
  full_name: string;
  phone?: string;
  role_codes?: string[];
  branch_id?: string;
}

async function setupAdmin(req: SetupAdminRequest): Promise<Response> {
  try {
    const sb = serviceClient();

    // 1. Tạo user (hoặc lấy lại nếu đã tồn tại)
    let userId: string;
    let userExists = false;

    const { data: existingUser } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existingUser?.users?.find((u) => u.email === req.email);

    if (found) {
      userId = found.id;
      userExists = true;
    } else {
      const { data: authUser, error: createErr } = await sb.auth.admin.createUser({
        email: req.email,
        password: "Welcome@2026",
        email_confirm: true,
        user_metadata: {
          full_name: req.full_name,
          phone: req.phone ?? null,
        },
      });
      if (createErr || !authUser.user) {
        return Response.json({ error: createErr?.message ?? "Create user failed" }, { status: 500 });
      }
      userId = authUser.user.id;
    }

    // 2. Update user metadata
    await sb.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: req.full_name, phone: req.phone ?? null },
    });

    // 2.5. Insert row vào public.users (nếu chưa có) - cần cho FK user_roles
    const { data: existingPubUser } = await sb
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingPubUser) {
      // Lấy tenant để insert user
      const { data: tenantsForUser } = await sb.from("tenants").select("id").limit(1);
      const tenantIdForUser = tenantsForUser?.[0]?.id;

      if (tenantIdForUser) {
        await sb.from("users").insert({
          id: userId,
          tenant_id: tenantIdForUser,
          email: req.email,
          full_name: req.full_name,
          phone: req.phone ?? null,
          status: "ACTIVE",
        });
      }
    }

    // 3. Lấy tenant + branch
    const { data: tenants } = await sb.from("tenants").select("id").limit(1);
    const tenantId = tenants?.[0]?.id;
    if (!tenantId) {
      return Response.json({ error: "No tenant found" }, { status: 500 });
    }

    let branchId = req.branch_id;
    if (!branchId) {
      const { data: branches } = await sb
        .from("branches")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1);
      branchId = branches?.[0]?.id;
    }

    // 4. Gán global roles - dùng bảng user_roles thực tế
    const roleCodes = req.role_codes ?? ["ADMIN", "DEPT_HEAD"];

    const { data: roleRows, error: roleErr } = await sb
      .from("roles")
      .select("id, code")
      .in("code", roleCodes);

    if (roleErr || !roleRows) {
      return Response.json({
        success: false,
        user_id: userId,
        warning: `Cannot read roles table: ${roleErr?.message ?? "empty"}`,
      });
    }

    if (roleRows.length === 0) {
      return Response.json({
        success: false,
        user_id: userId,
        warning: "Không tìm thấy role codes nào trong bảng roles",
      });
    }

    // 5. Insert user_roles (KHÔNG có tenant_id - chỉ có user_id, role_id, branch_id)
    const userRoles: Array<Record<string, unknown>> = [];
    for (const role of roleRows) {
      userRoles.push({
        user_id: userId,
        role_id: role.id,
        branch_id: branchId ?? null,
      });
    }

    const { error: assignErr } = await sb
      .from("user_roles")
      .upsert(userRoles, {
        onConflict: "user_id,role_id,branch_id",
        ignoreDuplicates: true,
      });

    if (assignErr) {
      return Response.json({
        success: false,
        user_id: userId,
        warning: `Insert user_roles fail: ${assignErr.message}`,
        role_codes: roleCodes,
      });
    }

    return Response.json({
      success: true,
      user_id: userId,
      email: req.email,
      full_name: req.full_name,
      user_existed: userExists,
      temp_password: userExists ? null : "Welcome@2026",
      roles_assigned: roleCodes,
      role_count: roleRows.length,
      message: userExists
        ? `✅ User đã tồn tại, đã gán thêm ${roleRows.length} role(s)`
        : `✅ Đã tạo user + gán ${roleRows.length} role(s). Mật khẩu tạm: Welcome@2026`,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

async function checkSchema(): Promise<Response> {
  try {
    const sb = serviceClient();

    const checks: Record<string, unknown> = {};

    // Check tables
    for (const table of ["users", "roles", "user_roles", "tenants", "branches"]) {
      const { error } = await sb.from(table).select("id").limit(1);
      checks[table] = error ? `❌ ${error.message}` : "✅ exists";
    }

    // List roles
    const { data: roles } = await sb.from("roles").select("id, code, name").limit(20);
    checks["__roles__"] = roles;

    // List users
    const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 10 });
    checks["__users__"] = users?.map((u) => ({
      email: u.email,
      full_name: u.user_metadata?.full_name,
      created_at: u.created_at,
    }));

    return Response.json(checks);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const action = url.pathname.endsWith("/check-schema")
    ? "check-schema"
    : url.pathname.endsWith("/setup-admin")
    ? "setup-admin"
    : null;

  try {
    const body = await req.json().catch(() => ({}));

    if (action === "check-schema") {
      return await checkSchema();
    }

    if (action === "setup-admin") {
      if (!body.email || !body.full_name) {
        return Response.json(
          { error: "Missing required fields: email, full_name" },
          { status: 400 }
        );
      }
      return await setupAdmin(body as SetupAdminRequest);
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
