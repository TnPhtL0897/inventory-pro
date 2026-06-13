// Supabase Edge Function: compute-yearly-forecast
// Dự trù năm (yearly forecast) cho kế hoạch mua sắm năm sau.
//
// POST /functions/v1/compute-yearly-forecast
// Body: {
// fiscalYear: number, // NĂM CẦN DỰ TRÙ (vd: 2027)
// warehouseIds: string[], // mảng UUID kho để tính tồn
// notes?: string,
// }
//
// Returns: {
// runId: string,
// fiscalYear: number,
// runDate: string,
// totalProducts: number,
// totalLines: number,
// totalEstimatedValue: number,
// }
//
// Algorithm (đã chốt với user):
// 1. consumption_12m_avg = view v_product_consumption_yearly.consumption_12m_avg
// 2. consumption_3m_max = view v_product_consumption_yearly.consumption_3m_max
// 3. forecast_base = MAX(consumption_12m_avg, consumption_3m_max)
// 4. forecast_year_qty = forecast_base × 12
// 5. current_stock  = SUM(v_stock_levels.on_hand_qty) cho warehouseIds
// 6. suggested_buy_qty = MAX(0, forecast_year_qty - current_stock)
// 7. total_estimated_value = suggested_buy_qty × products.cost_price
//
// Insert yearly_forecast_runs (status=COMPLETED) + yearly_forecast_lines (1 row / product).
// Idempotency: cho phép nhiều run / cùng fiscal_year (các bản draft) — không enforce unique.
//
// Deploy: supabase functions deploy compute-yearly-forecast --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Methods": "POST, OPTIONS",
 "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
 return new Response(JSON.stringify(data), {
 status,
 headers: { "Content-Type": "application/json", ...CORS },
 });
}

function err(message: string, status = 400, code = "BAD_REQUEST", details?: unknown) {
 return json({ error: { code, message, details } }, status);
}

interface ComputeInput {
 fiscalYear: number;
 warehouseIds: string[];
 notes?: string;
}

interface ConsumptionRow {
 product_id: string;
 warehouse_id: string;
 consumption_12m_total: number;
 consumption_12m_avg: number;
 consumption_3m_max: number;
}

interface ProductRow {
 id: string;
 sku: string;
 name: string;
 cost_price: number;
 status: string;
 base_unit_id: string | null;
}

interface StockLevelRow {
 product_id: string;
 on_hand_qty: number;
}

serve(async (req: Request) => {
 if (req.method === "OPTIONS") {
 return new Response(null, { status: 204, headers: CORS });
 }
 if (req.method !== "POST") {
 return err("Method not allowed", 405, "METHOD_NOT_ALLOWED");
 }

 // 1. Parse + validate input
 let body: ComputeInput;
 try {
 body = await req.json();
 } catch {
 return err("Body must be valid JSON");
 }
 if (typeof body.fiscalYear !== "number" || body.fiscalYear < 2000 || body.fiscalYear > 2100) {
 return err("fiscalYear không hợp lệ (2000-2100)");
 }
 if (!Array.isArray(body.warehouseIds) || body.warehouseIds.length === 0) {
 return err("warehouseIds phải là mảng UUID có ít nhất 1 phần tử");
 }
 for (const id of body.warehouseIds) {
 if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
 return err(`warehouseId không phải UUID hợp lệ: ${id}`);
 }
 }

 // 2. Client với user JWT (RLS áp dụng cho SELECT)
 const auth = req.headers.get("Authorization") || "";
 const userClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
 global: { headers: { Authorization: auth } },
 auth: { persistSession: false, autoRefreshToken: false },
 });
 // Service role client (bypass RLS cho INSERT vào yearly_forecast_*)
 const adminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
 auth: { persistSession: false, autoRefreshToken: false },
 });

 // 3. Lấy tenant_id từ user (giả định 1 tenant / user; lấy từ auth_tenant_id RPC)
 const { data: tenantId, error: tenantErr } = await userClient.rpc("auth_tenant_id");
 if (tenantErr) return err("Không lấy được tenant_id", 401, "UNAUTHORIZED", tenantErr.message);
 if (!tenantId) return err("User chưa gán tenant", 403, "NO_TENANT");

 // 4. Query consumption view (đã lọc theo tenant qua RLS)
 const { data: consumptionRaw, error: consErr } = await userClient
 .from("v_product_consumption_yearly")
 .select("product_id, warehouse_id, consumption_12m_total, consumption_12m_avg, consumption_3m_max")
 .in("warehouse_id", body.warehouseIds);
 if (consErr) {
 return err("Lỗi query v_product_consumption_yearly", 500, "QUERY_FAILED", consErr.message);
 }
 const consumption = (consumptionRaw ?? []) as ConsumptionRow[];

 // 5. Query products ACTIVE
 const { data: productsRaw, error: prodErr } = await userClient
 .from("products")
 .select("id, sku, name, cost_price, status, base_unit_id")
 .eq("status", "ACTIVE")
 .order("sku");
 if (prodErr) {
  return err("Lỗi query products", 500, "QUERY_FAILED", prodErr.message);
 }
 const products = (productsRaw ?? []) as ProductRow[];

 // 6. Query current stock từ view v_stock_levels
 const { data: stockRaw, error: stockErr } = await userClient
 .from("v_stock_levels")
 .select("product_id, on_hand_qty")
 .in("warehouse_id", body.warehouseIds);
 if (stockErr) {
 return err("Lỗi query v_stock_levels", 500, "QUERY_FAILED", stockErr.message);
 }
 const stockRows = (stockRaw ?? []) as StockLevelRow[];

 // 7. Tính current_stock theo product (sum across selected warehouses)
 const currentStockByProduct = new Map<string, number>();
 for (const s of stockRows) {
 currentStockByProduct.set(
 s.product_id,
 (currentStockByProduct.get(s.product_id) ?? 0) + Number(s.on_hand_qty ?? 0),
 );
 }

 // 8. Tính forecast base theo product (MAX avg12m, max3m)
 const forecastBaseByProduct = new Map<string, { avg: number; max: number }>();
 for (const c of consumption) {
 const cur = forecastBaseByProduct.get(c.product_id);
 const avg = Math.max(cur?.avg ?? 0, Number(c.consumption_12m_avg ?? 0));
 const max = Math.max(cur?.max ?? 0, Number(c.consumption_3m_max ?? 0));
 forecastBaseByProduct.set(c.product_id, { avg, max });
 }

 // 9. Tính lines cho từng product ACTIVE
 const linesToInsert = products.map((p) => {
 const fc = forecastBaseByProduct.get(p.id) ?? { avg: 0, max: 0 };
 const forecastBase = Math.max(fc.avg, fc.max);
 const forecastYearQty = forecastBase * 12;
 const currentStock = currentStockByProduct.get(p.id) ?? 0;
 const suggestedBuyQty = Math.max(0, forecastYearQty - currentStock);
 const unitPrice = Number(p.cost_price ?? 0);
 const totalEstimatedValue = suggestedBuyQty * unitPrice;
 return {
 product_id: p.id,
 consumption_12m: fc.avg * 12,
 consumption_12m_avg: fc.avg,
 consumption_3m_max: fc.max,
 forecast_base: forecastBase,
 forecast_year_qty: forecastYearQty,
 current_stock: currentStock,
 suggested_buy_qty: suggestedBuyQty,
 unit_price: unitPrice,
 total_estimated_value: totalEstimatedValue,
 line_status: "PENDING" as const,
 unit_id: p.base_unit_id,
 };
 });

 // 10. Tính tổng (denormalized trên header)
 const totalProducts = products.length;
 const totalLines = linesToInsert.filter((l) => l.suggested_buy_qty > 0).length;
 const totalEstimatedValue = linesToInsert.reduce(
 (sum, l) => sum + Number(l.total_estimated_value ?? 0),
 0,
  );

 // 11. Lấy user.id từ JWT (ghi run_by)
 const { data: userInfo } = await userClient.auth.getUser();
 const runBy = userInfo?.user?.id ?? null;

 // 12. Insert yearly_forecast_runs
 const { data: runRow, error: runErr } = await adminClient
 .from("yearly_forecast_runs")
 .insert({
 tenant_id: tenantId,
 fiscal_year: body.fiscalYear,
 warehouse_ids: body.warehouseIds,
 total_products: totalProducts,
 total_lines: totalLines,
 total_estimated_value: totalEstimatedValue,
 status: "COMPLETED",
 run_by: runBy,
 notes: body.notes ?? null,
 })
  .select("id, run_date")
 .single();
 if (runErr || !runRow) {
 return err("Lỗi insert yearly_forecast_runs", 500, "INSERT_FAILED", runErr?.message);
 }
 const runId = runRow.id as string;

 // 13. Insert yearly_forecast_lines (batch)
 if (linesToInsert.length > 0) {
 const linesWithRun = linesToInsert.map((l) => ({
 ...l,
 tenant_id: tenantId,
 run_id: runId,
 }));
 const { error: linesErr } = await adminClient
 .from("yearly_forecast_lines")
 .insert(linesWithRun);
 if (linesErr) {
 // Rollback header
 await adminClient.from("yearly_forecast_runs").delete().eq("id", runId);
 return err("Lỗi insert yearly_forecast_lines", 500, "INSERT_FAILED", linesErr.message);
 }
 }

 return json({
 runId,
 fiscalYear: body.fiscalYear,
 runDate: runRow.run_date,
 totalProducts,
 totalLines,
 totalEstimatedValue,
 });
});
