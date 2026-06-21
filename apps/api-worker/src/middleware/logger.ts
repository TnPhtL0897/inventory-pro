/**
 * Structured JSON logging middleware
 *
 * - Generate request_id (UUID-like) cho mỗi request
 * - Log request/response với method, path, status, duration, user_id, tenant_id
 * - Replace hono/logger default với format dễ parse (JSON lines)
 */

import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types";

/**
 * Generate unique request ID. Không dùng crypto.randomUUID() vì cần
 * tương thích với Workers runtime.
 */
function generateRequestId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

export const requestLogger = createMiddleware<AppContext>(async (c, next) => {
  // Set request ID (hoặc dùng X-Request-Id từ upstream)
  const incomingId = c.req.header("X-Request-Id");
  const requestId = incomingId ?? generateRequestId();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";

  // Log request start (chỉ ở debug level - skip ở prod để giảm noise)
  const logLevel = c.env.LOG_LEVEL ?? "info";
  if (logLevel === "debug") {
    console.log(
      JSON.stringify({
        level: "debug",
        request_id: requestId,
        msg: "request.start",
        method,
        path,
        ip,
      })
    );
  }

  await next();

  // Log request complete
  const duration = Date.now() - start;
  const status = c.res.status;
  const user = c.get("user");

  const logEntry = {
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    request_id: requestId,
    msg: "request.complete",
    method,
    path,
    status,
    duration_ms: duration,
    ip,
    user_id: user?.id,
    tenant_id: user?.tenantId,
  };

  console.log(JSON.stringify(logEntry));
});
