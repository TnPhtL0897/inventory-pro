/**
 * Cloudflare Worker - Quản kho API
 * Hono + Drizzle + Supabase Postgres + RLS + JWT auth
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { productsRoute } from "./routes/products";
import { categoriesRoute } from "./routes/categories";
import { unitsRoute } from "./routes/units";
import { branchesRoute } from "./routes/branches";
import { warehousesRoute } from "./routes/warehouses";
import { locationsRoute } from "./routes/locations";
import { partiesRoute } from "./routes/parties";
import { stockRoute } from "./routes/stock";
import { stockIssuesRoute } from "./routes/stock-issues";
import { stockTransfersRoute } from "./routes/stock-transfers";
import { stockTakesRoute } from "./routes/stock-takes";
import { purchaseOrdersRoute } from "./routes/purchasing";
import { goodsReceiptsRoute } from "./routes/goods-receipts";
import {
  bidPlansRoute, bidPackagesRoute, bidLotsRoute, bidContractsRoute, purchaseRequestsRoute,
} from "./routes/bidding";
import { replenishmentRoute } from "./routes/replenishment";
import { requireAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { rateLimit } from "./middleware/rate-limit";
import { errorHandler } from "./errors";
import { handleScheduled } from "./scheduled";
import { createDb } from "./db";
import type { AppContext, Bindings } from "./types";

const app = new Hono<AppContext>();

// =============================================================================
// Global middleware (apply to all routes)
// =============================================================================

// 1. CORS (must be first)
app.use(
  "*",
  cors({
    origin: [
      "https://quankho.pages.dev",
      "https://inventory-pro-web-letanphatptt-9690s-projects.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    credentials: true,
    exposeHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  })
);

// 2. Request logger (set requestId, log start/end)
app.use("*", requestLogger);

// 3. Rate limit (per IP + per user)
app.use("*", rateLimit);

// 4. 404
app.notFound((c) =>
  c.json(
    {
      error: "NOT_FOUND",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      requestId: c.get("requestId"),
    },
    404
  )
);

// 5. Error handler
app.onError(errorHandler);

// =============================================================================
// Public routes (no auth)
// =============================================================================

// Health check
app.route("/health", health);

// Root info
app.get("/", (c) =>
  c.json({
    name: "quankho-api",
    version: "0.2.0",
    runtime: "cloudflare-workers",
    docs: "/health",
  })
);

// =============================================================================
// Protected routes (require JWT)
// =============================================================================

// /api/v1/* - all require auth
app.use("/api/*", requireAuth);

// Per-request DB connection (fix I/O isolation issue in CF Workers)
// Don't call client.end() — CF Workers GC connections on isolate death.
// Calling end() too early causes "write CONNECTION_ENDED" errors.
app.use("/api/*", async (c, next) => {
  const { db } = createDb(c.env.DATABASE_URL);
  c.set("db", db);
  await next();
});

// Mount modules
app.route("/api/v1/products", productsRoute);
app.route("/api/v1/categories", categoriesRoute);
app.route("/api/v1/units", unitsRoute);
app.route("/api/v1/branches", branchesRoute);
app.route("/api/v1/warehouses", warehousesRoute);
app.route("/api/v1/locations", locationsRoute);
app.route("/api/v1/parties", partiesRoute);
app.route("/api/v1/stock", stockRoute);
app.route("/api/v1/stock-issues", stockIssuesRoute);
app.route("/api/v1/stock-transfers", stockTransfersRoute);
app.route("/api/v1/stock-takes", stockTakesRoute);
app.route("/api/v1/purchase-orders", purchaseOrdersRoute);
app.route("/api/v1/goods-receipts", goodsReceiptsRoute);
app.route("/api/v1/bid-plans", bidPlansRoute);
app.route("/api/v1/bid-packages", bidPackagesRoute);
app.route("/api/v1/bid-lots", bidLotsRoute);
app.route("/api/v1/bid-contracts", bidContractsRoute);
app.route("/api/v1/purchase-requests", purchaseRequestsRoute);
app.route("/api/v1/replenishment", replenishmentRoute);

// =============================================================================
// TEMPORARY: Admin endpoint để apply migrations từ Worker
// XÓA SAU KHI MIGRATIONS DONE
// =============================================================================
app.post("/admin/migrate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const key = body.key as string;
  if (key !== "MIGRATE_2026_06_21") {
    return c.json({ error: "FORBIDDEN", message: "Invalid migration key" }, 403);
  }
  const sql = body.sql as string;
  if (!sql) {
    return c.json({ error: "VALIDATION_ERROR", message: "sql required" }, 400);
  }

  // Per-request connection (avoid CF Workers I/O isolation issue)
  const { createDb } = await import("./db");
  const { db, client } = createDb(c.env.DATABASE_URL);
  try {
    // Use client.unsafe() for raw multi-statement SQL (handles DO $$ blocks correctly)
    const result = await client.unsafe(sql);
    const rowCount = Array.isArray(result) ? result.length : 0;
    return c.json({ success: true, message: "Migration applied", rowCount });
  } catch (err) {
    return c.json({
      error: "MIGRATION_FAILED",
      message: err instanceof Error ? err.message : String(err),
      detail: (err as { detail?: string })?.detail,
      code: (err as { code?: string })?.code,
    }, 500);
  } finally {
    await client.end();
  }
});

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Bindings>;
