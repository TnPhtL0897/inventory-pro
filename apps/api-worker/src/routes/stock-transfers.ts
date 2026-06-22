/**
 * Stock Transfers (phiếu chuyển kho nội bộ)
 *
 * Workflow: DRAFT → POST (IN_TRANSIT) → RECEIVE → RECEIVED
 * Mỗi line tạo 2 movements: TRANSFER_OUT (src) + TRANSFER_IN (dst).
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";

import {
  stockTransfers, stockTransferLines, stock, stockMovements,
} from "../db/schema";
import { createStockTransferRequest } from "../validators/stock";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

export const stockTransfersRoute = new Hono<AppContext>();

stockTransfersRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const conditions: SQL[] = [eq(stockTransfers.tenantId, user.tenantId)];
  if (status) conditions.push(eq(stockTransfers.status, status));
  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockTransfers)
    .where(whereClause);
  const items = await db
    .select()
    .from(stockTransfers)
    .where(whereClause)
    .orderBy(stockTransfers.transferDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

stockTransfersRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTransfer", id);
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

stockTransfersRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createStockTransferRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = c.get("db")!;
  if (body.fromWarehouseId === body.toWarehouseId) {
    throw new ValidationError("fromWarehouse and toWarehouse must be different");
  }

  const transferNumber = body.transferNumber ?? `TRF-${Date.now()}`;
  const [header] = await db
    .insert(stockTransfers)
    .values({
      tenantId: user.tenantId,
      transferNumber,
      fromBranchId: body.fromBranchId,
      fromWarehouseId: body.fromWarehouseId,
      toBranchId: body.toBranchId,
      toWarehouseId: body.toWarehouseId,
      transferDate: body.transferDate,
      expectedReceiptDate: body.expectedReceiptDate ?? null,
      notes: body.notes ?? null,
      status: "DRAFT",
      createdBy: user.id,
    })
    .returning();

  const lineValues = body.lines.map((l, idx) => ({
    transferId: header.id,
    productId: l.productId,
    unitId: l.unitId,
    fromLocationId: l.fromLocationId,
    toLocationId: l.toLocationId,
    batchNo: l.batchNo,
    serialNo: l.serialNo,
    quantity: String(l.quantity),
    unitCost: l.unitCost ? String(l.unitCost) : null,
    lineStatus: "OPEN",
    lineNo: l.lineNo || idx + 1,
  }));
  const insertedLines = await db.insert(stockTransferLines).values(lineValues).returning();
  return c.json({ success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") }, 201);
});

// POST /:id/post - Xuất khỏi from_warehouse, tạo TRANSFER_OUT movements
stockTransfersRoute.post("/:id/post", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTransfer", id);
  if (header.status !== "DRAFT") throw new ValidationError(`Cannot post: status is ${header.status}`);

  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  for (const line of lines) {
    // Decrement from_warehouse stock
    await db
      .update(stock)
      .set({
        quantity: sql`${stock.quantity} - ${line.quantity}`,
        lastMovementAt: new Date(),
        version: sql`${stock.version} + 1`,
      })
      .where(
        and(
          eq(stock.branchId, header.fromBranchId),
          eq(stock.warehouseId, header.fromWarehouseId),
          eq(stock.locationId, line.fromLocationId),
          eq(stock.productId, line.productId),
          eq(stock.batchNo, line.batchNo),
          eq(stock.serialNo, line.serialNo)
        )
      );
    // Create TRANSFER_OUT movement
    await db.insert(stockMovements).values({
      tenantId: user.tenantId,
      branchId: header.fromBranchId,
      warehouseId: header.fromWarehouseId,
      locationId: line.fromLocationId,
      productId: line.productId,
      unitId: line.unitId,
      movementType: "TRANSFER_OUT",
      status: "POSTED",
      quantity: line.quantity,
      unitCost: line.unitCost,
      refType: "TRANSFER",
      refId: header.id,
      refLineId: line.id,
      batchNo: line.batchNo,
      serialNo: line.serialNo,
      idempotencyKey: `trf-out-${header.id}-${line.id}`,
      createdBy: user.id,
      postedAt: new Date(),
    });
  }

  await db
    .update(stockTransfers)
    .set({ status: "IN_TRANSIT", postedAt: new Date(), postedBy: user.id, updatedAt: new Date() })
    .where(eq(stockTransfers.id, id));
  return c.json({ success: true, data: { id, status: "IN_TRANSIT" }, requestId: c.get("requestId") });
});

// POST /:id/receive - Nhập vào to_warehouse, tạo TRANSFER_IN movements
stockTransfersRoute.post("/:id/receive", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");

  const [header] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTransfer", id);
  if (header.status !== "IN_TRANSIT") throw new ValidationError(`Cannot receive: status is ${header.status}`);

  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  for (const line of lines) {
    // Upsert stock at destination
    await db
      .insert(stock)
      .values({
        tenantId: user.tenantId,
        branchId: header.toBranchId,
        warehouseId: header.toWarehouseId,
        locationId: line.toLocationId,
        productId: line.productId,
        batchNo: line.batchNo,
        serialNo: line.serialNo,
        quantity: line.quantity,
        avgCost: line.unitCost ?? "0",
        lastMovementAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stock.branchId, stock.warehouseId, stock.locationId, stock.productId, stock.batchNo, stock.serialNo],
        set: {
          quantity: sql`${stock.quantity} + ${line.quantity}`,
          lastMovementAt: new Date(),
          version: sql`${stock.version} + 1`,
        },
      });
    // Create TRANSFER_IN movement
    await db.insert(stockMovements).values({
      tenantId: user.tenantId,
      branchId: header.toBranchId,
      warehouseId: header.toWarehouseId,
      locationId: line.toLocationId,
      productId: line.productId,
      unitId: line.unitId,
      movementType: "TRANSFER_IN",
      status: "POSTED",
      quantity: line.quantity,
      unitCost: line.unitCost,
      refType: "TRANSFER",
      refId: header.id,
      refLineId: line.id,
      batchNo: line.batchNo,
      serialNo: line.serialNo,
      idempotencyKey: `trf-in-${header.id}-${line.id}`,
      createdBy: user.id,
      postedAt: new Date(),
    });
  }

  await db
    .update(stockTransfers)
    .set({ status: "RECEIVED", receivedAt: new Date(), receivedBy: user.id, updatedAt: new Date() })
    .where(eq(stockTransfers.id, id));
  return c.json({ success: true, data: { id, status: "RECEIVED" }, requestId: c.get("requestId") });
});

stockTransfersRoute.post("/:id/cancel", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = c.get("db")!;
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("StockTransfer", id);
  if (header.status === "RECEIVED") throw new ValidationError("Cannot cancel RECEIVED transfer");
  await db
    .update(stockTransfers)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(stockTransfers.id, id));
  return c.json({ success: true, data: { id, status: "CANCELLED" }, requestId: c.get("requestId") });
});
