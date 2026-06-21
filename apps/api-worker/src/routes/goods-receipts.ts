/**
 * Goods Receipts (phiếu nhập kho) - tạo IN movements khi post
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  goodsReceipts, goodsReceiptLines,
  stock, stockMovements, purchaseOrders, purchaseOrderLines,
} from "../db/schema";
import { createGoodsReceiptRequest } from "../validators/purchasing";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const goodsReceiptsRoute = new Hono<AppContext>();

goodsReceiptsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const conditions: SQL[] = [eq(goodsReceipts.tenantId, user.tenantId)];
  if (status) conditions.push(eq(goodsReceipts.status, status));
  const whereClause = and(...conditions);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(goodsReceipts).where(whereClause);
  const items = await db
    .select()
    .from(goodsReceipts)
    .where(whereClause)
    .orderBy(goodsReceipts.receiptDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

goodsReceiptsRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("GoodsReceipt", id);
  const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.grnId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

goodsReceiptsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createGoodsReceiptRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);

  let totalAmount = 0, taxAmount = 0;
  for (const l of body.lines) {
    totalAmount += Number(l.quantity) * Number(l.unitPrice);
  }
  const grandTotal = totalAmount + taxAmount;

  const grnNumber = body.grnNumber ?? `GRN-${Date.now()}`;
  const [header] = await db
    .insert(goodsReceipts)
    .values({
      tenantId: user.tenantId,
      branchId: body.branchId,
      grnNumber,
      poId: body.poId ?? null,
      partyId: body.partyId,
      bidContractId: body.bidContractId ?? null,
      bidLotId: body.bidLotId ?? null,
      warehouseId: body.warehouseId,
      receiptDate: body.receiptDate,
      supplierInvoiceNo: body.supplierInvoiceNo ?? null,
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
      grnId: header.id,
      poLineId: l.poLineId ?? null,
      productId: l.productId,
      locationId: l.locationId,
      unitId: l.unitId,
      batchNo: l.batchNo,
      serialNo: l.serialNo,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      expiryDate: l.expiryDate ?? null,
      lineTotal: String(lineTotal),
      lineNo: l.lineNo || idx + 1,
    };
  });
  const insertedLines = await db.insert(goodsReceiptLines).values(lineValues).returning();
  return c.json({ success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") }, 201);
});

goodsReceiptsRoute.post("/:id/post", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("GoodsReceipt", id);
  if (header.status !== "DRAFT") throw new ValidationError(`Cannot post: status is ${header.status}`);

  const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.grnId, id));

  for (const line of lines) {
    // Upsert stock at receiving warehouse
    await db
      .insert(stock)
      .values({
        tenantId: user.tenantId,
        branchId: header.branchId,
        warehouseId: header.warehouseId,
        locationId: line.locationId,
        productId: line.productId,
        batchNo: line.batchNo,
        serialNo: line.serialNo,
        quantity: line.quantity,
        avgCost: line.unitPrice,
        lastMovementAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stock.branchId, stock.warehouseId, stock.locationId, stock.productId, stock.batchNo, stock.serialNo],
        set: {
          quantity: sql`${stock.quantity} + ${line.quantity}`,
          avgCost: line.unitPrice, // Simple weighted avg - có thể refine
          lastMovementAt: new Date(),
          version: sql`${stock.version} + 1`,
        },
      });
    // Create IN movement
    await db.insert(stockMovements).values({
      tenantId: user.tenantId,
      branchId: header.branchId,
      warehouseId: header.warehouseId,
      locationId: line.locationId,
      productId: line.productId,
      unitId: line.unitId,
      movementType: "IN",
      status: "POSTED",
      quantity: line.quantity,
      unitCost: line.unitPrice,
      refType: "GRN",
      refId: header.id,
      refLineId: line.id,
      batchNo: line.batchNo,
      serialNo: line.serialNo,
      expiryDate: line.expiryDate,
      idempotencyKey: `grn-${header.id}-${line.id}`,
      createdBy: user.id,
      postedAt: new Date(),
    });
    // Update PO received_qty nếu có
    if (line.poLineId) {
      await db
        .update(purchaseOrderLines)
        .set({ receivedQty: sql`${purchaseOrderLines.receivedQty} + ${line.quantity}` })
        .where(eq(purchaseOrderLines.id, line.poLineId));
    }
  }

  // Update PO status
  if (header.poId) {
    const allLines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, header.poId));
    const allReceived = allLines.every((l) => Number(l.receivedQty) >= Number(l.quantity));
    const someReceived = allLines.some((l) => Number(l.receivedQty) > 0);
    const newStatus = allReceived ? "RECEIVED" : someReceived ? "PARTIAL_RECEIVED" : "APPROVED";
    await db
      .update(purchaseOrders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, header.poId));
  }

  await db
    .update(goodsReceipts)
    .set({ status: "POSTED", postedBy: user.id, postedAt: new Date(), updatedAt: new Date() })
    .where(eq(goodsReceipts.id, id));
  return c.json({ success: true, data: { id, status: "POSTED" }, requestId: c.get("requestId") });
});

goodsReceiptsRoute.post("/:id/cancel", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("GoodsReceipt", id);
  if (header.status === "POSTED") throw new ValidationError("Cannot cancel POSTED GRN. Create reversal.");
  await db
    .update(goodsReceipts)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(goodsReceipts.id, id));
  return c.json({ success: true, data: { id, status: "CANCELLED" }, requestId: c.get("requestId") });
});
