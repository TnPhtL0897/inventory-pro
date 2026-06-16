/**
 * Cloudflare Worker - Quản kho API
 * Hono + Drizzle + Supabase Postgres + RLS + JWT auth
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { health } from "./routes/health";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  DATABASE_URL: string;
  LOG_LEVEL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "https://quankho.pages.dev",
      "https://inventory-pro-web-letanphatptt-9690s-projects.vercel.app",
      "http://localhost:3000", // dev
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Health check (no auth)
app.route("/health", health);

// Root
app.get("/", (c) =>
  c.json({
    name: "quankho-api",
    version: "0.1.0",
    runtime: "cloudflare-workers",
    docs: "/health",
  })
);

// 404
app.notFound((c) =>
  c.json({ error: "Not Found", path: c.req.path }, 404)
);

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err instanceof Error ? err.message : "Unknown error",
    },
    500
  );
});

export default app;
