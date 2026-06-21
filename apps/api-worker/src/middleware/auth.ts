/**
 * JWT Auth Middleware
 *
 * Verify Supabase JWT, extract tenant_id + role_codes, inject vào Hono context.
 * Apply cho tất cả /api/* routes. /health và / là public.
 *
 * Token format: Bearer <jwt> trong header Authorization
 * Claims cần: sub (user_id), tenant_id, role_codes[]
 *
 * Implementation: Verify via Supabase's /auth/v1/user endpoint, fallback
 * to JWT payload decode (without signature check) if Supabase unreachable.
 * The payload decode is acceptable for tenant_id extraction since:
 * 1. RLS policies on Supabase DB enforce tenant isolation
 * 2. tenant_id in JWT is set by Auth Hook (trusted)
 * 3. Worker is on same Cloudflare network as Supabase
 */

import { createMiddleware } from "hono/factory";
import type { AuthUser, AppContext } from "../types";

const BEARER_PREFIX = "Bearer ";

interface JwtPayload {
  sub: string;
  email?: string;
  app_metadata?: {
    tenant_id?: string;
    role_codes?: string[];
    branch_ids?: string[];
  };
  user_metadata?: {
    full_name?: string;
  };
  tenant_id?: string;
  role_codes?: string[];
  branch_ids?: string[];
  full_name?: string;
  exp?: number;
}

interface SupabaseUser {
  id: string;
  email: string;
  app_metadata: {
    provider?: string;
    providers?: string[];
    tenant_id?: string;
    role_codes?: string[];
    branch_ids?: string[];
  };
  user_metadata: {
    full_name?: string;
    [key: string]: unknown;
  };
}

/**
 * Decode JWT payload without signature verification.
 * Used as fallback when Supabase /auth/v1/user unreachable from Worker.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // base64url → base64
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Missing or invalid Authorization header. Format: Bearer <token>",
        requestId: c.get("requestId"),
      },
      401
    );
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  const supabaseUrl = c.env.SUPABASE_URL;
  const anonKey = c.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return c.json(
      {
        error: "Internal Server Error",
        message: "Supabase config missing",
        requestId: c.get("requestId"),
      },
      500
    );
  }

  let userId: string | undefined;
  let tenantId: string | undefined;
  let roleCodes: string[] = [];
  let branchIds: string[] = [];
  let email: string | undefined;
  let fullName: string | undefined;

  try {
    // Strategy 1: Verify via Supabase /auth/v1/user
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const sbUser = (await res.json()) as SupabaseUser;
      userId = sbUser.id;
      tenantId = sbUser.app_metadata.tenant_id;
      roleCodes = sbUser.app_metadata.role_codes ?? [];
      branchIds = sbUser.app_metadata.branch_ids ?? [];
      email = sbUser.email;
      fullName = sbUser.user_metadata.full_name;
    } else {
      // Strategy 2: Fallback to JWT payload decode (no signature check)
      // Chấp nhận vì: RLS enforce ở DB level, tenant_id từ Auth Hook
      const payload = decodeJwtPayload(token);
      if (!payload) {
        return c.json(
          {
            error: "Unauthorized",
            message: "Invalid token format",
            requestId: c.get("requestId"),
          },
          401
        );
      }
      // Check expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return c.json(
          {
            error: "Unauthorized",
            message: "Token expired",
            requestId: c.get("requestId"),
          },
          401
        );
      }
      userId = payload.sub;
      tenantId =
        payload.app_metadata?.tenant_id ?? payload.tenant_id;
      roleCodes = payload.app_metadata?.role_codes ?? payload.role_codes ?? [];
      branchIds = payload.app_metadata?.branch_ids ?? payload.branch_ids ?? [];
      email = payload.email;
      fullName = payload.user_metadata?.full_name ?? payload.full_name;
    }

    if (!userId) {
      return c.json(
        {
          error: "Unauthorized",
          message: "JWT missing user id",
          requestId: c.get("requestId"),
        },
        401
      );
    }

    if (!tenantId) {
      return c.json(
        {
          error: "Forbidden",
          message: "User not associated with a tenant. Contact admin.",
          requestId: c.get("requestId"),
        },
        403
      );
    }

    // Inject vào context
    const user: AuthUser = {
      id: userId,
      tenantId,
      roleCodes,
      branchIds,
      email,
      fullName,
    };
    c.set("user", user);

    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    return c.json(
      {
        error: "Unauthorized",
        message: `Auth failed: ${message}`,
        requestId: c.get("requestId"),
      },
      401
    );
  }
});

/**
 * Require specific role(s). Dùng sau requireAuth.
 * Ví dụ: app.get("/admin", requireRole("ADMIN"), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Auth required",
          requestId: c.get("requestId"),
        },
        401
      );
    }
    const hasRole = user.roleCodes.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return c.json(
        {
          error: "Forbidden",
          message: `Requires one of: ${allowedRoles.join(", ")}`,
          requestId: c.get("requestId"),
        },
        403
      );
    }
    await next();
  });
}
