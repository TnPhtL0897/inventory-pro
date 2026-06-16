/**
 * Health check endpoint
 * GET /health - basic
 * GET /health/db - check DB connection
 */

import { Hono } from "hono";
import { getDb } from "../db";

type Bindings = {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  LOG_LEVEL: string;
};

export const health = new Hono<{ Bindings: Bindings }>();

health.get("/", (c) =>
  c.json({
    status: "ok",
    runtime: "cloudflare-workers",
    timestamp: new Date().toISOString(),
  })
);

health.get("/db", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const result = await db.execute("SELECT 1 as ok");
    return c.json({
      status: "ok",
      db: "connected",
      result,
    });
  } catch (err) {
    return c.json(
      {
        status: "error",
        db: "disconnected",
        error: err instanceof Error ? err.message : "Unknown",
      },
      503
    );
  }
});
