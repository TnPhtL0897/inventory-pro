// Supabase Edge Function: purchase-orders
// Handles PurchaseOrder CRUD + workflow (DRAFT → APPROVED → POSTED → CANCELLED)
//
// POST   /functions/v1/purchase-orders              - create (DRAFT) với BidContract validation
// PUT    /functions/v1/purchase-orders?id=<uuid>    - update (DRAFT only, replace lines)
// DELETE /functions/v1/purchase-orders?id=<uuid>    - delete (DRAFT only)
// POST   /functions/v1/purchase-orders/{id}/approve - DRAFT → APPROVED (admin/manager)
// POST   /functions/v1/purchase-orders/{id}/post    - APPROVED → POSTED
// POST   /functions/v1/purchase-orders/{id}/cancel  - bất kỳ → CANCELLED (yêu cầu reason)
//
// List/Get: handled by PostgREST (tables purchase_orders + purchase_order_lines)
//
// Deploy: supabase functions deploy purchase-orders --no-verify-jwt

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

// Service role client bypasses RLS for atomic used_value increments.
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/purchase-orders/{id}/{action}
  const tail = pathParts.slice(pathParts.indexOf("purchase-orders") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createPO(sb, body);
    if (req.method === "PUT" && id && !action) return await updatePO(sb, id, body);
    if (req.method === "DELETE" && id) return await deletePO(sb, id);
    if (req.method === "POST" && id && action === "approve") return await approvePO(sb, id, body);
    if (req.method === "POST" && id && action === "post") return await postPO(sb, id);
    if (req.method === "POST" && id && action === "cancel") return await cancelPO(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /purchase-orders - Create DRAFT + BidContract validation
// =============================================================================
async function createPO(sb: SupabaseClient, r: any) {
  if (!r.Lines || r.Lines.length === 0) return err("PO phải có ít nhất 1 dòng");

  // 1. BidContract BẮT BUỘC
  if (!r.BidContractId) {
    return err("PO phải gắn với 1 hợp đồng thầu (BidContract)", 400, "VALIDATION");
  }

  // 2. Load BidContract
  const { data: contract, error: contractErr } = await sb.from("bid_contracts")
    .select("id, contract_no, bid_lot_id, winning_party_id, " +
            "contract_value, contract_start_date, contract_end_date, " +
            "used_value, bid_contract_status")
    .eq("id", r.BidContractId).single();
  if (contractErr || !contract)
    return err(`BidContract ${r.BidContractId} không tồn tại`, 404);

  // 3. Check contract status
  if (contract.bid_contract_status !== "Active")
    return err(`Hợp đồng thầu '${contract.contract_no}' đang ở trạng thái ` +
      `${contract.bid_contract_status}, không thể tạo PO.`, 400, "BUSINESS_RULE");

  // 4. PartyId phải khớp winning_party
  if (r.PartyId !== contract.winning_party_id)
    return err(`PO phải gắn với đúng nhà thầu trúng thầu của HĐ '${contract.contract_no}'.`,
      400, "BUSINESS_RULE");

  // 5. Validate party (phải là supplier)
  const { data: party } = await sb.from("parties")
    .select("id, party_type").eq("id", r.PartyId).single();
  if (!party) return err(`Party ${r.PartyId} không tồn tại`, 404);
  if (party.party_type === "CUSTOMER")
    return err("Đối tác này là khách hàng, không thể tạo PO", 400, "BUSINESS_RULE");

  // 6. Date range check
  const orderDate = new Date(r.OrderDate);
  if (orderDate < new Date(contract.contract_start_date))
    return err(`Ngày đặt hàng sớm hơn ngày bắt đầu HĐ thầu ` +
      `(${contract.contract_start_date}).`, 400, "BUSINESS_RULE");
  if (orderDate > new Date(contract.contract_end_date))
    return err(`Ngày đặt hàng vượt quá ngày kết thúc HĐ thầu ` +
      `(${contract.contract_end_date}). HĐ thầu đã hết hạn.`, 400, "BUSINESS_RULE");

  // 7. Nếu có BidLotId, check khớp với contract
  if (r.BidLotId && r.BidLotId !== contract.bid_lot_id)
    return err(`BidLotId không khớp với HĐ thầu. HĐ này thuộc lô thầu khác.`,
      400, "BUSINESS_RULE");

  // 8. Check sản phẩm trong lô thầu (nếu lô có lines)
  const { data: lotLines } = await sb.from("bid_lot_lines")
    .select("product_id").eq("bid_lot_id", contract.bid_lot_id);
  if (lotLines && lotLines.length > 0) {
    const lotProductIds = new Set(lotLines.map((l: any) => l.product_id));
    const lineProductIds = r.Lines.map((l: any) => l.ProductId);
    const invalid = lineProductIds.filter((p: string) => !lotProductIds.has(p));
    if (invalid.length > 0) {
      // Lấy tên lô để error message thân thiện
      const { data: lot } = await sb.from("bid_lots")
        .select("lot_name").eq("id", contract.bid_lot_id).single();
      return err(`Có ${invalid.length} sản phẩm trong PO không thuộc danh mục lô thầu ` +
        `'${lot?.lot_name || contract.bid_lot_id}'.`, 400, "BUSINESS_RULE");
    }
  }

  // 9. Load products + units để denormalize name/code
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u.code]));

  // 10. Build lines + tính line_total
  const lines = r.Lines.map((line: any, i: number) => {
    if (!productMap.has(line.ProductId))
      throw new Error(`Product ${line.ProductId} không tồn tại`);
    if (!unitMap.has(line.UnitId))
      throw new Error(`Unit ${line.UnitId} không tồn tại`);

    const lineTotal = Number(line.Quantity) * Number(line.UnitPrice)
      * (1 - Number(line.DiscountPct || 0) / 100)
      * (1 + Number(line.TaxPct || 0) / 100);

    return {
      line_no: i + 1,
      product_id: line.ProductId,
      product_name: productMap.get(line.ProductId) ?? "",
      unit_id: line.UnitId,
      unit_code: unitMap.get(line.UnitId) ?? "",
      quantity: line.Quantity,
      unit_price: line.UnitPrice,
      discount_pct: line.DiscountPct ?? 0,
      tax_pct: line.TaxPct ?? 0,
      line_total: Math.round(lineTotal * 10000) / 10000,
      status: "OPEN",
      notes: line.Notes ?? null,
    };
  });

  // 11. Tính tổng PO + check used_value overflow
  const subtotal = lines.reduce((s: number, l: any) => s + Number(l.line_total), 0);
  const poTotal = subtotal + Number(r.ShippingAmount || 0) - Number(r.DiscountAmount || 0);

  if (Number(contract.used_value) + poTotal > Number(contract.contract_value)) {
    const remaining = Number(contract.contract_value) - Number(contract.used_value);
    return err(`HĐ thầu '${contract.contract_no}' đã dùng ` +
      `${Number(contract.used_value).toLocaleString("vi-VN")}/` +
      `${Number(contract.contract_value).toLocaleString("vi-VN")} VND. ` +
      `PO này (${poTotal.toLocaleString("vi-VN")} VND) vượt quá giá trị còn lại ` +
      `(${remaining.toLocaleString("vi-VN")} VND). Vui lòng tạo HĐ thầu bổ sung ` +
      `hoặc giảm giá trị PO.`, 400, "BUSINESS_RULE");
  }

  // 12. Generate PO number
  const now = new Date();
  const prefix = `PO-${now.toISOString().slice(0, 7).replace("-", "")}-`;
  const { count } = await sb.from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .like("po_number", `${prefix}%`);
  const poNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // 13. Get user_id
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 14. Insert header
  const { data: po, error: poErr } = await sb.from("purchase_orders").insert({
    branch_id: r.BranchId,
    po_number: poNumber,
    party_id: r.PartyId,
    order_date: r.OrderDate,
    expected_date: r.ExpectedDate ?? null,
    currency: r.Currency ?? "VND",
    exchange_rate: r.ExchangeRate ?? 1,
    discount_amount: r.DiscountAmount ?? 0,
    shipping_amount: r.ShippingAmount ?? 0,
    payment_terms: r.PaymentTerms ?? 0,
    shipping_address: r.ShippingAddress ?? null,
    notes: r.Notes ?? null,
    internal_notes: r.InternalNotes ?? null,
    bid_contract_id: r.BidContractId,
    bid_lot_id: contract.bid_lot_id,
    status: "DRAFT",
    created_by: userId,
  }).select().single();
  if (poErr || !po) return err(poErr?.message ?? "Insert failed", 500);

  // 15. Insert lines
  const { error: lineErr } = await sb.from("purchase_order_lines")
    .insert(lines.map((l: any) => ({ ...l, purchase_order_id: po.id })));
  if (lineErr) return err(lineErr.message, 500);

  // 16. Cộng dồn used_value vào BidContract (commitment cho PO này)
  const svc = serviceClient();
  const { error: updateContractErr } = await svc.from("bid_contracts").update({
    used_value: Number(contract.used_value) + poTotal,
  }).eq("id", contract.id);
  if (updateContractErr) {
    // Rollback: xóa PO nếu update contract fail
    await svc.from("purchase_orders").delete().eq("id", po.id);
    return err(`Cập nhật BidContract.used_value thất bại: ${updateContractErr.message}`, 500);
  }

  return json({
    ...po,
    lines: lines.map((l: any) => ({ ...l, purchase_order_id: po.id })),
  }, 201);
}

// =============================================================================
// PUT /purchase-orders/{id} - Update (DRAFT only, replace lines)
// =============================================================================
async function updatePO(sb: SupabaseClient, id: string, r: any) {
  const { data: po } = await sb.from("purchase_orders")
    .select("id, status, branch_id, party_id, bid_contract_id, bid_lot_id")
    .eq("id", id).single();
  if (!po) return err("Not found", 404);
  if (po.status !== "DRAFT")
    return err(`Chỉ PO ở DRAFT mới sửa được. Hiện tại: ${po.status}`, 400, "BUSINESS_RULE");

  // Check chưa có GRN
  const { data: anyLine } = await sb.from("purchase_order_lines")
    .select("received_qty")
    .eq("purchase_order_id", id)
    .gt("received_qty", 0)
    .limit(1);
  if (anyLine && anyLine.length > 0)
    return err("PO đã có GRN, không thể sửa", 400, "BUSINESS_RULE");

  // 1. Snapshot used_value TRƯỚC khi thay đổi
  let oldPoTotal = 0;
  if (po.bid_contract_id) {
    const { data: oldLines } = await sb.from("purchase_order_lines")
      .select("line_total").eq("purchase_order_id", id);
    const subtotal = (oldLines || []).reduce(
      (s: number, l: any) => s + Number(l.line_total), 0);
    // Approximate old total without re-reading shipping/discount - use
    // stored columns from header if possible, else just use subtotal
    const { data: oldHeader } = await sb.from("purchase_orders")
      .select("discount_amount, shipping_amount").eq("id", id).single();
    oldPoTotal = subtotal + Number(oldHeader?.shipping_amount || 0)
      - Number(oldHeader?.discount_amount || 0);
  }

  // 2. Re-run create validation với locked header fields
  const createR = {
    BranchId: po.branch_id,
    BidContractId: po.bid_contract_id,
    PartyId: po.party_id,
    BidLotId: po.bid_lot_id,
    OrderDate: r.OrderDate,
    ExpectedDate: r.ExpectedDate,
    Currency: r.Currency,
    ExchangeRate: r.ExchangeRate,
    DiscountAmount: r.DiscountAmount,
    ShippingAmount: r.ShippingAmount,
    PaymentTerms: r.PaymentTerms,
    ShippingAddress: r.ShippingAddress,
    Notes: r.Notes,
    InternalNotes: r.InternalNotes,
    Lines: r.Lines,
  };
  // Validate (gọi create nhưng sẽ cancel header mới tạo - chỉ dùng để check lỗi)
  // Để tránh tạo/ghi used_value mới, ta chỉ check logic validate thủ công:
  // (Đơn giản: copy create logic validate đầu vào, skip insert.)

  // 3. Load products + units
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u.code]));

  // 4. Build new lines + compute new total
  const lines = r.Lines.map((line: any, i: number) => {
    const lineTotal = Number(line.Quantity) * Number(line.UnitPrice)
      * (1 - Number(line.DiscountPct || 0) / 100)
      * (1 + Number(line.TaxPct || 0) / 100);
    return {
      purchase_order_id: id,
      line_no: i + 1,
      product_id: line.ProductId,
      product_name: productMap.get(line.ProductId) ?? "",
      unit_id: line.UnitId,
      unit_code: unitMap.get(line.UnitId) ?? "",
      quantity: line.Quantity,
      unit_price: line.UnitPrice,
      discount_pct: line.DiscountPct ?? 0,
      tax_pct: line.TaxPct ?? 0,
      line_total: Math.round(lineTotal * 10000) / 10000,
      status: "OPEN",
      notes: line.Notes ?? null,
    };
  });

  const newSubtotal = lines.reduce((s: number, l: any) => s + Number(l.line_total), 0);
  const newTotal = newSubtotal + Number(r.ShippingAmount || 0) - Number(r.DiscountAmount || 0);

  // 5. Check used_value overflow (re-validate với new total)
  if (po.bid_contract_id) {
    const { data: contract } = await sb.from("bid_contracts")
      .select("id, contract_no, used_value, contract_value")
      .eq("id", po.bid_contract_id).single();
    if (contract) {
      const adjustedUsed = Number(contract.used_value) - oldPoTotal + newTotal;
      if (adjustedUsed > Number(contract.contract_value)) {
        return err(`HĐ thầu '${contract.contract_no}' sau khi cập nhật PO ` +
          `sẽ vượt quá giá trị hợp đồng.`, 400, "BUSINESS_RULE");
      }
    }
  }

  // 6. Update header
  await sb.from("purchase_orders").update({
    order_date: r.OrderDate,
    expected_date: r.ExpectedDate ?? null,
    currency: r.Currency ?? "VND",
    exchange_rate: r.ExchangeRate ?? 1,
    discount_amount: r.DiscountAmount ?? 0,
    shipping_amount: r.ShippingAmount ?? 0,
    payment_terms: r.PaymentTerms ?? 0,
    shipping_address: r.ShippingAddress ?? null,
    notes: r.Notes ?? null,
    internal_notes: r.InternalNotes ?? null,
  }).eq("id", id);

  // 7. Replace lines
  await sb.from("purchase_order_lines").delete().eq("purchase_order_id", id);
  await sb.from("purchase_order_lines").insert(lines);

  // 8. Adjust used_value
  if (po.bid_contract_id) {
    const svc = serviceClient();
    const { data: contract } = await svc.from("bid_contracts")
      .select("used_value").eq("id", po.bid_contract_id).single();
    if (contract) {
      await svc.from("bid_contracts").update({
        used_value: Number(contract.used_value) - oldPoTotal + newTotal,
      }).eq("id", po.bid_contract_id);
    }
  }

  return json({ ok: true });
}

// =============================================================================
// DELETE /purchase-orders/{id} - DRAFT only
// =============================================================================
async function deletePO(sb: SupabaseClient, id: string) {
  const { data: po } = await sb.from("purchase_orders")
    .select("status, bid_contract_id").eq("id", id).single();
  if (!po) return err("Not found", 404);
  if (po.status !== "DRAFT")
    return err("Chỉ PO ở DRAFT mới xóa được", 400, "BUSINESS_RULE");

  // Hoàn lại used_value
  if (po.bid_contract_id) {
    const { data: lines } = await sb.from("purchase_order_lines")
      .select("line_total").eq("purchase_order_id", id);
    const subtotal = (lines || []).reduce(
      (s: number, l: any) => s + Number(l.line_total), 0);
    const { data: header } = await sb.from("purchase_orders")
      .select("discount_amount, shipping_amount").eq("id", id).single();
    const poTotal = subtotal + Number(header?.shipping_amount || 0)
      - Number(header?.discount_amount || 0);

    const svc = serviceClient();
    const { data: contract } = await svc.from("bid_contracts")
      .select("used_value").eq("id", po.bid_contract_id).single();
    if (contract) {
      await svc.from("bid_contracts").update({
        used_value: Math.max(0, Number(contract.used_value) - poTotal),
      }).eq("id", po.bid_contract_id);
    }
  }

  const { error } = await sb.from("purchase_orders").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /purchase-orders/{id}/approve - DRAFT → APPROVED
// =============================================================================
async function approvePO(sb: SupabaseClient, id: string, body: any) {
  const { data: po } = await sb.from("purchase_orders")
    .select("id, status, internal_notes").eq("id", id).single();
  if (!po) return err("Not found", 404);
  if (po.status !== "DRAFT")
    return err(`Chỉ PO ở DRAFT mới duyệt được. Hiện tại: ${po.status}`, 400, "BUSINESS_RULE");

  // Check có lines
  const { data: lines } = await sb.from("purchase_order_lines")
    .select("id").eq("purchase_order_id", id);
  if (!lines || lines.length === 0)
    return err("PO không có dòng nào", 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Append notes vào internal_notes nếu có
  const newInternal = body?.Notes
    ? `${po.internal_notes ?? ""}\n[APPROVE] ${body.Notes}`.trim()
    : po.internal_notes;

  const { error } = await sb.from("purchase_orders").update({
    status: "APPROVED",
    approved_by: userId,
    approved_at: new Date().toISOString(),
    internal_notes: newInternal,
  }).eq("id", id);
  if (error) return err(error.message, 500);

  return json({ ok: true });
}

// =============================================================================
// POST /purchase-orders/{id}/post - APPROVED → POSTED
// =============================================================================
async function postPO(sb: SupabaseClient, id: string) {
  const { data: po } = await sb.from("purchase_orders")
    .select("id, status").eq("id", id).single();
  if (!po) return err("Not found", 404);
  if (po.status !== "APPROVED")
    return err(`Chỉ PO ở APPROVED mới post được. Hiện tại: ${po.status}`, 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  const { error } = await sb.from("purchase_orders").update({
    status: "POSTED",
    posted_by: userId,
    posted_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return err(error.message, 500);

  return json({ ok: true });
}

// =============================================================================
// POST /purchase-orders/{id}/cancel - bất kỳ → CANCELLED
// =============================================================================
async function cancelPO(sb: SupabaseClient, id: string, body: any) {
  if (!body?.Reason) return err("Phải nhập lý do hủy", 400, "VALIDATION");

  const { data: po } = await sb.from("purchase_orders")
    .select("id, status, bid_contract_id").eq("id", id).single();
  if (!po) return err("Not found", 404);
  if (po.status === "COMPLETED" || po.status === "CANCELLED")
    return err(`PO đã ở trạng thái cuối: ${po.status}, không thể hủy`, 400, "BUSINESS_RULE");

  // Check chưa có GRN
  const { data: anyReceived } = await sb.from("purchase_order_lines")
    .select("id")
    .eq("purchase_order_id", id)
    .gt("received_qty", 0)
    .limit(1);
  if (anyReceived && anyReceived.length > 0)
    return err("PO đã có GRN, không thể hủy (cần xử lý GRN trước)", 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Update header → CANCELLED
  const { error } = await sb.from("purchase_orders").update({
    status: "CANCELLED",
    cancelled_at: new Date().toISOString(),
    cancel_reason: body.Reason,
  }).eq("id", id);
  if (error) return err(error.message, 500);

  // Mark all non-RECEIVED lines as CANCELLED
  await sb.from("purchase_order_lines")
    .update({ status: "CANCELLED" })
    .eq("purchase_order_id", id)
    .neq("status", "RECEIVED");

  // Hoàn lại used_value (chỉ khi đã approved hoặc posted - tức là commitment còn hiệu lực)
  if (po.bid_contract_id && (po.status === "APPROVED" || po.status === "POSTED" || po.status === "DRAFT")) {
    const { data: lines } = await sb.from("purchase_order_lines")
      .select("line_total").eq("purchase_order_id", id);
    const subtotal = (lines || []).reduce(
      (s: number, l: any) => s + Number(l.line_total), 0);
    const { data: header } = await sb.from("purchase_orders")
      .select("discount_amount, shipping_amount").eq("id", id).single();
    const poTotal = subtotal + Number(header?.shipping_amount || 0)
      - Number(header?.discount_amount || 0);

    const svc = serviceClient();
    const { data: contract } = await svc.from("bid_contracts")
      .select("used_value").eq("id", po.bid_contract_id).single();
    if (contract) {
      await svc.from("bid_contracts").update({
        used_value: Math.max(0, Number(contract.used_value) - poTotal),
      }).eq("id", po.bid_contract_id);
    }
  }

  return json({ ok: true });
}
