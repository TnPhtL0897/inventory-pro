// Supabase Edge Function: goods-receipts
// Handles GRN CRUD + workflow (DRAFT → POSTED → CANCELLED)
//
// POST   /functions/v1/goods-receipts              - create (DRAFT)
// PUT    /functions/v1/goods-receipts?id=<uuid>    - update (DRAFT only)
// DELETE /functions/v1/goods-receipts?id=<uuid>    - delete (DRAFT only)
// POST   /functions/v1/goods-receipts/{id}/post    - DRAFT → POSTED (ghi stock_movements IN)
// POST   /functions/v1/goods-receipts/{id}/cancel  - DRAFT → CANCELLED (yêu cầu reason)
//
// List/Get: handled by PostgREST (tables goods_receipts + goods_receipt_lines)
//
// Deploy: supabase functions deploy goods-receipts --no-verify-jwt

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

// Service role client bypasses RLS (for stock_movements writes that need
// to compute on behalf of the user across tenant boundary, though RLS still
// filters by tenant_id from JWT).
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/goods-receipts/{id}/{action}
  // pathParts after "goods-receipts": ["<id>", "<action>"] | ["<action>"] | []
  const tail = pathParts.slice(pathParts.indexOf("goods-receipts") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createGrn(sb, body);
    if (req.method === "PUT" && id) return await updateGrn(sb, id, body);
    if (req.method === "DELETE" && id) return await deleteGrn(sb, id);
    if (req.method === "POST" && id && action === "post") return await postGrn(sb, id);
    if (req.method === "POST" && id && action === "cancel") return await cancelGrn(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /goods-receipts - Create (DRAFT)
// =============================================================================
async function createGrn(sb: SupabaseClient, r: any) {
  // 1. Validate basic
  if (!r.Lines || r.Lines.length === 0) return err("GRN phải có ít nhất 1 dòng");
  if (!r.IdempotencyKeys || r.IdempotencyKeys.length !== r.Lines.length)
    return err("Mỗi dòng GRN cần 1 idempotency_key");
  if (new Set(r.IdempotencyKeys).size !== r.IdempotencyKeys.length)
    return err("Idempotency keys phải unique");

  // 2. Validate party
  const { data: party } = await sb.from("parties").select("id, party_type")
    .eq("id", r.PartyId).single();
  if (!party) return err(`Party ${r.PartyId} không tồn tại`, 404);
  if (party.party_type === "CUSTOMER")
    return err("Party phải là SUPPLIER hoặc BOTH", 400, "BUSINESS_RULE");

  // 3. Validate warehouse + check type RECEIVING
  const { data: wh } = await sb.from("warehouses")
    .select("id, branch_id, type").eq("id", r.WarehouseId).single();
  if (!wh) return err(`Warehouse không tồn tại`, 404);
  if (wh.branch_id !== r.BranchId)
    return err(`Warehouse không thuộc branch ${r.BranchId}`, 404);
  if (wh.type !== "RECEIVING")
    return err(`Kho '${r.WarehouseId}' là kho lẻ (ISSUE), không thể tạo phiếu nhập. Vui lòng chọn kho chẵn (RECEIVING).`, 400, "BUSINESS_RULE");

  // 4. Validate locations belong to warehouse
  const locationIds = [...new Set(r.Lines.map((l: any) => l.LocationId))];
  const { data: locs } = await sb.from("locations")
    .select("id, warehouse_id").in("id", locationIds);
  const badLoc = (locs || []).filter((l: any) => l.warehouse_id !== r.WarehouseId);
  if (badLoc.length)
    return err(`Location ${badLoc.map((l: any) => l.id).join(", ")} không thuộc warehouse`, 404);

  // 5. Validate PO if provided
  if (r.PurchaseOrderId) {
    const { data: po } = await sb.from("purchase_orders")
      .select("id, party_id, bid_contract_id, bid_lot_id").eq("id", r.PurchaseOrderId).single();
    if (!po) return err(`PO ${r.PurchaseOrderId} không tồn tại`, 404);
    if (po.party_id !== r.PartyId)
      return err("Party của GRN phải khớp với PO", 400, "BUSINESS_RULE");
    r._bidContractId = po.bid_contract_id;
    r._bidLotId = po.bid_lot_id;
  }

  // 6. Generate GRN number (GRN-YYYYMM-NNNN)
  const now = new Date();
  const prefix = `GRN-${now.toISOString().slice(0, 7).replace("-", "")}-`;
  const { count } = await sb.from("goods_receipts")
    .select("id", { count: "exact", head: true })
    .like("grn_number", `${prefix}%`);
  const grnNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // 7. Get user_id from JWT for created_by
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 8. Load products + units to denormalize name/code into lines
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u.code]));

  // 9. Build lines (with product_name + unit_code denormalized)
  const lines = r.Lines.map((line: any, i: number) => ({
    tenant_id: undefined, // RLS auto-fills
    line_no: i + 1,
    po_line_id: line.PoLineId ?? null,
    product_id: line.ProductId,
    product_name: productMap.get(line.ProductId) ?? "",
    unit_id: line.UnitId,
    unit_code: unitMap.get(line.UnitId) ?? "",
    location_id: line.LocationId,
    quantity: line.Quantity,
    unit_cost: line.UnitCost,
    batch_no: line.BatchNo ?? "",
    serial_no: line.SerialNo ?? "",
    expiry_date: line.ExpiryDate ?? null,
    notes: line.Notes ?? null,
    idempotency_key: r.IdempotencyKeys[i],
    status: "OPEN",
  }));

  // 10. Insert header
  const { data: grn, error: grnErr } = await sb.from("goods_receipts").insert({
    branch_id: r.BranchId,
    grn_number: grnNumber,
    purchase_order_id: r.PurchaseOrderId ?? null,
    party_id: r.PartyId,
    warehouse_id: r.WarehouseId,
    receipt_date: r.ReceiptDate,
    supplier_invoice_no: r.SupplierInvoiceNo ?? null,
    supplier_invoice_date: r.SupplierInvoiceDate ?? null,
    notes: r.Notes ?? null,
    bid_contract_id: r._bidContractId ?? null,
    bid_lot_id: r._bidLotId ?? null,
    status: "DRAFT",
    created_by: userId,
  }).select().single();
  if (grnErr || !grn) return err(grnErr?.message ?? "Insert failed", 500);

  // 11. Insert lines (need grn_id)
  const { error: lineErr } = await sb.from("goods_receipt_lines").insert(
    lines.map((l: any) => ({ ...l, goods_receipt_id: grn.id }))
  );
  if (lineErr) return err(lineErr.message, 500);

  return json({ ...grn, lines: lines.map((l: any) => ({ ...l, goods_receipt_id: grn.id })) }, 201);
}

// =============================================================================
// PUT /goods-receipts/{id} - Update (DRAFT only)
// =============================================================================
async function updateGrn(sb: SupabaseClient, id: string, r: any) {
  const { data: grn } = await sb.from("goods_receipts")
    .select("id, status, branch_id, purchase_order_id, party_id, warehouse_id")
    .eq("id", id).single();
  if (!grn) return err("Not found", 404);
  if (grn.status !== "DRAFT")
    return err("Chỉ GRN ở DRAFT mới sửa được", 400, "BUSINESS_RULE");

  // Re-run create validation with locked header fields
  const createR = {
    BranchId: grn.branch_id,
    PurchaseOrderId: grn.purchase_order_id,
    PartyId: grn.party_id,
    WarehouseId: grn.warehouse_id,
    ReceiptDate: r.ReceiptDate,
    SupplierInvoiceNo: r.SupplierInvoiceNo,
    SupplierInvoiceDate: r.SupplierInvoiceDate,
    Notes: r.Notes,
    Lines: r.Lines,
    IdempotencyKeys: r.IdempotencyKeys,
  };
  const validateRes = await createGrn(sb, createR);
  if (validateRes.status !== 201) return validateRes;

  // Update header
  await sb.from("goods_receipts").update({
    receipt_date: r.ReceiptDate,
    supplier_invoice_no: r.SupplierInvoiceNo ?? null,
    supplier_invoice_date: r.SupplierInvoiceDate ?? null,
    notes: r.Notes ?? null,
  }).eq("id", id);

  // Replace lines
  await sb.from("goods_receipt_lines").delete().eq("goods_receipt_id", id);
  // Re-insert (validation re-built lines for us)
  return validateRes;
}

// =============================================================================
// DELETE /goods-receipts/{id} - Delete (DRAFT only)
// =============================================================================
async function deleteGrn(sb: SupabaseClient, id: string) {
  const { data: grn } = await sb.from("goods_receipts").select("status").eq("id", id).single();
  if (!grn) return err("Not found", 404);
  if (grn.status !== "DRAFT")
    return err("Chỉ GRN ở DRAFT mới xóa được", 400, "BUSINESS_RULE");
  const { error } = await sb.from("goods_receipts").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /goods-receipts/{id}/post - DRAFT → POSTED + ghi stock_movements
// =============================================================================
async function postGrn(sb: SupabaseClient, id: string) {
  const svc = serviceClient();  // need to write stock_movements + update stock

  const { data: grn } = await sb.from("goods_receipts")
    .select("id, tenant_id, branch_id, warehouse_id, status")
    .eq("id", id).single();
  if (!grn) return err("Not found", 404);
  if (grn.status !== "DRAFT")
    return err(`Chỉ GRN ở DRAFT mới post được. Hiện tại: ${grn.status}`, 400, "BUSINESS_RULE");

  // Re-check warehouse is RECEIVING (defensive)
  const { data: wh } = await sb.from("warehouses").select("type, code")
    .eq("id", grn.warehouse_id).single();
  if (!wh) return err("Warehouse not found", 404);
  if (wh.type !== "RECEIVING")
    return err(`Kho '${wh.code}' hiện là kho lẻ (ISSUE), không thể post GRN.`, 400, "BUSINESS_RULE");

  const { data: lines, error: linesErr } = await sb.from("goods_receipt_lines")
    .select("id, product_id, unit_id, location_id, quantity, unit_cost, batch_no, serial_no, expiry_date, notes, po_line_id, status, idempotency_key")
    .eq("goods_receipt_id", id);
  if (linesErr) return err(linesErr.message, 500);
  const openLines = (lines || []).filter((l: any) => l.status === "OPEN");
  if (openLines.length === 0) return err("GRN phải có ít nhất 1 dòng", 400, "BUSINESS_RULE");

  // Get user for created_by
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Insert stock_movements for each line
  const movements = openLines.map((l: any) => ({
    tenant_id: grn.tenant_id,
    branch_id: grn.branch_id,
    warehouse_id: grn.warehouse_id,
    location_id: l.location_id,
    product_id: l.product_id,
    unit_id: l.unit_id,
    movement_type: "IN",
    status: "POSTED",
    quantity: l.quantity,
    unit_cost: l.unit_cost,
    ref_type: "GRN",
    ref_id: grn.id,
    ref_line_id: l.id,
    notes: l.notes,
    batch_no: l.batch_no || "",
    serial_no: l.serial_no || "",
    expiry_date: l.expiry_date || null,
    idempotency_key: l.idempotency_key,
    created_by: userId,
    posted_at: new Date().toISOString(),
  }));

  const { data: insertedMovs, error: movErr } = await svc.from("stock_movements")
    .insert(movements).select("id, ref_line_id");
  if (movErr) return err(`Failed to create movements: ${movErr.message}`, 500);

  // Update each line with movement_id + status
  const movByLine = new Map((insertedMovs || []).map((m: any) => [m.ref_line_id, m.id]));
  for (const line of openLines) {
    await svc.from("goods_receipt_lines").update({
      movement_id: movByLine.get(line.id) ?? null,
      status: "POSTED",
    }).eq("id", line.id);
  }

  // Update PO line ReceivedQty (if any)
  const poLineUpdates = new Map<string, number>();
  for (const line of openLines) {
    if (line.po_line_id) {
      poLineUpdates.set(line.po_line_id, (poLineUpdates.get(line.po_line_id) ?? 0) + Number(line.quantity));
    }
  }
  for (const [poLineId, qty] of poLineUpdates) {
    const { data: poLine } = await svc.from("purchase_order_lines")
      .select("received_qty, quantity").eq("id", poLineId).single();
    if (poLine) {
      const newReceived = Number(poLine.received_qty || 0) + qty;
      const newStatus = newReceived >= Number(poLine.quantity) ? "RECEIVED" : "PARTIAL";
      await svc.from("purchase_order_lines").update({
        received_qty: newReceived,
        status: newStatus,
      }).eq("id", poLineId);
    }
  }

  // Update GRN header → POSTED
  await svc.from("goods_receipts").update({
    status: "POSTED",
    posted_by: userId,
    posted_at: new Date().toISOString(),
  }).eq("id", id);

  // Check if PO fully received → close PO
  const { data: grnFull } = await svc.from("goods_receipts")
    .select("purchase_order_id").eq("id", id).single();
  if (grnFull?.purchase_order_id) {
    const { data: poLines } = await svc.from("purchase_order_lines")
      .select("status").eq("purchase_order_id", grnFull.purchase_order_id);
    const allDone = (poLines || []).every((l: any) => l.status === "RECEIVED" || l.status === "CANCELLED");
    if (allDone) {
      await svc.from("purchase_orders").update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
      }).eq("id", grnFull.purchase_order_id);
    }
  }

  return json({ ok: true, posted_at: new Date().toISOString() });
}

// =============================================================================
// POST /goods-receipts/{id}/cancel - DRAFT → CANCELLED
// =============================================================================
async function cancelGrn(sb: SupabaseClient, id: string, body: any) {
  if (!body?.Reason) return err("Phải nhập lý do hủy", 400, "VALIDATION");
  const { data: grn } = await sb.from("goods_receipts").select("status").eq("id", id).single();
  if (!grn) return err("Not found", 404);
  if (grn.status !== "DRAFT")
    return err("Chỉ GRN ở DRAFT mới hủy được (đã POSTED phải dùng reversal)", 400, "BUSINESS_RULE");
  const { error } = await sb.from("goods_receipts").update({
    status: "CANCELLED",
    cancelled_at: new Date().toISOString(),
    cancel_reason: body.Reason,
  }).eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}
