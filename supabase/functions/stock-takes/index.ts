// Supabase Edge Function: stock-takes
// Handles StockTake CRUD + workflow (DRAFT → COUNTED → POSTED → CANCELLED)
//
// POST   /functions/v1/stock-takes                - create DRAFT (snapshot từ stock)
// PUT    /functions/v1/stock-takes?id=<uuid>      - bulk update counted_qty (DRAFT/COUNTED)
// DELETE /functions/v1/stock-takes?id=<uuid>      - delete (DRAFT only)
// POST   /functions/v1/stock-takes/{id}/post     - COUNTED → POSTED (ghi ADJUST_IN/OUT movements)
// POST   /functions/v1/stock-takes/{id}/cancel   - DRAFT/COUNTED → CANCELLED (yêu cầu reason)
//
// List/Get: handled by PostgREST (tables stock_takes + stock_take_lines)
//
// Deploy: supabase functions deploy stock-takes --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

// Service role client bypasses RLS (for stock_movements writes; RLS auto-fills
// tenant_id via auth_tenant_id() but service role bypasses for cross-table
// updates on lines referencing our movement).
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/stock-takes/{id}/{action}
  // pathParts after "stock-takes": ["<id>", "<action>"] | []
  const tail = pathParts.slice(pathParts.indexOf("stock-takes") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createStockTake(sb, body);
    if (req.method === "PUT" && id && !action) return await updateCounts(sb, id, body);
    if (req.method === "DELETE" && id) return await deleteStockTake(sb, id);
    if (req.method === "POST" && id && action === "post") return await postStockTake(sb, id);
    if (req.method === "POST" && id && action === "cancel") return await cancelStockTake(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /stock-takes - Create DRAFT + snapshot từ v_stock_levels
// =============================================================================
//
// Nếu r.Lines được cung cấp → user chỉ định dòng (validate + lookup system_qty).
// Nếu r.Lines rỗng → auto-snapshot TẤT CẢ stock trong warehouse.
//
async function createStockTake(sb: SupabaseClient, r: any) {
  if (!r.WarehouseId) return err("WarehouseId là bắt buộc");
  if (!r.BranchId) return err("BranchId là bắt buộc");
  if (!r.StockTakeDate) return err("StockTakeDate là bắt buộc");

  // 1. Validate warehouse
  const { data: wh } = await sb.from("warehouses")
    .select("id, branch_id, code").eq("id", r.WarehouseId).single();
  if (!wh) return err(`Warehouse không tồn tại`, 404);
  if (wh.branch_id !== r.BranchId)
    return err(`Warehouse '${wh.code}' không thuộc branch ${r.BranchId}`, 404);

  // 2. Snapshot stock hiện tại từ v_stock_levels (aggregate view)
  //    Chỉ lấy stock thuộc đúng (branch, warehouse) của phiếu.
  const { data: stockRows } = await sb.from("v_stock_levels")
    .select("product_id, location_id, unit_id, batch_no, serial_no, on_hand_qty")
    .eq("warehouse_id", r.WarehouseId);
  // Lưu thành map keyed bởi (product|location|batch|serial) để lookup nhanh
  const stockMap = new Map<string, any>();
  for (const s of (stockRows || [])) {
    const k = `${s.product_id}|${s.location_id}|${s.batch_no || ""}|${s.serial_no || ""}`;
    stockMap.set(k, s);
  }

  // 3. Generate StockTakeNumber (STK-YYYYMM-NNNN)
  const now = new Date();
  const prefix = `STK-${now.toISOString().slice(0, 7).replace("-", "")}-`;
  const { count } = await sb.from("stock_takes")
    .select("id", { count: "exact", head: true })
    .like("stock_take_number", `${prefix}%`);
  const stkNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // 4. Get user_id từ JWT
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 5. Insert header (DRAFT)
  const { data: stk, error: stkErr } = await sb.from("stock_takes").insert({
    branch_id: r.BranchId,
    warehouse_id: r.WarehouseId,
    stock_take_number: stkNumber,
    stock_take_date: r.StockTakeDate,
    notes: r.Notes ?? null,
    status: "DRAFT",
    created_by: userId,
  }).select().single();
  if (stkErr || !stk) return err(stkErr?.message ?? "Insert failed", 500);

  // 6. Build lines
  let lines: any[] = [];

  if (r.Lines && r.Lines.length > 0) {
    // User chỉ định dòng
    const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
    const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
    const locationIds = [...new Set(r.Lines.map((l: any) => l.LocationId))];

    const [{ data: products }, { data: units }, { data: locations }] = await Promise.all([
      sb.from("products").select("id, name, base_unit_id").in("id", productIds),
      sb.from("units_of_measure").select("id, code").in("id", unitIds),
      sb.from("locations").select("id, code, warehouse_id").in("id", locationIds),
    ]);

    const productMap = new Map((products || []).map((p: any) => [p.id, p]));
    const unitMap = new Map((units || []).map((u: any) => [u.id, u]));
    const locationMap = new Map((locations || []).map((l: any) => [l.id, l]));

    let no = 1;
    for (const line of r.Lines) {
      const p = productMap.get(line.ProductId);
      const u = unitMap.get(line.UnitId);
      const loc = locationMap.get(line.LocationId);
      if (!p) return err(`Product ${line.ProductId} không tồn tại`, 404);
      if (!u) return err(`Unit ${line.UnitId} không tồn tại`, 404);
      if (!loc) return err(`Location ${line.LocationId} không tồn tại`, 404);
      if (loc.warehouse_id !== r.WarehouseId)
        return err(`Location ${line.LocationId} không thuộc warehouse`, 400, "BUSINESS_RULE");

      // Lookup system_qty từ snapshot
      const batchNo = line.BatchNo ?? "";
      const serialNo = line.SerialNo ?? "";
      const k = `${line.ProductId}|${line.LocationId}|${batchNo}|${serialNo}`;
      const sysRow = stockMap.get(k);
      const sysQty = sysRow ? Number(sysRow.on_hand_qty) : 0;

      lines.push({
        stock_take_id: stk.id,
        line_no: no++,
        product_id: line.ProductId,
        product_name: p.name,
        unit_id: line.UnitId,
        unit_code: u.code,
        location_id: line.LocationId,
        location_code: loc.code,
        batch_no: batchNo,
        serial_no: serialNo,
        system_qty: sysQty,
        counted_qty: null,
        status: "PENDING",
      });
    }
  } else {
    // Auto-snapshot TẤT CẢ stock trong warehouse
    if (stockRows && stockRows.length > 0) {
      const productIds = [...new Set(stockRows.map((s: any) => s.product_id))];
      const locationIds = [...new Set(stockRows.map((s: any) => s.location_id))];
      const [{ data: products }, { data: locations }] = await Promise.all([
        sb.from("products").select("id, name, base_unit_id").in("id", productIds),
        sb.from("locations").select("id, code, warehouse_id").in("id", locationIds),
      ]);
      const productMap = new Map((products || []).map((p: any) => [p.id, p]));
      const locationMap = new Map((locations || []).map((l: any) => [l.id, l]));

      // Load units cho base_unit_id
      const baseUnitIds = [...new Set(
        Array.from(productMap.values()).map((p: any) => p.base_unit_id)
      )];
      const { data: units } = await sb.from("units_of_measure")
        .select("id, code").in("id", baseUnitIds);
      const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

      let no = 1;
      for (const s of stockRows) {
        const p = productMap.get(s.product_id);
        if (!p) continue;
        const u = unitMap.get(p.base_unit_id);
        if (!u) continue;
        const loc = locationMap.get(s.location_id);
        if (!loc) continue;
        lines.push({
          stock_take_id: stk.id,
          line_no: no++,
          product_id: s.product_id,
          product_name: p.name,
          unit_id: s.unit_id,
          unit_code: u.code,
          location_id: s.location_id,
          location_code: loc.code,
          batch_no: s.batch_no || "",
          serial_no: s.serial_no || "",
          system_qty: Number(s.on_hand_qty),
          counted_qty: null,
          status: "PENDING",
        });
      }
    }
  }

  if (lines.length === 0) {
    // Không có stock trong warehouse, xóa header (hoặc giữ với 0 lines)
    return json({ ...stk, lines: [], warning: "Không có tồn kho trong warehouse để snapshot" }, 201);
  }

  // 7. Bulk insert lines
  const { error: lineErr } = await sb.from("stock_take_lines").insert(lines);
  if (lineErr) return err(lineErr.message, 500);

  return json({ ...stk, lines }, 201);
}

// =============================================================================
// PUT /stock-takes/{id} - Bulk update counted_qty (DRAFT/COUNTED)
// =============================================================================
//
// Body: { "Updates": [ { "LineId": "uuid", "CountedQty": 5.0, "Notes": "..." } ] }
//
async function updateCounts(sb: SupabaseClient, id: string, r: any) {
  if (!r.Updates || r.Updates.length === 0) return err("Updates là bắt buộc");

  const { data: stk } = await sb.from("stock_takes")
    .select("id, status").eq("id", id).single();
  if (!stk) return err("Not found", 404);
  if (stk.status !== "DRAFT" && stk.status !== "COUNTED")
    return err(`Chỉ sửa được ở DRAFT/COUNTED. Hiện tại: ${stk.status}`, 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Update từng line (parallel)
  let anyCounted = false;
  for (const u of r.Updates) {
    if (u.CountedQty != null && Number(u.CountedQty) < 0)
      return err(`CountedQty dòng ${u.LineId} phải >= 0`, 400, "VALIDATION");

    const lineStatus = (u.CountedQty != null) ? "COUNTED" : "PENDING";
    if (lineStatus === "COUNTED") anyCounted = true;

    const { error } = await sb.from("stock_take_lines").update({
      counted_qty: u.CountedQty ?? null,
      notes: u.Notes ?? null,
      status: lineStatus,
    }).eq("id", u.LineId).eq("stock_take_id", id);
    if (error) return err(error.message, 500);
  }

  // Auto-bump header DRAFT → COUNTED nếu có ít nhất 1 line counted
  if (anyCounted && stk.status === "DRAFT") {
    await sb.from("stock_takes").update({
      status: "COUNTED",
      counted_by: userId,
      counted_at: new Date().toISOString(),
    }).eq("id", id);
  }

  return json({ ok: true });
}

// =============================================================================
// DELETE /stock-takes/{id} - DRAFT only
// =============================================================================
async function deleteStockTake(sb: SupabaseClient, id: string) {
  const { data: stk } = await sb.from("stock_takes")
    .select("status").eq("id", id).single();
  if (!stk) return err("Not found", 404);
  if (stk.status !== "DRAFT")
    return err("Chỉ phiếu DRAFT mới xóa được", 400, "BUSINESS_RULE");
  const { error } = await sb.from("stock_takes").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /stock-takes/{id}/post - COUNTED → POSTED + ghi ADJUST_IN/OUT movements
// =============================================================================
//
// Với mỗi line có variance != 0: tạo stock_movement với ADJUST_IN (variance > 0)
// hoặc ADJUST_OUT (variance < 0). Variance = 0 hoặc chưa đếm → SKIPPED.
//
async function postStockTake(sb: SupabaseClient, id: string) {
  const svc = serviceClient();  // cần write stock_movements + adjust_movement_id

  const { data: stk } = await sb.from("stock_takes")
    .select("id, tenant_id, branch_id, warehouse_id, status")
    .eq("id", id).single();
  if (!stk) return err("Not found", 404);
  if (stk.status === "POSTED")
    return err("Phiếu đã POSTED", 400, "BUSINESS_RULE");
  if (stk.status === "CANCELLED")
    return err("Phiếu đã CANCELLED", 400, "BUSINESS_RULE");
  if (stk.status === "DRAFT")
    return err("Phải nhập số đếm (COUNTED) trước khi POST", 400, "BUSINESS_RULE");

  const { data: lines, error: linesErr } = await sb.from("stock_take_lines")
    .select("id, product_id, unit_id, location_id, system_qty, counted_qty, " +
            "unit_cost, batch_no, serial_no, notes, status")
    .eq("stock_take_id", id);
  if (linesErr) return err(linesErr.message, 500);
  if (!lines || lines.length === 0)
    return err("Phiếu phải có ít nhất 1 dòng", 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;
  const now = new Date().toISOString();

  // Filter lines cần xử lý (chưa Adjusted/Skipped, đã counted)
  const toProcess = (lines || []).filter(
    (l: any) => l.status !== "ADJUSTED" && l.status !== "SKIPPED"
  );

  for (const line of toProcess) {
    // Chưa nhập số đếm → skip
    if (line.counted_qty == null) {
      await svc.from("stock_take_lines").update({ status: "SKIPPED" }).eq("id", line.id);
      continue;
    }
    const variance = Number(line.counted_qty) - Number(line.system_qty);
    if (variance === 0) {
      await svc.from("stock_take_lines").update({ status: "SKIPPED" }).eq("id", line.id);
      continue;
    }

    const isIncrease = variance > 0;
    const mov = {
      tenant_id: stk.tenant_id,
      branch_id: stk.branch_id,
      warehouse_id: stk.warehouse_id,
      location_id: line.location_id,
      product_id: line.product_id,
      unit_id: line.unit_id,
      movement_type: isIncrease ? "ADJUST_IN" : "ADJUST_OUT",
      status: "POSTED",
      quantity: Math.abs(variance),
      unit_cost: line.unit_cost ?? null,
      ref_type: "STOCK_TAKE",
      ref_id: stk.id,
      ref_line_id: line.id,
      batch_no: line.batch_no || "",
      serial_no: line.serial_no || "",
      notes: line.notes ?? `Kiểm kê: system=${line.system_qty}, counted=${line.counted_qty}`,
      idempotency_key: crypto.randomUUID(),
      created_by: userId,
      posted_at: now,
    };

    const { data: ins, error: movErr } = await svc.from("stock_movements")
      .insert(mov).select("id").single();
    if (movErr) {
      // Có thể do stock âm nếu check constraint
      return err(`Tạo movement thất bại: ${movErr.message}. ` +
        `(Có thể do variance làm tồn kho âm và warehouse không cho phép)`, 409, "CONFLICT");
    }

    // Update line với adjust_movement_id + status ADJUSTED
    await svc.from("stock_take_lines").update({
      adjust_movement_id: ins.id,
      status: "ADJUSTED",
    }).eq("id", line.id);
  }

  // Update header → POSTED
  await svc.from("stock_takes").update({
    status: "POSTED",
    posted_by: userId,
    posted_at: now,
  }).eq("id", id);

  return json({ ok: true, posted_at: now });
}

// =============================================================================
// POST /stock-takes/{id}/cancel - DRAFT/COUNTED → CANCELLED
// =============================================================================
async function cancelStockTake(sb: SupabaseClient, id: string, body: any) {
  if (!body?.Reason) return err("Phải nhập lý do hủy", 400, "VALIDATION");

  const { data: stk } = await sb.from("stock_takes")
    .select("id, status").eq("id", id).single();
  if (!stk) return err("Not found", 404);
  if (stk.status === "POSTED")
    return err("Phiếu đã POSTED - không hủy được. Tạo phiếu kiểm kê mới để bù.", 400, "BUSINESS_RULE");
  if (stk.status === "CANCELLED")
    return err("Phiếu đã CANCELLED", 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  const { error } = await sb.from("stock_takes").update({
    status: "CANCELLED",
    cancelled_by: userId,
    cancelled_at: new Date().toISOString(),
    cancel_reason: body.Reason,
  }).eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}
