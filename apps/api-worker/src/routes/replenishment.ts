/**
 * Replenishment module - dự trù cuối tháng cho kho chẵn
 *
 * Algorithm:
 * 1. Tìm warehouses type=RECEIVING trong tenant
 * 2. Tính current stock cho mỗi product (sum quantity từ stock table)
 * 3. Tính outbound movements 90 ngày gần nhất (avg daily out)
 * 4. Nếu >= 3 movements → forecast = avgDailyOut * 30
 * 5. Nếu < 3 movements → fallback dùng max_stock
 * 6. Suggested qty = max(0, forecast + minStock - currentStock)
 * 7. Match với HĐ thầu ACTIVE (theo productGroup + date range)
 * 8. Optional: tạo PR DRAFT gộp tất cả lines
 */

import { Hono } from "hono";
import { eq, and, sql, gte, lte, lt, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  warehouses, products, stock, stockMovements, bidContracts,
  purchaseRequests, purchaseRequestLines, monthEndForecastRuns,
} from "../db/schema";
import { runReplenishmentRequest } from "../validators/replenishment";
import { NotFoundError, ValidationError } from "../errors";
import { requireRole } from "./_helpers";
import type { AppContext } from "../types";

const MIN_OUTBOUND_HISTORY = 3;
const FORECAST_DAYS = 30;
const HISTORY_DAYS = 90;
const SAFETY_BUFFER_PERCENT = 20; // 20% buffer

export const replenishmentRoute = new Hono<AppContext>();

// =============================================================================
// GET /runs - lịch sử các lần chạy
// =============================================================================
replenishmentRoute.get("/runs", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env.DATABASE_URL);
  const year = c.req.query("year");
  const conditions: SQL[] = [eq(monthEndForecastRuns.tenantId, user.tenantId)];
  if (year) conditions.push(eq(monthEndForecastRuns.fiscalYear, Number(year)));
  const whereClause = and(...conditions);

  const items = await db
    .select()
    .from(monthEndForecastRuns)
    .where(whereClause)
    .orderBy(monthEndForecastRuns.fiscalYear, monthEndForecastRuns.fiscalMonth);

  return c.json({ success: true, data: { items, total: items.length }, requestId: c.get("requestId") });
});

// =============================================================================
// POST /preview - xem trước forecast (không save)
// =============================================================================
replenishmentRoute.post("/preview", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = runReplenishmentRequest.parse(await c.req.json());
  const user = c.get("user")!;
  const preview = await runForecast(c.env.DATABASE_URL, user.tenantId, body, user.id, false);
  return c.json({ success: true, data: preview, requestId: c.get("requestId") });
});

// =============================================================================
// POST /run - chạy thật + save PR + save run history
// =============================================================================
replenishmentRoute.post("/run", requireRole("ADMIN", "DEPT_HEAD"), async (c) => {
  const body = runReplenishmentRequest.parse(await c.req.json());
  const user = c.get("user")!;

  // Idempotency: 1 run/tenant/month
  const db = getDb(c.env.DATABASE_URL);
  const [existing] = await db
    .select()
    .from(monthEndForecastRuns)
    .where(
      and(
        eq(monthEndForecastRuns.tenantId, user.tenantId),
        eq(monthEndForecastRuns.fiscalYear, body.fiscalYear),
        eq(monthEndForecastRuns.fiscalMonth, body.fiscalMonth)
      )
    )
    .limit(1);
  if (existing) {
    throw new ValidationError(`Đã chạy dự trù tháng ${body.fiscalMonth}/${body.fiscalYear} rồi (run id: ${existing.id})`);
  }

  const result = await runForecast(c.env.DATABASE_URL, user.tenantId, body, user.id, body.saveAsPurchaseRequest);

  // Save run history
  const asOfDate = body.asOfDate ?? new Date().toISOString().split("T")[0];
  await db.insert(monthEndForecastRuns).values({
    tenantId: user.tenantId,
    runType: "MANUAL",
    fiscalYear: body.fiscalYear,
    fiscalMonth: body.fiscalMonth,
    asOfDate,
    triggeredByUser: user.id,
    status: "COMPLETED",
    warehouseCount: result.warehouseCount,
    productCount: result.lines.length,
    totalEstimatedValue: String(result.totalEstimatedValue),
    createdPurchaseRequestIds: result.createdPurchaseRequestIds,
  });

  return c.json({ success: true, data: result, requestId: c.get("requestId") });
});

// =============================================================================
// Forecast algorithm (shared giữa preview + run)
// =============================================================================
async function runForecast(
  databaseUrl: string,
  tenantId: string,
  body: { fiscalMonth: number; fiscalYear: number; asOfDate?: string; saveAsPurchaseRequest: boolean; notes?: string | null },
  userId: string,
  saveAsPR: boolean
) {
  const db = getDb(databaseUrl);
  const asOfDate = body.asOfDate ? new Date(body.asOfDate) : new Date();
  const historyStart = new Date(asOfDate);
  historyStart.setDate(historyStart.getDate() - HISTORY_DAYS);

  // 1. RECEIVING warehouses
  const receivingWarehouses = await db
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.type, "RECEIVING"),
        eq(warehouses.status, "ACTIVE")
      )
    );

  if (receivingWarehouses.length === 0) {
    throw new ValidationError("Không có kho RECEIVING nào trong tenant");
  }
  const warehouseIds = receivingWarehouses.map((w) => w.id);

  // 2. Current stock (sum quantity) per product
  const stockLevels = await db
    .select({
      productId: stock.productId,
      totalQty: sql<string>`coalesce(sum(${stock.quantity}), 0)::numeric`,
    })
    .from(stock)
    .where(
      and(
        eq(stock.tenantId, tenantId),
        sql`${stock.warehouseId} = ANY(${warehouseIds})`
      )
    )
    .groupBy(stock.productId);

  // 3. Outbound 90 days
  const outbounds = await db
    .select({
      productId: stockMovements.productId,
      totalOut: sql<string>`coalesce(sum(${stockMovements.quantity}), 0)::numeric`,
      outCount: sql<number>`count(*)::int`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        sql`${stockMovements.warehouseId} = ANY(${warehouseIds})`,
        sql`${stockMovements.movementType} IN ('OUT', 'TRANSFER_OUT', 'ISSUE')`,
        gte(stockMovements.postedAt, historyStart),
        lt(stockMovements.postedAt, asOfDate)
      )
    )
    .groupBy(stockMovements.productId);

  // 4. All active products
  const allProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.status, "ACTIVE")));

  // 5. Active bid contracts (for matching)
  const activeContracts = await db
    .select()
    .from(bidContracts)
    .where(
      and(
        eq(bidContracts.tenantId, tenantId),
        eq(bidContracts.status, "ACTIVE"),
        lte(bidContracts.startDate, asOfDate.toISOString().split("T")[0]),
        gte(bidContracts.endDate, asOfDate.toISOString().split("T")[0])
      )
    );

  // 6. Calculate per product
  const lines: Array<{
    productId: string;
    productSku: string;
    productName: string;
    currentStock: number;
    minStock: number;
    maxStock: number | null;
    avgDailyOut: number;
    forecastNextMonth: number;
    suggestedReplenishQty: number;
    lastUnitCost: number;
    estimatedTotal: number;
    bidContractId: string | null;
    bidContractNo: string | null;
    reason: string;
  }> = [];

  for (const p of allProducts) {
    const currentStock = Number(stockLevels.find((s) => s.productId === p.id)?.totalQty ?? 0);
    const out = outbounds.find((o) => o.productId === p.id);
    const totalOut = Number(out?.totalOut ?? 0);
    const outCount = out?.outCount ?? 0;

    let avgDailyOut = 0;
    let forecastNextMonth = 0;
    let reason = "";

    if (outCount >= MIN_OUTBOUND_HISTORY) {
      avgDailyOut = totalOut / HISTORY_DAYS;
      forecastNextMonth = avgDailyOut * FORECAST_DAYS * (1 + SAFETY_BUFFER_PERCENT / 100);
      reason = `Trend ${HISTORY_DAYS}d: TB ${avgDailyOut.toFixed(2)}/ngày × ${FORECAST_DAYS}d + ${SAFETY_BUFFER_PERCENT}% buffer`;
    } else if (p.maxStock) {
      forecastNextMonth = 0;
      reason = `Insufficient history (${outCount} OUT movements, need ${MIN_OUTBOUND_HISTORY}). Fallback: dùng max_stock`;
    } else {
      continue; // skip - không có data
    }

    let suggestedQty = 0;
    if (forecastNextMonth > 0) {
      suggestedQty = Math.max(0, forecastNextMonth + Number(p.minStock) - currentStock);
    } else if (p.maxStock) {
      suggestedQty = Math.max(0, Number(p.maxStock) - currentStock);
    }

    if (suggestedQty <= 0) continue;

    // Match bid contract theo productGroup
    const matchedContract = activeContracts.find(
      (c) => c.bidLotId !== null // đơn giản: lấy HĐ có bidLot
    );

    const lastUnitCost = Number(p.costPrice);
    lines.push({
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      currentStock,
      minStock: Number(p.minStock),
      maxStock: p.maxStock ? Number(p.maxStock) : null,
      avgDailyOut,
      forecastNextMonth,
      suggestedReplenishQty: suggestedQty,
      lastUnitCost,
      estimatedTotal: suggestedQty * lastUnitCost,
      bidContractId: matchedContract?.id ?? null,
      bidContractNo: matchedContract?.contractNumber ?? null,
      reason,
    });
  }

  const totalEstimatedValue = lines.reduce((sum, l) => sum + l.estimatedTotal, 0);

  // 7. Optional: create PR
  const createdPRs: string[] = [];
  if (saveAsPR && lines.length > 0) {
    const prNumber = `DT-FC-${body.fiscalYear}-${String(body.fiscalMonth).padStart(2, "0")}-${Date.now()}`;
    const [pr] = await db
      .insert(purchaseRequests)
      .values({
        tenantId,
        branchId: receivingWarehouses[0].branchId,
        prNumber,
        requestDept: `[AUTO] Dự trù cuối tháng ${body.fiscalMonth}/${body.fiscalYear}`,
        bidPlanId: null,
        neededBy: new Date(body.fiscalYear, body.fiscalMonth, 0).toISOString().split("T")[0],
        notes: body.notes ?? `Auto-generated from Replenishment module on ${asOfDate.toISOString().split("T")[0]}`,
        status: "DRAFT",
        totalEstimatedValue: String(totalEstimatedValue),
        createdBy: userId,
      })
      .returning();
    createdPRs.push(pr.id);

    const prLineValues = lines.map((l, idx) => ({
      prId: pr.id,
      productId: l.productId,
      unitId: allProducts.find((p) => p.id === l.productId)!.baseUnitId,
      quantity: String(l.suggestedReplenishQty),
      estimatedUnitPrice: String(l.lastUnitCost),
      suggestedPartyId: null,
      suggestedBidContractId: l.bidContractId,
      lineTotal: String(l.estimatedTotal),
      lineNo: idx + 1,
      notes: l.reason,
    }));
    await db.insert(purchaseRequestLines).values(prLineValues);
  }

  return {
    tenantId,
    fiscalMonth: body.fiscalMonth,
    fiscalYear: body.fiscalYear,
    asOfDate: asOfDate.toISOString().split("T")[0],
    warehouseCount: receivingWarehouses.length,
    productCount: lines.length,
    lines,
    totalEstimatedValue,
    createdPurchaseRequestIds: createdPRs,
  };
}
