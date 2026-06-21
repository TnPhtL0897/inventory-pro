/**
 * JWT Auth Middleware
 *
 * Verify Supabase JWT, extract tenant_id + role_codes, inject vào Hono context.
 * Apply cho tất cả /api/* routes. /health và / là public.
 *
 * Token format: Bearer <jwt> trong header Authorization
 * Claims cần: sub (user_id), tenant_id, role_codes[]
 */

import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import type { AuthUser, AppContext } from "../types";

const BEARER_PREFIX = "Bearer ";

export const requireAuth = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Missing or invalid Authorization header. Format: Bearer <token>",
        request_id: c.get("requestId"),
      },
      401
    );
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  const jwtSecret = c.env.SUPABASE_JWT_SECRET;

  if (!jwtSecret) {
    console.error("SUPABASE_JWT_SECRET not set");
    return c.json(
      {
        error: "Internal Server Error",
        message: "Auth misconfigured",
        request_id: c.get("requestId"),
      },
      500
    );
  }

  try {
    // Verify JWT signature
    const secretKey = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    // Extract claims
    const userId = payload.sub;
    const tenantId = (payload as Record<string, unknown>).tenant_id as
      | string
      | undefined;
    const roleCodes = ((payload as Record<string, unknown>).role_codes as
      | string[]
      | undefined) ?? [];
    const branchIds = ((payload as Record<string, unknown>).branch_ids as
      | string[]
      | undefined) ?? [];
    const email = payload.email as string | undefined;
    const fullName = (payload as Record<string, unknown>).full_name as
      | string
      | undefined;

    if (!userId) {
      return c.json(
        {
          error: "Unauthorized",
          message: "JWT missing sub claim",
          request_id: c.get("requestId"),
        },
        401
      );
    }

    if (!tenantId) {
      return c.json(
        {
          error: "Forbidden",
          message: "User not associated with a tenant. Contact admin.",
          request_id: c.get("requestId"),
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
        message: `JWT verification failed: ${message}`,
        request_id: c.get("requestId"),
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
          request_id: c.get("requestId"),
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
          request_id: c.get("requestId"),
        },
        403
      );
    }
    await next();
  });
}
