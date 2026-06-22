/**
 * Stock read endpoints
 *
 * GET /api/v1/stock - paginated stock levels
 * GET /api/v1/stock/by-product/:productId - tất cả vị trí chứa 1 product
 *
 * Stock là materialized view từ stock_movements. KHÔNG cho phép write trực tiếp.
 * Write chỉ qua StockIssues/StockTransfers/StockTakes/GRN.
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";

import { stock } from "../db/schema";
import { listStockQuery } from "../validators/stock";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const stockRoute = new Hono<AppContext>();

stockRoute.get("/", async (c) => {
  const q = listStockQuery.parse(c.req.query());
  const user = c.get("user")!;
  const db = c.get("db")!;

  const conditions: SQL[] = [eq(stock.tenantId, user.tenantId)];
  if (q.branchId) conditions.push(eq(stock.branchId, q.branchId));
  if (q.warehouseId) conditions.push(eq(stock.warehouseId, q.warehouseId));
  if (q.productId) conditions.push(eq(stock.productId, q.productId));
  if (q.lowStockOnly) conditions.push(sql`${stock.quantity} > 0`);

  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stock)
    .where(whereClause);

  const offset = (q.page - 1) * q.pageSize;
  const items = await db
    .select()
    .from(stock)
    .where(whereClause)
    .orderBy(stock.productId)
    .limit(q.pageSize)
    .offset(offset);

  const result: PaginatedResult<unknown> = {
    items,
    total: Number(count),
    page: q.page,
    pageSize: q.pageSize,
  };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

stockRoute.get("/by-product/:productId", async (c) => {
  const user = c.get("user")!;
  const productId = c.req.param("productId");
  const db = c.get("db")!;

  const items = await db
    .select()
    .from(stock)
    .where(and(eq(stock.tenantId, user.tenantId), eq(stock.productId, productId)));

  return c.json({ success: true, data: { items, total: items.length }, requestId: c.get("requestId") });
});

stockRoute.get("/summary", async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;

  const [result] = await db
    .select({
      totalProducts: sql<number>`count(distinct ${stock.productId})::int`,
      totalQuantity: sql<number>`coalesce(sum(${stock.quantity}), 0)::numeric`,
      totalValue: sql<number>`coalesce(sum(${stock.quantity} * ${stock.avgCost}), 0)::numeric`,
    })
    .from(stock)
    .where(eq(stock.tenantId, user.tenantId));

  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

// All write operations blocked
stockRoute.post("/", requireRole("ADMIN"), (c) => {
  return c.json(
    { error: "FORBIDDEN", message: "Stock is read-only. Use StockIssues/Transfers/Takes/GRN to modify." },
    403
  );
});
