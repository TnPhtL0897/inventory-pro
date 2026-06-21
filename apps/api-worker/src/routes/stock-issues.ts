/**
 * Stock Issues (phiếu xuất kho)
 *
 * POST /api/v1/stock-issues        - Create draft issue
 * GET  /api/v1/stock-issues        - List (paginated, filter)
 * GET  /api/v1/stock-issues/:id    - Get by ID
 * POST /api/v1/stock-issues/:id/post   - Post (tạo stock_movements OUT, update stock)
 * POST /api/v1/stock-issues/:id/cancel - Cancel
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { stockIssues, stockIssueLines, stock, stockMovements } from "../db/schema";
import { createStockIssueRequest } from "../validators/stock";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const stockIssuesRoute = new Hono<AppContext>();

stockIssuesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const branchId = c.req.query("branchId");
  const warehouseId = c.req.query("warehouseId");

  const conditions: SQL[] = [eq(stockIssues.tenantId, user.tenantId)];
  if (status) conditions.push(eq(stockIssues.status, status));
  if (branchId) conditions.push(eq(stockIssues.branchId, branchId));
  if (warehouseId) conditions.push(eq(stockIssues.warehouseId, warehouseId));
  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockIssues)
    .where(whereClause);
  const items = await db
    .select()
    .from(stockIssues)
    .where(whereClause)
    .orderBy(stockIssues.issueDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const result: PaginatedResult<unknown> = {
    items, total: Number(count), page, pageSize,
  };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

stockIssuesRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(stockIssues)
    .where(and(eq(stockIssues.id, id), eq(stockIssues.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockIssue", id);

  const lines = await db.select().from(stockIssueLines).where(eq(stockIssueLines.issueId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

stockIssuesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_DAILY_HC_SP", "KEEPER_DAILY_VTYT"), async (c) => {
  const body = createStockIssueRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);

  // Auto-generate issue number nếu không có
  const issueNumber = body.issueNumber ?? `ISS-${Date.now()}`;

  const [header] = await db
    .insert(stockIssues)
    .values({
      tenantId: user.tenantId,
      branchId: body.branchId,
      issueNumber,
      partyId: body.partyId ?? null,
      warehouseId: body.warehouseId,
      purpose: body.purpose,
      issueDate: body.issueDate,
      referenceNo: body.referenceNo ?? null,
      notes: body.notes ?? null,
      status: "DRAFT",
      createdBy: user.id,
    })
    .returning();

  // Insert lines
  const lineValues = body.lines.map((l, idx) => ({
    issueId: header.id,
    productId: l.productId,
    locationId: l.locationId,
    unitId: l.unitId,
    batchNo: l.batchNo,
    serialNo: l.serialNo,
    quantity: String(l.quantity),
    unitCost: l.unitCost ? String(l.unitCost) : null,
    notes: l.notes ?? null,
    lineNo: l.lineNo || idx + 1,
  }));
  const insertedLines = await db.insert(stockIssueLines).values(lineValues).returning();

  return c.json(
    { success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") },
    201
  );
});

// POST /:id/post - Tạo stock_movements OUT và update stock
stockIssuesRoute.post("/:id/post", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_DAILY_HC_SP", "KEEPER_DAILY_VTYT"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(stockIssues)
    .where(and(eq(stockIssues.id, id), eq(stockIssues.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockIssue", id);
  if (header.status !== "DRAFT") {
    throw new ValidationError(`Cannot post: status is ${header.status}, expected DRAFT`);
  }

  const lines = await db.select().from(stockIssueLines).where(eq(stockIssueLines.issueId, id));

  // Tạo movements + update stock
  for (const line of lines) {
    // Decrement stock
    const [existing] = await db
      .select()
      .from(stock)
      .where(
        and(
          eq(stock.branchId, header.branchId),
          eq(stock.warehouseId, header.warehouseId),
          eq(stock.locationId, line.locationId),
          eq(stock.productId, line.productId),
          eq(stock.batchNo, line.batchNo),
          eq(stock.serialNo, line.serialNo)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(stock)
        .set({
          quantity: sql`${stock.quantity} - ${line.quantity}`,
          lastMovementAt: new Date(),
          version: sql`${stock.version} + 1`,
        })
        .where(
          and(
            eq(stock.branchId, header.branchId),
            eq(stock.warehouseId, header.warehouseId),
            eq(stock.locationId, line.locationId),
            eq(stock.productId, line.productId),
            eq(stock.batchNo, line.batchNo),
            eq(stock.serialNo, line.serialNo)
          )
        );
    }

    // Create movement record
    await db.insert(stockMovements).values({
      tenantId: user.tenantId,
      branchId: header.branchId,
      warehouseId: header.warehouseId,
      locationId: line.locationId,
      productId: line.productId,
      unitId: line.unitId,
      movementType: "OUT",
      status: "POSTED",
      quantity: line.quantity,
      unitCost: line.unitCost,
      refType: "ISSUE",
      refId: header.id,
      refLineId: line.id,
      batchNo: line.batchNo,
      serialNo: line.serialNo,
      idempotencyKey: `issue-${header.id}-${line.id}`,
      createdBy: user.id,
      postedAt: new Date(),
    });
  }

  // Update issue status
  await db
    .update(stockIssues)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: user.id, updatedAt: new Date() })
    .where(eq(stockIssues.id, id));

  return c.json({ success: true, data: { id, status: "POSTED" }, requestId: c.get("requestId") });
});

// POST /:id/cancel
stockIssuesRoute.post("/:id/cancel", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const reason = (await c.req.json().catch(() => ({}))).reason ?? null;

  const [header] = await db
    .select()
    .from(stockIssues)
    .where(and(eq(stockIssues.id, id), eq(stockIssues.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockIssue", id);
  if (header.status === "POSTED") {
    throw new ValidationError("Cannot cancel POSTED issue. Create reversal issue instead.");
  }
  if (header.status === "CANCELLED") {
    throw new ValidationError("Already cancelled");
  }

  await db
    .update(stockIssues)
    .set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
    .where(eq(stockIssues.id, id));
  return c.json({ success: true, data: { id, status: "CANCELLED" }, requestId: c.get("requestId") });
});
