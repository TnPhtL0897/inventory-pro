import { NextResponse } from "next/server";


/**
 * ⚠ DEV ONLY - Mock login endpoint.
 * Khi deploy production phải XÓA route này + block DEV_BYPASS_AUTH trong middleware.
 *
 * Test users:
 * - admin@inventorypro.vn / admin123
 * - manager@inventorypro.vn / manager123
 * - staff@inventorypro.vn / staff123
 */

const TEST_USERS: Record<string, { password: string; user: Record<string, unknown> }> = {
  "admin@inventorypro.vn": {
    password: "admin123",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@inventorypro.vn",
      full_name: "Admin User",
      role: "ADMIN",
      tenant_id: "00000000-0000-0000-0000-000000000010",
      branch_ids: ["00000000-0000-0000-0000-000000000020"],
    },
  },
  "manager@inventorypro.vn": {
    password: "manager123",
    user: {
      id: "00000000-0000-0000-0000-000000000002",
      email: "manager@inventorypro.vn",
      full_name: "Manager User",
      role: "MANAGER",
      tenant_id: "00000000-0000-0000-0000-000000000010",
      branch_ids: ["00000000-0000-0000-0000-000000000020"],
    },
  },
  "staff@inventorypro.vn": {
    password: "staff123",
    user: {
      id: "00000000-0000-0000-0000-000000000003",
      email: "staff@inventorypro.vn",
      full_name: "Staff User",
      role: "STAFF",
      tenant_id: "00000000-0000-0000-0000-000000000010",
      branch_ids: ["00000000-0000-0000-0000-000000000020"],
    },
  },
};

export async function POST(request: Request) {
  // Chỉ cho phép trong dev
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Email và mật khẩu là bắt buộc" } },
        { status: 400 },
      );
    }

    const entry = TEST_USERS[email.toLowerCase()];
    if (!entry || entry.password !== password) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu không đúng" } },
        { status: 401 },
      );
    }

    // Set dev_session cookie (httpOnly, 24h)
    const session = { user: entry.user, expires_at: Date.now() + 86400_000 };
    const response = NextResponse.json({
      success: true,
      data: { user: entry.user },
    });
    response.cookies.set("dev_session", JSON.stringify(session), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Body không hợp lệ" } },
      { status: 400 },
    );
  }
}
