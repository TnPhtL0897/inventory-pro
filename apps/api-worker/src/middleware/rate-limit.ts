/**
 * Rate limiting middleware (CF KV + in-memory fallback)
 *
 * Production: dùng CF KV (shared across isolates) để rate limit
 * consistent khi Worker scale lên nhiều isolates.
 *
 * Fallback: in-memory Map (per isolate, không share giữa isolates)
 * Dùng khi KV unavailable hoặc dev mode.
 *
 * - 100 req/min per IP
 * - 1000 req/min per user
 * - Headers: X-RateLimit-Limit / Remaining / Reset
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

const memoryBuckets = new Map<string, Bucket>();
const lastCleanup = { ts: 0 };
const CLEANUP_INTERVAL = 5 * 60_000;

function cleanupMemory() {
  const now = Date.now();
  if (now - lastCleanup.ts < CLEANUP_INTERVAL) return;
  lastCleanup.ts = now;
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetAt < now) memoryBuckets.delete(key);
  }
}

async function checkKV(
  kv: KVNamespace | undefined,
  key: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number } | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    const now = Date.now();
    let bucket: Bucket;
    if (raw) {
      bucket = JSON.parse(raw) as Bucket;
      if (bucket.resetAt < now) {
        bucket = { count: 0, resetAt: now + WINDOW_MS };
      }
    } else {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
    }
    bucket.count++;
    if (bucket.count > limit) {
      // Save và return reject
      await kv.put(key, JSON.stringify(bucket), { expirationTtl: 120 });
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }
    await kv.put(key, JSON.stringify(bucket), { expirationTtl: 120 });
    return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
  } catch {
    return null; // KV error → fallback to in-memory
  }
}

function checkMemory(
  key: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupMemory();
  const now = Date.now();
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt < now) {
    const resetAt = now + WINDOW_MS;
    memoryBuckets.set(key, { count: 1, resetAt });
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
  const kv = (c.env as { RATE_LIMIT?: KVNamespace }).RATE_LIMIT;
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";
  const user = c.get("user");

  // Check IP limit
  const ipKv = await checkKV(kv, `ip:${ip}`, IP_LIMIT);
  const ipResult = ipKv ?? checkMemory(`ip:${ip}`, IP_LIMIT);
  c.header("X-RateLimit-Limit", String(IP_LIMIT));
  c.header("X-RateLimit-Remaining", String(ipResult.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(ipResult.resetAt / 1000)));

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
    const userKv = await checkKV(kv, `user:${user.id}`, USER_LIMIT);
    const userResult = userKv ?? checkMemory(`user:${user.id}`, USER_LIMIT);
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
