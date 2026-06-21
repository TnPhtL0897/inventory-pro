/**
 * Rate limiting middleware (in-memory, per Worker isolate)
 *
 * - Limit theo IP (cho anon requests) + user_id (cho auth requests)
 * - In-memory Map (per isolate - KHÔNG share giữa các isolate)
 * - 100 req/min per IP, 1000 req/min per user
 * - Headers: X-RateLimit-Limit / Remaining / Reset
 *
 * Lưu ý: Production scale nên dùng CF KV / Durable Objects.
 * Hiện tại đủ cho < 10k req/ngày.
 */

import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types";

const WINDOW_MS = 60_000; // 1 minute
const IP_LIMIT = 100;
const USER_LIMIT = 1000;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Cleanup expired buckets mỗi 5 phút (in-memory, không cần timer chính xác)
const CLEANUP_INTERVAL = 5 * 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

function check(key: string, limit: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  cleanup();
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  existing.count++;
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

export const rateLimit = createMiddleware<AppContext>(async (c, next) => {
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";
  const user = c.get("user");

  // Check IP limit (always)
  const ipResult = check(`ip:${ip}`, IP_LIMIT);
  c.header("X-RateLimit-Limit", String(IP_LIMIT));
  c.header("X-RateLimit-Remaining", String(ipResult.remaining));
  c.header(
    "X-RateLimit-Reset",
    String(Math.ceil(ipResult.resetAt / 1000))
  );

  if (!ipResult.allowed) {
    return c.json(
      {
        error: "RATE_LIMITED",
        message: `Too many requests from IP. Limit: ${IP_LIMIT}/min`,
        retryAfter: Math.ceil((ipResult.resetAt - Date.now()) / 1000),
        requestId: c.get("requestId"),
      },
      429
    );
  }

  // Check user limit (nếu có user)
  if (user) {
    const userResult = check(`user:${user.id}`, USER_LIMIT);
    c.header("X-RateLimit-User-Limit", String(USER_LIMIT));
    c.header("X-RateLimit-User-Remaining", String(userResult.remaining));

    if (!userResult.allowed) {
      return c.json(
        {
          error: "RATE_LIMITED",
          message: `Too many requests from user. Limit: ${USER_LIMIT}/min`,
          retryAfter: Math.ceil((userResult.resetAt - Date.now()) / 1000),
          requestId: c.get("requestId"),
        },
        429
      );
    }
  }

  await next();
});
