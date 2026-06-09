// Supabase Edge Function: replenishment
// Dự trù cuối tháng cho kho chẵn (RECEIVING) — gọi từ pg_cron + frontend.
//
// POST /functions/v1/replenishment/preview  - DRY-RUN tính forecast, KHÔNG ghi DB
// POST /functions/v1/replenishment/run      - Chạy thật, tạo MonthEndForecastRun
//                                              + các PurchaseRequest DRAFT
//
// Algorithm (V4 - worst-case max consumption 3 tháng gần nhất + scale safety stock):
//   1. Chỉ xét kho RECEIVING + ACTIVE trong tenant.
//   2. Với mỗi product ACTIVE có tồn trong ít nhất 1 kho RECEIVING:
//      a. consumption_90d = SUM(quantity) của stock_movements
//                            WHERE movement_type IN ('OUT','TRANSFER_OUT','ADJUST_OUT','RETURN_OUT')
//                            AND posted_at trong 90 ngày gần nhất
//      b. max_monthly = MAX(TotalOut theo tháng) trong 3 tháng gần nhất
//         (fallback về totalOut90d nếu không đủ dữ liệu tháng)
//      c. forecastNextMonth = max_monthly
//      d. effectiveMinStock = MAX(max_monthly × 0.3, 50)  -- scale theo consumption
//      e. avgDailyOut = max_monthly / 30
//      f. Nếu outCount < 3 lần: KHÔNG đủ data → forecast = 0, dùng fallback
//      g. suggestedQty = MAX(0, forecastNextMonth + effectiveMinStock - currentStock)
//         Nếu forecast = 0 và product có max_stock: suggestedQty = MAX(0, max_stock - currentStock)
//         Sau cùng: CEILING(suggestedQty)
//      h. Nếu suggestedQty <= 0 VÀ không match BidContract ACTIVE → skip
//   3. Nếu suggestedQty > 0 → tạo 1 PurchaseRequest DRAFT
//      (pr_number = DT-FC-{fiscalYear}-{fiscalMonth:D2}-{guid4})
//   4. Idempotency: UNIQUE (tenant_id, fiscal_year, fiscal_month) trong month_end_forecast_runs
//      (DB cũng enforce; check trước để có message rõ ràng)
//
// Deploy: supabase functions deploy replenishment --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function err(message: string, status = 400, code = "BAD_REQUEST") {
  return json({ error: { code, message } }, status);
}

function makeClient(req: Request): SupabaseClient {
  const auth = req.headers.get("Authorization")!;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
}

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const LOOKBACK_DAYS = 90;
const MIN_OUT_EVENTS = 3;
const FORECAST_DAYS = 30;
const V4_SAFETY_STOCK_FLOOR = 50;
const V4_SAFETY_STOCK_RATIO = 0.3;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/replenishment/{action}
  // tail after "replenishment": ["preview"] | ["run"] | []
  const tail = pathParts.slice(pathParts.indexOf("replenishment") + 1);
  const action = tail[0];

  try {
    if (req.method !== "POST") return err("Method not allowed", 405);
    const sb = makeClient(req);
    const body = await req.json().catch(() => ({}));

    if (action === "preview") return await previewReplenishment(sb, body);
    if (action === "run") return await runReplenishment(sb, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

function validateRequest(r: any) {
  const now = new Date();
  const fiscalYear = r.FiscalYear ?? now.getUTCFullYear();
  const fiscalMonth = r.FiscalMonth ?? (now.getUTCMonth() + 1);
  if (fiscalYear < 2000 || fiscalYear > 2100) {
    throw new Error("Năm không hợp lệ (2000-2100)");
  }
  if (fiscalMonth < 1 || fiscalMonth > 12) {
    throw new Error("Tháng không hợp lệ (1-12)");
  }
  return { fiscalYear, fiscalMonth };
}

// =============================================================================
// POST /replenishment/preview - DRY-RUN
// =============================================================================
async function previewReplenishment(sb: SupabaseClient, body: any) {
  let fiscalYear: number, fiscalMonth: number;
  try {
    ({ fiscalYear, fiscalMonth } = validateRequest(body));
  } catch (e) {
    return err((e as Error).message, 400, "VALIDATION");
  }

  // asOfDate = ngày cuối tháng trước của fiscalMonth
  const asOfDate = computeAsOfDate(fiscalYear, fiscalMonth);

  const lines = await computeForecast(sb, asOfDate);
  const productCount = lines.length;
  const warehouseCount = new Set(lines.map((l: any) => l.warehouse_id)).size;
  const totalValue = lines.reduce((s: number, l: any) => s + Number(l.estimated_total || 0), 0);

  return json({
    as_of_date: asOfDate.toISOString().slice(0, 10),
    fiscal_year: fiscalYear,
    fiscal_month: fiscalMonth,
    warehouse_count: warehouseCount,
    product_count: productCount,
    total_estimated_value: totalValue,
    lines,
  });
}

// =============================================================================
// POST /replenishment/run - Chạy thật, ghi month_end_forecast_runs + PR
// =============================================================================
async function runReplenishment(sb: SupabaseClient, body: any) {
  let fiscalYear: number, fiscalMonth: number;
  try {
    ({ fiscalYear, fiscalMonth } = validateRequest(body));
  } catch (e) {
    return err((e as Error).message, 400, "VALIDATION");
  }

  // Get tenant_id từ user (RLS auto-filter nên .single() cũng trả tenant đúng)
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return err("Unauthorized", 401);
  const userId = user.id;

  // Idempotency check: đã có run Completed/Failed cho tháng này chưa?
  const { data: existing } = await sb.from("month_end_forecast_runs")
    .select("id, status, error_message")
    .eq("fiscal_year", fiscalYear)
    .eq("fiscal_month", fiscalMonth)
    .maybeSingle();
  if (existing && existing.status === "COMPLETED") {
    return err(
      `Đã chạy dự trù cho tháng ${fiscalMonth}/${fiscalYear} rồi (Run #${existing.id}). Xem lịch sử ở trang Dự trù cuối tháng.`,
      409, "BUSINESS_RULE",
    );
  }

  const svc = serviceClient();
  const asOfDate = computeAsOfDate(fiscalYear, fiscalMonth);

  try {
    // 1. Tính forecast
    const lines = await computeForecast(sb, asOfDate);
    const productCount = lines.length;
    const warehouseCount = new Set(lines.map((l: any) => l.warehouse_id)).size;
    const totalValue = lines.reduce((s: number, l: any) => s + Number(l.estimated_total || 0), 0);

    // 2. Tạo PurchaseRequest DRAFT (gộp tất cả lines vào 1 PR cho tháng)
    const createdPrIds: string[] = [];
    if (productCount > 0) {
      // Lấy branch đầu tiên của tenant
      const { data: branchRow } = await sb.from("branches")
        .select("id").limit(1).maybeSingle();
      const branchId = branchRow?.id;

      const prNumber = `DT-FC-${fiscalYear}-${String(fiscalMonth).padStart(2, "0")}-${
        crypto.randomUUID().slice(0, 4).toUpperCase()
      }`;

      const { data: pr, error: prErr } = await svc.from("purchase_requests").insert({
        branch_id: branchId,
        pr_number: prNumber,
        request_dept: "[AUTO] Dự trù cuối tháng",
        requester_id: userId,
        fiscal_year: fiscalYear,
        status: "DRAFT",
        requested_date: asOfDate.toISOString().slice(0, 10),
        notes: body.Notes ?? `Dự trù cuối tháng ${fiscalMonth}/${fiscalYear} - ${productCount} sản phẩm`,
        created_by: userId,
      }).select().single();
      if (prErr || !pr) throw new Error(prErr?.message ?? "Create PR failed");

      // Insert lines
      const prLines = lines.map((l: any, i: number) => ({
        purchase_request_id: pr.id,
        line_no: i + 1,
        product_id: l.product_id,
        unit_id: l.unit_id,
        quantity: l.suggested_replenish_qty,
        estimated_unit_price: l.estimated_unit_price,
        notes: l.reason,
      }));
      const { error: lineErr } = await svc.from("purchase_request_lines").insert(prLines);
      if (lineErr) throw new Error(`Create PR lines failed: ${lineErr.message}`);

      createdPrIds.push(pr.id);
    }

    // 3. Lưu run history (status=COMPLETED)
    const { data: run, error: runErr } = await svc.from("month_end_forecast_runs").insert({
      run_type: "MANUAL",
      fiscal_year: fiscalYear,
      fiscal_month: fiscalMonth,
      as_of_date: asOfDate.toISOString().slice(0, 10),
      triggered_by_user: userId,
      status: "COMPLETED",
      warehouse_count: warehouseCount,
      product_count: productCount,
      total_estimated_value: totalValue,
      created_purchase_request_ids: createdPrIds,
    }).select().single();

    if (runErr) {
      // Race condition: UNIQUE constraint
      if (runErr.message?.includes("uq_forecast_run_per_month") ||
          runErr.code === "23505") {
        return err(
          `Đã chạy dự trù cho tháng ${fiscalMonth}/${fiscalYear} rồi (race condition).`,
          409, "BUSINESS_RULE",
        );
      }
      throw new Error(runErr.message);
    }

    return json({
      run_id: run.id,
      fiscal_year: fiscalYear,
      fiscal_month: fiscalMonth,
      as_of_date: asOfDate.toISOString().slice(0, 10),
      requests_created: createdPrIds.length,
      created_purchase_request_ids: createdPrIds,
      warehouse_count: warehouseCount,
      product_count: productCount,
      total_estimated_value: totalValue,
      lines,
    });
  } catch (e) {
    // Best-effort log failed run
    try {
      await svc.from("month_end_forecast_runs").insert({
        run_type: "MANUAL",
        fiscal_year: fiscalYear,
        fiscal_month: fiscalMonth,
        as_of_date: asOfDate.toISOString().slice(0, 10),
        triggered_by_user: userId,
        status: "FAILED",
        error_message: (e as Error).message.slice(0, 500),
      });
    } catch { /* swallow */ }
    return err((e as Error).message, 500, "INTERNAL");
  }
}

// =============================================================================
// Core: computeForecast (V4 algorithm)
// =============================================================================
async function computeForecast(sb: SupabaseClient, asOfDate: Date): Promise<any[]> {
  // 1. Receiving warehouses (active)
  const { data: warehouses } = await sb.from("warehouses")
    .select("id").eq("type", "RECEIVING").eq("status", "ACTIVE");
  if (!warehouses || warehouses.length === 0) return [];
  const warehouseIds = (warehouses as any[]).map((w: any) => w.id);

  // 2. Current stock gộp theo (product, warehouse) — query stock trực tiếp
  //    (v_stock_levels đã có sẵn nhưng ta dùng stock + location join cho đúng)
  const { data: stockRows } = await sb.from("stock")
    .select("product_id, warehouse_id, quantity, reserved_qty")
    .in("warehouse_id", warehouseIds);
  const stockByProductWarehouse = new Map<string, { product_id: string; warehouse_id: string; available: number }>();
  for (const r of (stockRows || []) as any[]) {
    const key = `${r.product_id}|${r.warehouse_id}`;
    const avail = Number(r.quantity || 0) - Number(r.reserved_qty || 0);
    const cur = stockByProductWarehouse.get(key);
    if (cur) cur.available += avail;
    else stockByProductWarehouse.set(key, { product_id: r.product_id, warehouse_id: r.warehouse_id, available: avail });
  }
  const inAnyReceivingProducts = new Set<string>();
  for (const v of stockByProductWarehouse.values()) inAnyReceivingProducts.add(v.product_id);

  // 3. Consumption 90 ngày — group theo product
  const fromDate = new Date(asOfDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - LOOKBACK_DAYS);
  const { data: outRows } = await sb.from("stock_movements")
    .select("product_id, quantity, posted_at")
    .in("warehouse_id", warehouseIds)
    .in("movement_type", ["OUT", "TRANSFER_OUT", "ADJUST_OUT", "RETURN_OUT"])
    .gte("posted_at", fromDate.toISOString())
    .lt("posted_at", asOfDate.toISOString());

  const outByProduct = new Map<string, { total: number; count: number }>();
  for (const r of (outRows || []) as any[]) {
    const cur = outByProduct.get(r.product_id) ?? { total: 0, count: 0 };
    cur.total += Number(r.quantity || 0);
    cur.count += 1;
    outByProduct.set(r.product_id, cur);
  }

  // 3b. Monthly consumption 3 tháng gần nhất
  const fromMonthStart = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() - 2, 1));
  const monthKey = (d: string) => {
    const dt = new Date(d);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthlyMap = new Map<string, { product_id: string; month: string; total: number; count: number }>();
  for (const r of (outRows || []) as any[]) {
    const posted = new Date(r.posted_at);
    if (posted < fromMonthStart) continue;
    const m = monthKey(r.posted_at);
    const key = `${r.product_id}|${m}`;
    const cur = monthlyMap.get(key) ?? { product_id: r.product_id, month: m, total: 0, count: 0 };
    cur.total += Number(r.quantity || 0);
    cur.count += 1;
    monthlyMap.set(key, cur);
  }
  const maxMonthlyByProduct = new Map<string, number>();
  for (const v of monthlyMap.values()) {
    const cur = maxMonthlyByProduct.get(v.product_id) ?? 0;
    if (v.total > cur) maxMonthlyByProduct.set(v.product_id, v.total);
  }

  // 4. Active products (chỉ lấy cái có trong receiving)
  if (inAnyReceivingProducts.size === 0) return [];
  const productIds = [...inAnyReceivingProducts];
  const { data: products } = await sb.from("products")
    .select("id, sku, name, base_unit_id, min_stock, max_stock, cost_price")
    .in("id", productIds)
    .eq("status", "ACTIVE");

  // 5. Pre-load BidContract ACTIVE
  const { data: activeContracts } = await sb.from("bid_contracts")
    .select("id, contract_no, winning_party_id, bid_lot_id, lot_name, contract_value, used_value, contract_start_date, contract_end_date")
    .eq("status", "ACTIVE")
    .lte("contract_start_date", asOfDate.toISOString().slice(0, 10))
    .gte("contract_end_date", asOfDate.toISOString().slice(0, 10));
  const winningPartyIds = [...new Set(((activeContracts || []) as any[]).map((c: any) => c.winning_party_id).filter(Boolean))];
  const { data: supplierProducts } = winningPartyIds.length > 0
    ? await sb.from("supplier_products")
        .select("product_id, party_id")
        .eq("is_preferred", true)
        .in("party_id", winningPartyIds)
    : { data: [] };
  const productsBySupplier = new Map<string, Set<string>>();
  for (const sp of (supplierProducts || []) as any[]) {
    if (!productsBySupplier.has(sp.product_id)) productsBySupplier.set(sp.product_id, new Set());
    productsBySupplier.get(sp.product_id)!.add(sp.party_id);
  }

  // 6. Tính lines
  const result: any[] = [];
  for (const product of (products || []) as any[]) {
    const outStat = outByProduct.get(product.id);
    const totalOut90d = outStat?.total ?? 0;
    const outCount = outStat?.count ?? 0;

    // Current stock gộp tất cả kho RECEIVING
    let currentStock = 0;
    for (const v of stockByProductWarehouse.values()) {
      if (v.product_id === product.id) currentStock += v.available;
    }

    let avgDailyOut = 0;
    let forecastNextMonth = 0;
    let effectiveMinStock = Number(product.min_stock || 0);
    let reason = "";

    if (outCount >= MIN_OUT_EVENTS) {
      const maxMonthly = maxMonthlyByProduct.get(product.id) ?? totalOut90d;
      forecastNextMonth = Math.round(maxMonthly * 100) / 100;
      const scaledMin = Math.round(maxMonthly * V4_SAFETY_STOCK_RATIO * 100) / 100;
      effectiveMinStock = Math.max(scaledMin, V4_SAFETY_STOCK_FLOOR);
      avgDailyOut = Math.round((maxMonthly / FORECAST_DAYS) * 10000) / 10000;
      reason = `V4: max tháng ${maxMonthly.toFixed(0)} (3 tháng), safety ${effectiveMinStock.toFixed(0)}`;
    } else {
      reason = `Không đủ lịch sử (${outCount} lần OUT, cần >= ${MIN_OUT_EVENTS})`;
    }

    let suggestedQty = 0;
    if (forecastNextMonth > 0) {
      suggestedQty = Math.max(0, forecastNextMonth + effectiveMinStock - currentStock);
    } else if (product.max_stock != null) {
      suggestedQty = Math.max(0, Number(product.max_stock) - currentStock);
    }

    // Match BidContract (winning party phải nằm trong supplier của product)
    let matchedContract: any = null;
    const supplierParties = productsBySupplier.get(product.id);
    if (supplierParties) {
      const candidates = ((activeContracts || []) as any[])
        .filter((c: any) => supplierParties.has(c.winning_party_id))
        .sort((a: any, b: any) => Number(b.contract_value || 0) - Number(b.used_value || 0)
                                    - (Number(a.contract_value || 0) - Number(a.used_value || 0)));
      matchedContract = candidates[0] ?? null;
    }

    if (suggestedQty <= 0 && !matchedContract) continue;

    const finalQty = Math.ceil(suggestedQty);
    const unitPrice = Number(product.cost_price || 0);

    // Warehouse đầu tiên có chứa product
    let warehouseId: string | null = null;
    for (const v of stockByProductWarehouse.values()) {
      if (v.product_id === product.id) { warehouseId = v.warehouse_id; break; }
    }

    result.push({
      product_id: product.id,
      product_sku: product.sku ?? "",
      product_name: product.name ?? "",
      warehouse_id: warehouseId,
      unit_id: product.base_unit_id,
      current_stock: currentStock,
      min_stock: Number(product.min_stock || 0),
      max_stock: product.max_stock != null ? Number(product.max_stock) : null,
      avg_daily_out: avgDailyOut,
      forecast_next_month: forecastNextMonth,
      suggested_replenish_qty: finalQty,
      estimated_unit_price: unitPrice,
      estimated_total: finalQty * unitPrice,
      bid_contract_id: matchedContract?.id ?? null,
      bid_contract_no: matchedContract?.contract_no ?? null,
      bid_lot_id: matchedContract?.bid_lot_id ?? null,
      bid_lot_name: matchedContract?.lot_name ?? null,
      reason,
    });
  }
  return result;
}

function computeAsOfDate(fiscalYear: number, fiscalMonth: number): Date {
  // asOfDate = ngày cuối của tháng liền trước fiscalMonth
  // Nếu fiscalMonth = 1 → tháng liền trước = 12 năm trước
  const prevMonth = fiscalMonth === 1 ? 12 : fiscalMonth - 1;
  const prevYear = fiscalMonth === 1 ? fiscalYear - 1 : fiscalYear;
  // last day of prevMonth
  return new Date(Date.UTC(prevYear, prevMonth, 0));
}
