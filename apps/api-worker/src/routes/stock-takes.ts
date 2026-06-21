/**
 * Stock Takes (phiếu kiểm kê)
 *
 * Workflow: DRAFT → COUNTED (nhập counted_qty) → POSTED (sinh ADJUST_IN/OUT movements)
 * Snapshot system_qty tại thời điểm tạo, so sánh với counted_qty.
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";

import {
  stockTakes, stockTakeLines, stock, stockMovements,
} from "../db/schema";
import { createStockTakeRequest } from "../validators/stock";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const stockTakesRoute = new Hono<AppContext>();

stockTakesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const conditions: SQL[] = [eq(stockTakes.tenantId, user.tenantId)];
  if (status) conditions.push(eq(stockTakes.status, status));
  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockTakes)
    .where(whereClause);
  const items = await db
    .select()
    .from(stockTakes)
    .where(whereClause)
    .orderBy(stockTakes.stockTakeDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

stockTakesRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(stockTakes)
    .where(and(eq(stockTakes.id, id), eq(stockTakes.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTake", id);
  const lines = await db.select().from(stockTakeLines).where(eq(stockTakeLines.stockTakeId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

stockTakesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createStockTakeRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = c.get("db")!;
  const stockTakeNumber = body.stockTakeNumber ?? `STK-${Date.now()}`;

  const [header] = await db
    .insert(stockTakes)
    .values({
      tenantId: user.tenantId,
      branchId: body.branchId,
      stockTakeNumber,
      warehouseId: body.warehouseId,
      stockTakeDate: body.stockTakeDate,
      notes: body.notes ?? null,
      status: "DRAFT",
      createdBy: user.id,
    })
    .returning();

  // Snapshot system qty từ stock table
  const lineValues = await Promise.all(
    body.lines.map(async (l, idx) => {
      const [existing] = await db
        .select()
        .from(stock)
        .where(
          and(
            eq(stock.tenantId, user.tenantId),
            eq(stock.warehouseId, body.warehouseId),
            eq(stock.locationId, l.locationId),
            eq(stock.productId, l.productId),
            eq(stock.batchNo, l.batchNo),
            eq(stock.serialNo, l.serialNo)
          )
        )
        .limit(1);

      return {
        stockTakeId: header.id,
        productId: l.productId,
        locationId: l.locationId,
        unitId: l.unitId,
        batchNo: l.batchNo,
        serialNo: l.serialNo,
        systemQty: existing?.quantity ?? l.systemQty,
        countedQty: l.countedQty ? String(l.countedQty) : null,
        lineStatus: l.countedQty ? "COUNTED" : "PENDING",
        lineNo: l.lineNo || idx + 1,
      };
    })
  );
  const insertedLines = await db.insert(stockTakeLines).values(lineValues).returning();
  return c.json({ success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") }, 201);
});

// POST /:id/count - Mark counted (counted_qty đã có sẵn trong lines)
stockTakesRoute.post("/:id/count", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(stockTakes)
    .where(and(eq(stockTakes.id, id), eq(stockTakes.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTake", id);
  if (header.status !== "DRAFT") throw new ValidationError(`Cannot count: status is ${header.status}`);

  // Update variance qty cho mỗi line
  const lines = await db.select().from(stockTakeLines).where(eq(stockTakeLines.stockTakeId, id));
  for (const line of lines) {
    const counted = Number(line.countedQty ?? 0);
    const system = Number(line.systemQty);
    await db
      .update(stockTakeLines)
      .set({ varianceQty: String(counted - system), lineStatus: "COUNTED" })
      .where(eq(stockTakeLines.id, line.id));
  }

  await db
    .update(stockTakes)
    .set({ status: "COUNTED", countedBy: user.id, countedAt: new Date(), updatedAt: new Date() })
    .where(eq(stockTakes.id, id));
  return c.json({ success: true, data: { id, status: "COUNTED" }, requestId: c.get("requestId") });
});

// POST /:id/post - Tạo ADJUST_IN/OUT movements + update stock
stockTakesRoute.post("/:id/post", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(stockTakes)
    .where(and(eq(stockTakes.id, id), eq(stockTakes.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTake", id);
  if (header.status !== "COUNTED") throw new ValidationError(`Cannot post: status is ${header.status}`);

  const lines = await db.select().from(stockTakeLines).where(eq(stockTakeLines.stockTakeId, id));
  for (const line of lines) {
    const variance = Number(line.varianceQty ?? 0);
    if (variance === 0) {
      await db.update(stockTakeLines).set({ lineStatus: "SKIPPED" }).where(eq(stockTakeLines.id, line.id));
      continue;
    }
    // Update stock quantity = countedQty
    await db
      .update(stock)
      .set({
        quantity: line.countedQty ?? "0",
        lastMovementAt: new Date(),
        version: sql`${stock.version} + 1`,
      })
      .where(
        and(
          eq(stock.tenantId, user.tenantId),
          eq(stock.warehouseId, header.warehouseId),
          eq(stock.locationId, line.locationId),
          eq(stock.productId, line.productId),
          eq(stock.batchNo, line.batchNo),
          eq(stock.serialNo, line.serialNo)
        )
      );
    // Create movement: ADJUST_IN (variance > 0) hoặc ADJUST_OUT (variance < 0)
    const movementType = variance > 0 ? "ADJUST_IN" : "ADJUST_OUT";
    await db.insert(stockMovements).values({
      tenantId: user.tenantId,
      branchId: header.branchId,
      warehouseId: header.warehouseId,
      locationId: line.locationId,
      productId: line.productId,
      unitId: line.unitId,
      movementType,
      status: "POSTED",
      quantity: String(Math.abs(variance)),
      refType: "STOCK_TAKE",
      refId: header.id,
      refLineId: line.id,
      batchNo: line.batchNo,
      serialNo: line.serialNo,
      idempotencyKey: `stk-${header.id}-${line.id}`,
      createdBy: user.id,
      postedAt: new Date(),
    });
    await db.update(stockTakeLines).set({ lineStatus: "ADJUSTED" }).where(eq(stockTakeLines.id, line.id));
  }

  await db
    .update(stockTakes)
    .set({ status: "POSTED", postedBy: user.id, postedAt: new Date(), updatedAt: new Date() })
    .where(eq(stockTakes.id, id));
  return c.json({ success: true, data: { id, status: "POSTED" }, requestId: c.get("requestId") });
});

stockTakesRoute.post("/:id/cancel", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(stockTakes)
    .where(and(eq(stockTakes.id, id), eq(stockTakes.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTake", id);
  if (header.status === "POSTED") throw new ValidationError("Cannot cancel POSTED stock take");
  await db
    .update(stockTakes)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(stockTakes.id, id));
  return c.json({ success: true, data: { id, status: "CANCELLED" }, requestId: c.get("requestId") });
});
