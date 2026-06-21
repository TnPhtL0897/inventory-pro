/**
 * Bidding: BidPlans + BidPackages + BidLots + BidContracts + PurchaseRequests
 * (5 modules trong 1 file để dễ theo dõi workflow)
 */

import { Hono } from "hono";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  bidPlans, bidPackages, bidLots, bidContracts,
  purchaseRequests, purchaseRequestLines,
} from "../db/schema";
import {
  createBidPlanRequest, updateBidPlanRequest,
  createBidPackageRequest, createBidLotRequest,
  createBidContractRequest, createPurchaseRequestRequest,
} from "../validators/bidding";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext, PaginatedResult } from "../types";

// =============================================================================
// BID PLANS
// =============================================================================
export const bidPlansRoute = new Hono<AppContext>();

bidPlansRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const fiscalYear = c.req.query("fiscalYear");
  const conditions: SQL[] = [eq(bidPlans.tenantId, user.tenantId)];
  if (status) conditions.push(eq(bidPlans.status, status));
  if (fiscalYear) conditions.push(eq(bidPlans.fiscalYear, Number(fiscalYear)));
  const whereClause = and(...conditions);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bidPlans).where(whereClause);
  const items = await db
    .select()
    .from(bidPlans)
    .where(whereClause)
    .orderBy(bidPlans.fiscalYear)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

bidPlansRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(bidPlans)
    .where(and(eq(bidPlans.id, id), eq(bidPlans.tenantId, user.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("BidPlan", id);
  return c.json({ success: true, data: row, requestId: c.get("requestId") });
});

bidPlansRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createBidPlanRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(bidPlans)
    .values({
      tenantId: user.tenantId,
      planNumber: body.planNumber ?? `KHĐT-${body.fiscalYear}-${Date.now()}`,
      planName: body.planName,
      fiscalYear: body.fiscalYear,
      approvalDate: body.approvalDate ?? null,
      totalEstimatedValue: String(body.totalEstimatedValue),
      notes: body.notes ?? null,
      status: "DRAFT",
      createdBy: user.id,
    })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

bidPlansRoute.put("/:id", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const id = c.req.param("id");
  const body = updateBidPlanRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    updateSet[k] = k === "totalEstimatedValue" ? String(v) : v;
  }
  const [updated] = await db
    .update(bidPlans)
    .set(updateSet)
    .where(and(eq(bidPlans.id, id), eq(bidPlans.tenantId, user.tenantId)))
    .returning();
  if (!updated) throw new NotFoundError("BidPlan", id);
  return c.json({ success: true, data: updated, requestId: c.get("requestId") });
});

// =============================================================================
// BID PACKAGES
// =============================================================================
export const bidPackagesRoute = new Hono<AppContext>();

bidPackagesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const bidPlanId = c.req.query("bidPlanId");
  const conditions: SQL[] = [eq(bidPackages.tenantId, user.tenantId)];
  if (bidPlanId) conditions.push(eq(bidPackages.bidPlanId, bidPlanId));
  const whereClause = and(...conditions);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bidPackages).where(whereClause);
  const items = await db
    .select()
    .from(bidPackages)
    .where(whereClause)
    .orderBy(bidPackages.packageNumber)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

bidPackagesRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createBidPackageRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(bidPackages)
    .values({
      tenantId: user.tenantId,
      bidPlanId: body.bidPlanId,
      packageNumber: body.packageNumber ?? `GT-${Date.now()}`,
      packageName: body.packageName,
      bidMethod: body.bidMethod,
      publishDate: body.publishDate ?? null,
      bidOpenDate: body.bidOpenDate ?? null,
      bidCloseDate: body.bidCloseDate ?? null,
      estimatedValue: String(body.estimatedValue),
      notes: body.notes ?? null,
      status: "DRAFT",
    })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

bidPackagesRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(bidPackages)
    .where(and(eq(bidPackages.id, id), eq(bidPackages.tenantId, user.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("BidPackage", id);
  return c.json({ success: true, data: row, requestId: c.get("requestId") });
});

// =============================================================================
// BID LOTS
// =============================================================================
export const bidLotsRoute = new Hono<AppContext>();

bidLotsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const bidPackageId = c.req.query("bidPackageId");
  const conditions: SQL[] = [eq(bidLots.tenantId, user.tenantId)];
  if (bidPackageId) conditions.push(eq(bidLots.bidPackageId, bidPackageId));
  const whereClause = and(...conditions);
  const items = await db.select().from(bidLots).where(whereClause);
  return c.json({ success: true, data: { items, total: items.length }, requestId: c.get("requestId") });
});

bidLotsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createBidLotRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(bidLots)
    .values({
      tenantId: user.tenantId,
      bidPackageId: body.bidPackageId,
      lotNumber: body.lotNumber ?? `LOT-${Date.now()}`,
      lotName: body.lotName,
      productGroup: body.productGroup ?? null,
      estimatedQty: String(body.estimatedQty),
      unitId: body.unitId ?? null,
      estimatedUnitPrice: body.estimatedUnitPrice ? String(body.estimatedUnitPrice) : null,
      estimatedTotal: String(body.estimatedTotal),
      notes: body.notes ?? null,
      status: "PENDING",
    })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

// =============================================================================
// BID CONTRACTS
// =============================================================================
export const bidContractsRoute = new Hono<AppContext>();

bidContractsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const partyId = c.req.query("partyId");
  const conditions: SQL[] = [eq(bidContracts.tenantId, user.tenantId)];
  if (status) conditions.push(eq(bidContracts.status, status));
  if (partyId) conditions.push(eq(bidContracts.partyId, partyId));
  const whereClause = and(...conditions);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bidContracts).where(whereClause);
  const items = await db
    .select()
    .from(bidContracts)
    .where(whereClause)
    .orderBy(bidContracts.startDate)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

bidContractsRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(bidContracts)
    .where(and(eq(bidContracts.id, id), eq(bidContracts.tenantId, user.tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError("BidContract", id);
  return c.json({ success: true, data: row, requestId: c.get("requestId") });
});

bidContractsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = createBidContractRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const [created] = await db
    .insert(bidContracts)
    .values({
      tenantId: user.tenantId,
      bidPackageId: body.bidPackageId,
      bidLotId: body.bidLotId ?? null,
      contractNumber: body.contractNumber ?? `HĐ-${Date.now()}`,
      partyId: body.partyId,
      contractValue: String(body.contractValue),
      usedValue: "0",
      startDate: body.startDate,
      endDate: body.endDate,
      signedDate: body.signedDate ?? null,
      notes: body.notes ?? null,
      status: "ACTIVE",
      createdBy: user.id,
    })
    .returning();
  return c.json({ success: true, data: created, requestId: c.get("requestId") }, 201);
});

// =============================================================================
// PURCHASE REQUESTS (dự trù)
// =============================================================================
export const purchaseRequestsRoute = new Hono<AppContext>();

purchaseRequestsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const page = Number(c.req.query("page") ?? 1);
  const pageSize = Number(c.req.query("pageSize") ?? 20);
  const status = c.req.query("status");
  const conditions: SQL[] = [eq(purchaseRequests.tenantId, user.tenantId)];
  if (status) conditions.push(eq(purchaseRequests.status, status));
  const whereClause = and(...conditions);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(purchaseRequests).where(whereClause);
  const items = await db
    .select()
    .from(purchaseRequests)
    .where(whereClause)
    .orderBy(purchaseRequests.createdAt)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const result: PaginatedResult<unknown> = { items, total: Number(count), page, pageSize };
  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

purchaseRequestsRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseRequest", id);
  const lines = await db.select().from(purchaseRequestLines).where(eq(purchaseRequestLines.prId, id));
  return c.json({ success: true, data: { ...header, lines }, requestId: c.get("requestId") });
});

purchaseRequestsRoute.post("/", requireRole("ADMIN", "DEPT_HEAD", "KEEPER_BULK_HC_SP", "KEEPER_BULK_VTYT"), async (c) => {
  const body = createPurchaseRequestRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);

  let total = 0;
  for (const l of body.lines) {
    total += Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0);
  }

  const prNumber = body.prNumber ?? `PR-${Date.now()}`;
  const [header] = await db
    .insert(purchaseRequests)
    .values({
      tenantId: user.tenantId,
      branchId: body.branchId,
      prNumber,
      requestDept: body.requestDept ?? null,
      bidPlanId: body.bidPlanId ?? null,
      neededBy: body.neededBy ?? null,
      notes: body.notes ?? null,
      status: "DRAFT",
      totalEstimatedValue: String(total),
      createdBy: user.id,
    })
    .returning();

  const lineValues = body.lines.map((l, idx) => {
    const lineTotal = Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0);
    return {
      prId: header.id,
      productId: l.productId,
      unitId: l.unitId,
      quantity: String(l.quantity),
      estimatedUnitPrice: l.estimatedUnitPrice ? String(l.estimatedUnitPrice) : null,
      suggestedPartyId: l.suggestedPartyId ?? null,
      suggestedBidContractId: l.suggestedBidContractId ?? null,
      lineTotal: String(lineTotal),
      lineNo: l.lineNo || idx + 1,
      notes: l.notes ?? null,
    };
  });
  const insertedLines = await db.insert(purchaseRequestLines).values(lineValues).returning();
  return c.json({ success: true, data: { ...header, lines: insertedLines }, requestId: c.get("requestId") }, 201);
});

purchaseRequestsRoute.post("/:id/approve", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [header] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseRequest", id);
  if (header.status !== "DRAFT" && header.status !== "SUBMITTED") {
    throw new ValidationError(`Cannot approve: status is ${header.status}`);
  }
  await db
    .update(purchaseRequests)
    .set({ status: "APPROVED", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(purchaseRequests.id, id));
  return c.json({ success: true, data: { id, status: "APPROVED" }, requestId: c.get("requestId") });
});

purchaseRequestsRoute.post("/:id/reject", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const { reason } = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const [header] = await db
    .select()
    .from(purchaseRequests)
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.tenantId, user.tenantId)))
    .limit(1);
  if (!header) throw new NotFoundError("PurchaseRequest", id);
  await db
    .update(purchaseRequests)
    .set({ status: "REJECTED", rejectReason: reason ?? null, updatedAt: new Date() })
    .where(eq(purchaseRequests.id, id));
  return c.json({ success: true, data: { id, status: "REJECTED" }, requestId: c.get("requestId") });
});
