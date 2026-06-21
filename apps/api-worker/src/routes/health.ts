/**
 * Health check endpoint
 * GET /health - basic
 * GET /health/db - check DB connection (per-request connection)
 */

import { Hono } from "hono";
import { createDb } from "../db";
import type { AppContext } from "../types";

export const health = new Hono<AppContext>();

health.get("/", (c) =>
  c.json({
    status: "ok",
    runtime: "cloudflare-workers",
    timestamp: new Date().toISOString(),
  })
);

health.get("/db", async (c) => {
  const { db, client } = createDb(c.env.DATABASE_URL);
  try {
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
  } finally {
    await client.end();
  }
});
