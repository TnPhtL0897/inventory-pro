/**
 * Purchase Orders CRUD
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { purchaseOrders, purchaseOrderLines } from "../db/schema";
import { createPurchaseOrderRequest } from "../validators/purchasing";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const purchaseOrdersRoute = new Hono<AppContext>();

purchaseOrdersRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const partyId = c.req.query("partyId");
  const conditions: SQL[] = [eq(purchaseOrders.tenantId, user.tenantId)];
  if (status) conditions.push(eq(purchaseOrders.status, status));
  if (partyId) conditions.push(eq(purchaseOrders.partyId, partyId));
  const whereClause = and(...conditions);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).where(whereClause);
  const items = await db
    .select()
    .from(purchaseOrders)
    .where(whereClause)
    .orderBy(purchaseOrders.orderDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

purchaseOrdersRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseOrder", id);
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

purchaseOrdersRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createPurchaseOrderRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);

  // Validate bid contract nếu có
  if (body.bidContractId && !body.bidLotId) {
    throw new ValidationError("bidLotId is required when bidContractId is provided");
  }

  // Tính totals
  let totalAmount = 0, taxAmount = 0, grandTotal = 0;
  for (const l of body.lines) {
    const lineTotal = Number(l.quantity) * Number(l.unitPrice);
    const tax = lineTotal * (Number(l.taxRate) / 100);
    totalAmount += lineTotal;
    taxAmount += tax;
    grandTotal += lineTotal + tax;
  }

  const poNumber = body.poNumber ?? `PO-${Date.now()}`;
  const [header] = await db
    .insert(purchaseOrders)
    .values({
      tenantId: user.tenantId,
      branchId: body.branchId,
      poNumber,
      partyId: body.partyId,
      bidContractId: body.bidContractId ?? null,
      bidLotId: body.bidLotId ?? null,
      orderDate: body.orderDate,
      expectedDeliveryDate: body.expectedDeliveryDate ?? null,
      notes: body.notes ?? null,
      status: "DRAFT",
      totalAmount: String(totalAmount),
      taxAmount: String(taxAmount),
      grandTotal: String(grandTotal),
      createdBy: user.id,
    })
    .returning();

  const lineValues = body.lines.map((l, idx) => {
    const lineTotal = Number(l.quantity) * Number(l.unitPrice);
    return {
      poId: header.id,
      productId: l.productId,
      unitId: l.unitId,
      quantity: String(l.quantity),
      receivedQty: "0",
      unitPrice: String(l.unitPrice),
      taxRate: String(l.taxRate),
      lineTotal: String(lineTotal),
      lineNo: l.lineNo || idx + 1,
    };
  });
  const insertedLines = await db.insert(purchaseOrderLines).values(lineValues).returning();
  return c.json({ success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") }, 201);
});

purchaseOrdersRoute.post("/:id/approve", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseOrder", id);
  if (header.status !== "DRAFT") throw new ValidationError(`Cannot approve: status is ${header.status}`);
  await db
    .update(purchaseOrders)
    .set({ status: "APPROVED", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id));
  return c.json({ success: true, data: { id, status: "APPROVED" }, requestId: c.get("requestId") });
});

purchaseOrdersRoute.post("/:id/cancel", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseOrder", id);
  if (header.status === "RECEIVED") throw new ValidationError("Cannot cancel fully received PO");
  await db
    .update(purchaseOrders)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id));
  return c.json({ success: true, data: { id, status: "CANCELLED" }, requestId: c.get("requestId") });
});
