// Supabase Edge Function: stock-transfers
// Handles phiếu chuyển kho CRUD + workflow (DRAFT → IN_TRANSIT → RECEIVED, hoặc CANCELLED)
//
// POST   /functions/v1/stock-transfers                  - create (DRAFT)
// PUT    /functions/v1/stock-transfers/{id}             - update (DRAFT only)
// DELETE /functions/v1/stock-transfers/{id}             - delete (DRAFT only)
// POST   /functions/v1/stock-transfers/{id}/ship        - DRAFT → IN_TRANSIT
//                                                       (ghi stock_movements TRANSFER_OUT từ kho nguồn)
// POST   /functions/v1/stock-transfers/{id}/receive     - IN_TRANSIT → RECEIVED (partial OK)
//                                                       (ghi stock_movements TRANSFER_IN vào kho đích theo received_qty)
// POST   /functions/v1/stock-transfers/{id}/cancel      - CANCELLED (yêu cầu reason)
//                                                       (Nếu IN_TRANSIT → INSERT COMPENSATING TRANSFER_IN
//                                                        ngược lại kho nguồn để bù hàng)
//
// List/Get: handled by PostgREST (tables stock_transfers + stock_transfer_lines)
//
// Deploy: supabase functions deploy stock-transfers --no-verify-jwt

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

// Service role bypasses RLS (cho việc ghi stock_movements + update stock do trigger).
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/stock-transfers/{id}/{action}
  // pathParts after "stock-transfers": ["<id>", "<action>"] | ["<action>"] | []
  const tail = pathParts.slice(pathParts.indexOf("stock-transfers") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createTransfer(sb, body);
    if (req.method === "PUT" && id) return await updateTransfer(sb, id, body);
    if (req.method === "DELETE" && id) return await deleteTransfer(sb, id);
    if (req.method === "POST" && id && action === "ship") return await shipTransfer(sb, id);
    if (req.method === "POST" && id && action === "receive") return await receiveTransfer(sb, id, body);
    if (req.method === "POST" && id && action === "cancel") return await cancelTransfer(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /stock-transfers - Create (DRAFT)
// =============================================================================
async function createTransfer(sb: SupabaseClient, r: any) {
  // 1. Validate cơ bản
  if (!r.Lines || r.Lines.length === 0) return err("Phiếu chuyển kho phải có ít nhất 1 dòng");
  if (r.FromBranchId === r.ToBranchId && r.FromWarehouseId === r.ToWarehouseId)
    return err("Kho nguồn và kho đích phải khác nhau", 400, "VALIDATION");
  if (new Set(r.Lines.map((l: any) => l.IdempotencyKey)).size !== r.Lines.length)
    return err("Idempotency keys phải unique");

  // 2. Validate from_warehouse thuộc from_branch
  const { data: srcWh } = await sb.from("warehouses")
    .select("id, branch_id, allow_negative, code").eq("id", r.FromWarehouseId).single();
  if (!srcWh) return err(`Kho nguồn không tồn tại`, 404);
  if (srcWh.branch_id !== r.FromBranchId)
    return err(`Kho nguồn '${srcWh.code}' không thuộc branch ${r.FromBranchId}`, 404);

  // 3. Validate to_warehouse thuộc to_branch
  const { data: dstWh } = await sb.from("warehouses")
    .select("id, branch_id, code").eq("id", r.ToWarehouseId).single();
  if (!dstWh) return err(`Kho đích không tồn tại`, 404);
  if (dstWh.branch_id !== r.ToBranchId)
    return err(`Kho đích '${dstWh.code}' không thuộc branch ${r.ToBranchId}`, 404);

  // 4. Validate locations thuộc đúng kho tương ứng
  const locationIds = [...new Set(r.Lines.flatMap((l: any) => [l.FromLocationId, l.ToLocationId]))];
  const { data: locs } = await sb.from("locations")
    .select("id, warehouse_id").in("id", locationIds);
  const locMap = new Map((locs || []).map((l: any) => [l.id, l.warehouse_id]));
  for (let i = 0; i < r.Lines.length; i++) {
    const line = r.Lines[i];
    if (Number(line.Quantity) <= 0) return err(`Dòng ${i + 1}: số lượng phải > 0`, 400, "VALIDATION");
    if (locMap.get(line.FromLocationId) !== r.FromWarehouseId)
      return err(`Dòng ${i + 1}: from_location không thuộc kho nguồn`, 400, "VALIDATION");
    if (locMap.get(line.ToLocationId) !== r.ToWarehouseId)
      return err(`Dòng ${i + 1}: to_location không thuộc kho đích`, 400, "VALIDATION");
  }

  // 5. Generate transfer_number: TR-YYYYMM-NNNN
  const now = new Date();
  const prefix = `TR-${now.toISOString().slice(0, 7).replace("-", "")}-`;
  const { count } = await sb.from("stock_transfers")
    .select("id", { count: "exact", head: true })
    .like("transfer_number", `${prefix}%`);
  const transferNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // 6. Lấy user từ JWT
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 7. Load products + units + location codes để denormalize
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u.code]));
  const fromLocCodes = new Map((locs || []).filter((l: any) => true).map((l: any) => [l.id, l.id])); // sẽ load code bên dưới
  // Load location codes riêng
  const { data: locsFull } = await sb.from("locations").select("id, code").in("id", locationIds);
  const locCodeMap = new Map((locsFull || []).map((l: any) => [l.id, l.code]));

  // 8. Build lines
  const lines = r.Lines.map((line: any, i: number) => ({
    tenant_id: undefined,
    line_no: i + 1,
    product_id: line.ProductId,
    product_name: productMap.get(line.ProductId) ?? "",
    unit_id: line.UnitId,
    unit_code: unitMap.get(line.UnitId) ?? "",
    from_location_id: line.FromLocationId,
    from_location_code: locCodeMap.get(line.FromLocationId) ?? "",
    to_location_id: line.ToLocationId,
    to_location_code: locCodeMap.get(line.ToLocationId) ?? "",
    quantity: line.Quantity,
    shipped_qty: 0,
    received_qty: 0,
    batch_no: line.BatchNo ?? "",
    serial_no: line.SerialNo ?? "",
    expiry_date: line.ExpiryDate ?? null,
    notes: line.Notes ?? null,
    status: "OPEN",
  }));

  // 9. Insert header
  const { data: transfer, error: trErr } = await sb.from("stock_transfers").insert({
    transfer_number: transferNumber,
    from_branch_id: r.FromBranchId,
    from_warehouse_id: r.FromWarehouseId,
    to_branch_id: r.ToBranchId,
    to_warehouse_id: r.ToWarehouseId,
    transfer_date: r.TransferDate,
    expected_receipt_date: r.ExpectedReceiptDate ?? null,
    notes: r.Notes ?? null,
    status: "DRAFT",
    created_by: userId,
  }).select().single();
  if (trErr || !transfer) return err(trErr?.message ?? "Insert failed", 500);

  // 10. Insert lines
  const { error: lineErr } = await sb.from("stock_transfer_lines").insert(
    lines.map((l: any) => ({ ...l, stock_transfer_id: transfer.id }))
  );
  if (lineErr) return err(lineErr.message, 500);

  return json({ ...transfer, lines: lines.map((l: any) => ({ ...l, stock_transfer_id: transfer.id })) }, 201);
}

// =============================================================================
// PUT /stock-transfers/{id} - Update (DRAFT only)
// =============================================================================
async function updateTransfer(sb: SupabaseClient, id: string, r: any) {
  const { data: transfer } = await sb.from("stock_transfers")
    .select("id, status, from_branch_id, from_warehouse_id, to_branch_id, to_warehouse_id, transfer_date, expected_receipt_date, notes")
    .eq("id", id).single();
  if (!transfer) return err("Not found", 404);
  if (transfer.status !== "DRAFT")
    return err("Chỉ phiếu chuyển kho ở DRAFT mới sửa được", 400, "BUSINESS_RULE");

  // Update các field header cơ bản (giữ nguyên from/to warehouse/branch)
  const patch: any = {};
  if (r.TransferDate) patch.transfer_date = r.TransferDate;
  if (r.ExpectedReceiptDate !== undefined) patch.expected_receipt_date = r.ExpectedReceiptDate;
  if (r.Notes !== undefined) patch.notes = r.Notes;

  if (r.Lines && r.Lines.length > 0) {
    // Re-build lines bằng cách re-run validation đầy đủ
    const createR = {
      FromBranchId: transfer.from_branch_id,
      FromWarehouseId: transfer.from_warehouse_id,
      ToBranchId: transfer.to_branch_id,
      ToWarehouseId: transfer.to_warehouse_id,
      TransferDate: r.TransferDate ?? transfer.transfer_date,
      ExpectedReceiptDate: r.ExpectedReceiptDate ?? transfer.expected_receipt_date,
      Notes: r.Notes ?? transfer.notes,
      Lines: r.Lines,
    };
    const validateRes = await createTransfer(sb, createR);
    if (validateRes.status !== 201) return validateRes;
    // Replace lines
    await sb.from("stock_transfer_lines").delete().eq("stock_transfer_id", id);
    return validateRes;
  }

  if (Object.keys(patch).length > 0) {
    await sb.from("stock_transfers").update(patch).eq("id", id);
  }
  return json({ ok: true });
}

// =============================================================================
// DELETE /stock-transfers/{id} - Delete (DRAFT only)
// =============================================================================
async function deleteTransfer(sb: SupabaseClient, id: string) {
  const { data: transfer } = await sb.from("stock_transfers").select("status").eq("id", id).single();
  if (!transfer) return err("Not found", 404);
  if (transfer.status !== "DRAFT")
    return err("Chỉ phiếu chuyển kho ở DRAFT mới xóa được", 400, "BUSINESS_RULE");
  const { error } = await sb.from("stock_transfers").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /stock-transfers/{id}/ship - DRAFT → IN_TRANSIT
//   Ghi stock_movements TRANSFER_OUT từ kho nguồn (from_location)
//   Mỗi line: quantity ra = shipped_qty = line.quantity, status line → IN_TRANSIT
// =============================================================================
async function shipTransfer(sb: SupabaseClient, id: string) {
  const svc = serviceClient();

  const { data: transfer } = await sb.from("stock_transfers")
    .select("id, tenant_id, status, from_branch_id, from_warehouse_id, notes")
    .eq("id", id).single();
  if (!transfer) return err("Not found", 404);
  if (transfer.status !== "DRAFT")
    return err(`Chỉ phiếu DRAFT mới ship được. Hiện tại: ${transfer.status}`, 400, "BUSINESS_RULE");

  const { data: lines, error: linesErr } = await sb.from("stock_transfer_lines")
    .select("id, product_id, unit_id, from_location_id, quantity, batch_no, serial_no, expiry_date, notes, status")
    .eq("stock_transfer_id", id);
  if (linesErr) return err(linesErr.message, 500);
  const openLines = (lines || []).filter((l: any) => l.status === "OPEN");
  if (openLines.length === 0) return err("Phiếu phải có ít nhất 1 dòng OPEN", 400, "BUSINESS_RULE");

  // Pre-check tồn kho kho nguồn nếu warehouse không cho phép âm
  const { data: srcWh } = await sb.from("warehouses")
    .select("allow_negative, code").eq("id", transfer.from_warehouse_id).single();
  if (srcWh && !srcWh.allow_negative) {
    for (const line of openLines) {
      const { data: stock } = await svc.from("stock")
        .select("quantity").eq("branch_id", transfer.from_branch_id)
        .eq("warehouse_id", transfer.from_warehouse_id).eq("location_id", line.from_location_id)
        .eq("product_id", line.product_id).eq("batch_no", line.batch_no || "")
        .eq("serial_no", line.serial_no || "").maybeSingle();
      const stockQty = Number(stock?.quantity ?? 0);
      if (stockQty < Number(line.quantity)) {
        return err(
          `Tồn kho nguồn không đủ cho dòng ${line.line_no}: cần ${line.quantity}, có ${stockQty}`,
          400, "INSUFFICIENT_STOCK"
        );
      }
    }
  }

  // Lấy user
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Tạo TRANSFER_OUT movements (xuất khỏi kho nguồn)
  const movements = openLines.map((l: any) => ({
    tenant_id: transfer.tenant_id,
    branch_id: transfer.from_branch_id,
    warehouse_id: transfer.from_warehouse_id,
    location_id: l.from_location_id,
    product_id: l.product_id,
    unit_id: l.unit_id,
    movement_type: "TRANSFER_OUT",
    status: "POSTED",
    quantity: l.quantity,
    ref_type: "TRANSFER",
    ref_id: transfer.id,
    ref_line_id: l.id,
    notes: l.notes ?? transfer.notes,
    batch_no: l.batch_no || "",
    serial_no: l.serial_no || "",
    expiry_date: l.expiry_date || null,
    idempotency_key: crypto.randomUUID(),
    created_by: userId,
    posted_at: new Date().toISOString(),
  }));

  const { data: insertedMovs, error: movErr } = await svc.from("stock_movements")
    .insert(movements).select("id, ref_line_id");
  if (movErr) return err(`Failed to create movements: ${movErr.message}`, 500);

  // Update line: out_movement_id, shipped_qty, status → IN_TRANSIT
  const movByLine = new Map((insertedMovs || []).map((m: any) => [m.ref_line_id, m.id]));
  for (const line of openLines) {
    await svc.from("stock_transfer_lines").update({
      out_movement_id: movByLine.get(line.id) ?? null,
      shipped_qty: line.quantity,
      status: "IN_TRANSIT",
    }).eq("id", line.id);
  }

  // Update header: status IN_TRANSIT + out_shipped_*
  await svc.from("stock_transfers").update({
    status: "IN_TRANSIT",
    out_shipped_by: userId,
    out_shipped_at: new Date().toISOString(),
  }).eq("id", id);

  return json({ ok: true, shipped_at: new Date().toISOString() });
}

// =============================================================================
// POST /stock-transfers/{id}/receive - IN_TRANSIT → RECEIVED (partial OK)
//   Body: { Lines: [{ LineId, ReceivedQty }], Notes?: string }
//   Với mỗi line có ReceivedQty > 0: ghi stock_movements TRANSFER_IN vào to_location
//   Nếu tất cả lines đã received đủ (received_qty == shipped_qty) → header → RECEIVED
// =============================================================================
async function receiveTransfer(sb: SupabaseClient, id: string, body: any) {
  const svc = serviceClient();

  const { data: transfer } = await sb.from("stock_transfers")
    .select("id, tenant_id, status, to_branch_id, to_warehouse_id, notes")
    .eq("id", id).single();
  if (!transfer) return err("Not found", 404);
  if (transfer.status !== "IN_TRANSIT")
    return err(`Chỉ phiếu IN_TRANSIT mới nhận được. Hiện tại: ${transfer.status}`, 400, "BUSINESS_RULE");

  if (!body?.Lines || !Array.isArray(body.Lines) || body.Lines.length === 0)
    return err("Phải có ít nhất 1 dòng nhận (Lines[])", 400, "VALIDATION");

  const lineUpdates = new Map<string, number>();
  for (const l of body.Lines) {
    if (Number(l.ReceivedQty) < 0) return err("ReceivedQty phải >= 0", 400, "VALIDATION");
    lineUpdates.set(l.LineId, Number(l.ReceivedQty));
  }

  const { data: lines, error: linesErr } = await sb.from("stock_transfer_lines")
    .select("id, line_no, product_id, unit_id, to_location_id, shipped_qty, batch_no, serial_no, expiry_date, notes, status")
    .eq("stock_transfer_id", id);
  if (linesErr) return err(linesErr.message, 500);
  const inTransitLines = (lines || []).filter((l: any) => l.status === "IN_TRANSIT");
  if (inTransitLines.length === 0) return err("Không có dòng IN_TRANSIT nào để nhận", 400, "BUSINESS_RULE");

  // Lấy user
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Ghi TRANSFER_IN cho mỗi line có ReceivedQty > 0
  const inMovements: any[] = [];
  for (const line of inTransitLines) {
    if (!lineUpdates.has(line.id)) continue;
    const receivedQty = lineUpdates.get(line.id)!;
    if (receivedQty > Number(line.shipped_qty))
      return err(`Dòng ${line.line_no}: ReceivedQty (${receivedQty}) vượt quá ShippedQty (${line.shipped_qty})`, 400, "VALIDATION");
    if (receivedQty > 0) {
      inMovements.push({
        line,
        movement: {
          tenant_id: transfer.tenant_id,
          branch_id: transfer.to_branch_id,
          warehouse_id: transfer.to_warehouse_id,
          location_id: line.to_location_id,
          product_id: line.product_id,
          unit_id: line.unit_id,
          movement_type: "TRANSFER_IN",
          status: "POSTED",
          quantity: receivedQty,
          ref_type: "TRANSFER",
          ref_id: transfer.id,
          ref_line_id: line.id,
          notes: body.Notes ?? transfer.notes,
          batch_no: line.batch_no || "",
          serial_no: line.serial_no || "",
          expiry_date: line.expiry_date || null,
          idempotency_key: crypto.randomUUID(),
          created_by: userId,
          posted_at: new Date().toISOString(),
        },
      });
    }
  }

  if (inMovements.length > 0) {
    const { data: inserted, error: inErr } = await svc.from("stock_movements")
      .insert(inMovements.map((x) => x.movement)).select("id, ref_line_id");
    if (inErr) return err(`Failed to create IN movements: ${inErr.message}`, 500);
    const inMovByLine = new Map((inserted || []).map((m: any) => [m.ref_line_id, m.id]));
    for (const item of inMovements) {
      await svc.from("stock_transfer_lines").update({
        in_movement_id: inMovByLine.get(item.line.id) ?? null,
        received_qty: lineUpdates.get(item.line.id) ?? 0,
      }).eq("id", item.line.id);
    }
  }

  // Cập nhật status từng line: nếu received_qty == shipped_qty → RECEIVED, ngược lại giữ IN_TRANSIT
  for (const line of inTransitLines) {
    if (!lineUpdates.has(line.id)) continue;
    const receivedQty = lineUpdates.get(line.id)!;
    const newLineStatus = receivedQty >= Number(line.shipped_qty) ? "RECEIVED" : "IN_TRANSIT";
    await svc.from("stock_transfer_lines").update({ status: newLineStatus }).eq("id", line.id);
  }

  // Nếu tất cả lines đã RECEIVED → đóng phiếu
  const { data: allLines } = await svc.from("stock_transfer_lines")
    .select("status").eq("stock_transfer_id", id);
  const allReceived = (allLines || []).length > 0 &&
    (allLines || []).every((l: any) => l.status === "RECEIVED");
  if (allReceived) {
    await svc.from("stock_transfers").update({
      status: "RECEIVED",
      in_received_by: userId,
      in_received_at: new Date().toISOString(),
    }).eq("id", id);
  }

  return json({ ok: true, all_received: allReceived, received_at: new Date().toISOString() });
}

// =============================================================================
// POST /stock-transfers/{id}/cancel - CANCELLED (yêu cầu reason)
//
//   Nếu status = DRAFT: chỉ cần update header.
//   Nếu status = IN_TRANSIT: đã ghi TRANSFER_OUT trước đó → phải INSERT
//     COMPENSATING TRANSFER_IN ngược lại kho nguồn (from_location) với quantity
//     = shipped_qty. Mục đích: bù lại hàng đã xuất ra.
//   Nếu status = RECEIVED / CANCELLED: không cho hủy.
// =============================================================================
async function cancelTransfer(sb: SupabaseClient, id: string, body: any) {
  const svc = serviceClient();

  if (!body?.Reason) return err("Phải nhập lý do hủy", 400, "VALIDATION");
  const { data: transfer } = await sb.from("stock_transfers")
    .select("id, tenant_id, status, from_branch_id, from_warehouse_id, notes")
    .eq("id", id).single();
  if (!transfer) return err("Not found", 404);
  if (transfer.status === "RECEIVED" || transfer.status === "CANCELLED")
    return err(`Không thể hủy phiếu đã ${transfer.status}`, 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Nếu IN_TRANSIT → cần tạo COMPENSATING TRANSFER_IN ngược lại kho nguồn
  if (transfer.status === "IN_TRANSIT") {
    const { data: lines, error: linesErr } = await sb.from("stock_transfer_lines")
      .select("id, line_no, product_id, unit_id, from_location_id, shipped_qty, batch_no, serial_no, expiry_date, status")
      .eq("stock_transfer_id", id);
    if (linesErr) return err(linesErr.message, 500);

    const linesToCompensate = (lines || []).filter(
      (l: any) => Number(l.shipped_qty) > 0 && l.status !== "CANCELLED"
    );

    if (linesToCompensate.length > 0) {
      const compensatingMovements = linesToCompensate.map((l: any) => ({
        tenant_id: transfer.tenant_id,
        branch_id: transfer.from_branch_id,        // trả về kho nguồn
        warehouse_id: transfer.from_warehouse_id,
        location_id: l.from_location_id,
        product_id: l.product_id,
        unit_id: l.unit_id,
        movement_type: "TRANSFER_IN",              // ngược lại: nhập lại kho nguồn
        status: "POSTED",
        quantity: l.shipped_qty,                   // bù đúng số đã xuất
        ref_type: "TRANSFER",
        ref_id: transfer.id,
        ref_line_id: l.id,
        notes: `Hoàn từ phiếu chuyển kho bị hủy: ${body.Reason}`,
        batch_no: l.batch_no || "",
        serial_no: l.serial_no || "",
        expiry_date: l.expiry_date || null,
        idempotency_key: crypto.randomUUID(),
        created_by: userId,
        posted_at: new Date().toISOString(),
      }));

      const { error: movErr } = await svc.from("stock_movements")
        .insert(compensatingMovements);
      if (movErr) return err(`Failed to create compensating movements: ${movErr.message}`, 500);
    }
  }

  // Update header → CANCELLED
  await svc.from("stock_transfers").update({
    status: "CANCELLED",
    cancel_reason: body.Reason,
    cancelled_by: userId,
    cancelled_at: new Date().toISOString(),
  }).eq("id", id);

  return json({ ok: true });
}
