// Supabase Edge Function: bid-lots
// Handles BidLot CRUD + workflow + bidders + award
//
// POST   /functions/v1/bid-lots                          - create (DRAFT)
// PUT    /functions/v1/bid-lots?id=<uuid>                - update (DRAFT only)
// DELETE /functions/v1/bid-lots?id=<uuid>                - delete (DRAFT only)
// POST   /functions/v1/bid-lots/{id}/publish             - DRAFT → PUBLISHED (yêu cầu ≥1 line)
// POST   /functions/v1/bid-lots/{id}/bidders             - add bidder (PUBLISHED trở lại, DRAFT cũng OK; reject CANCELLED/AWARDED)
// DELETE /functions/v1/bid-lots/{id}/bidders/{bidderId}  - remove bidder (reject nếu is_winner=true)
// POST   /functions/v1/bid-lots/{id}/award               - chọn winner, tạo BidContract, set awarded_bidder_id/contract_id
//
// List/Get: handled by PostgREST (tables bid_lots + bid_lot_lines + bid_bidders)
//
// Deploy: supabase functions deploy bid-lots --no-verify-jwt

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

// Service role - chỉ dùng khi cần bypass RLS cho thao tác liên tenant (award).
// Ở bid-lots ta vẫn dùng sb (user client) + RLS, vì award chỉ thao tác trong tenant hiện tại.
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/bid-lots/{id}/{action}/...
  // pathParts after "bid-lots": [id, action, ...sub]
  const tail = pathParts.slice(pathParts.indexOf("bid-lots") + 1);
  const id = tail[0];
  const action = tail[1];
  const subId = tail[2];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createLot(sb, body);
    if (req.method === "PUT" && id) return await updateLot(sb, id, body);
    if (req.method === "DELETE" && id && !action) return await deleteLot(sb, id);
    if (req.method === "POST" && id && action === "publish") return await publishLot(sb, id);
    if (req.method === "POST" && id && action === "bidders") return await addBidder(sb, id, body);
    if (req.method === "DELETE" && id && action === "bidders" && subId) {
      return await removeBidder(sb, id, subId);
    }
    if (req.method === "POST" && id && action === "award") return await awardLot(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /bid-lots - Create (DRAFT)
// =============================================================================
async function createLot(sb: SupabaseClient, r: any) {
  if (!r.LotName || !String(r.LotName).trim())
    return err("Tên lô thầu không được trống", 400, "VALIDATION");
  if (!r.BidPackageId) return err("Thiếu BidPackageId", 400, "VALIDATION");
  if (!r.LotNo) return err("Thiếu LotNo", 400, "VALIDATION");

  // Validate package exists & not PUBLISHED
  const { data: pkg } = await sb.from("bid_packages")
    .select("id, bid_package_status").eq("id", r.BidPackageId).single();
  if (!pkg) return err(`BidPackage ${r.BidPackageId} không tồn tại`, 404);
  if (pkg.bid_package_status === "PUBLISHED")
    return err("Không thể thêm lô vào gói thầu đã publish", 400, "BUSINESS_RULE");

  // Get user
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Insert header
  const { data: lot, error: lotErr } = await sb.from("bid_lots").insert({
    bid_package_id: r.BidPackageId,
    lot_no: r.LotNo,
    lot_name: r.LotName,
    bid_lot_status: "DRAFT",
    product_category: r.ProductCategory ?? null,
    estimated_value: r.EstimatedValue ?? null,
    quantity_total: r.QuantityTotal ?? null,
    unit: r.Unit ?? null,
    created_by: userId,
  }).select().single();
  if (lotErr || !lot) return err(lotErr?.message ?? "Insert failed", 500);

  // Insert lines
  if (r.Lines && Array.isArray(r.Lines) && r.Lines.length > 0) {
    const { data: products } = await sb.from("products")
      .select("id, name, sku").in("id", r.Lines.map((l: any) => l.ProductId));
    const { data: units } = await sb.from("units_of_measure")
      .select("id, code").in("id", r.Lines.map((l: any) => l.UnitId));
    const productMap = new Map((products || []).map((p: any) => [p.id, p]));
    const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

    const lineRows = r.Lines.map((l: any, i: number) => ({
      tenant_id: undefined, // RLS auto-fills
      bid_lot_id: lot.id,
      line_no: i + 1,
      product_id: l.ProductId,
      product_name: productMap.get(l.ProductId)?.name ?? null,
      product_sku: productMap.get(l.ProductId)?.sku ?? null,
      unit_id: l.UnitId,
      unit_code: unitMap.get(l.UnitId)?.code ?? null,
      quantity: l.Quantity,
      estimated_unit_price: l.EstimatedUnitPrice ?? null,
      notes: l.Notes ?? null,
    }));

    const { error: lineErr } = await sb.from("bid_lot_lines").insert(lineRows);
    if (lineErr) return err(lineErr.message, 500);
  }

  return json(lot, 201);
}

// =============================================================================
// PUT /bid-lots/{id} - Update (DRAFT only)
// =============================================================================
async function updateLot(sb: SupabaseClient, id: string, r: any) {
  const { data: lot } = await sb.from("bid_lots")
    .select("id, bid_lot_status").eq("id", id).single();
  if (!lot) return err("Not found", 404);
  if (lot.bid_lot_status !== "DRAFT")
    return err("Chỉ lô thầu ở DRAFT mới sửa được", 400, "BUSINESS_RULE");

  // Update header
  const updateFields: Record<string, unknown> = {};
  if (r.LotName !== undefined) updateFields.lot_name = r.LotName;
  if (r.ProductCategory !== undefined) updateFields.product_category = r.ProductCategory ?? null;
  if (r.EstimatedValue !== undefined) updateFields.estimated_value = r.EstimatedValue ?? null;
  if (r.QuantityTotal !== undefined) updateFields.quantity_total = r.QuantityTotal ?? null;
  if (r.Unit !== undefined) updateFields.unit = r.Unit ?? null;
  updateFields.updated_at = new Date().toISOString();

  if (Object.keys(updateFields).length > 1) {
    const { error: upErr } = await sb.from("bid_lots").update(updateFields).eq("id", id);
    if (upErr) return err(upErr.message, 500);
  }

  // Replace lines if provided
  if (r.Lines && Array.isArray(r.Lines)) {
    await sb.from("bid_lot_lines").delete().eq("bid_lot_id", id);
    if (r.Lines.length > 0) {
      const { data: products } = await sb.from("products")
        .select("id, name, sku").in("id", r.Lines.map((l: any) => l.ProductId));
      const { data: units } = await sb.from("units_of_measure")
        .select("id, code").in("id", r.Lines.map((l: any) => l.UnitId));
      const productMap = new Map((products || []).map((p: any) => [p.id, p]));
      const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

      const lineRows = r.Lines.map((l: any, i: number) => ({
        tenant_id: undefined,
        bid_lot_id: id,
        line_no: i + 1,
        product_id: l.ProductId,
        product_name: productMap.get(l.ProductId)?.name ?? null,
        product_sku: productMap.get(l.ProductId)?.sku ?? null,
        unit_id: l.UnitId,
        unit_code: unitMap.get(l.UnitId)?.code ?? null,
        quantity: l.Quantity,
        estimated_unit_price: l.EstimatedUnitPrice ?? null,
        notes: l.Notes ?? null,
      }));
      const { error: lineErr } = await sb.from("bid_lot_lines").insert(lineRows);
      if (lineErr) return err(lineErr.message, 500);
    }
  }

  return json({ ok: true, id });
}

// =============================================================================
// DELETE /bid-lots/{id} - Delete (DRAFT only, cascade lines + bidders)
// =============================================================================
async function deleteLot(sb: SupabaseClient, id: string) {
  const { data: lot } = await sb.from("bid_lots")
    .select("id, bid_lot_status").eq("id", id).single();
  if (!lot) return err("Not found", 404);
  if (lot.bid_lot_status !== "DRAFT")
    return err("Chỉ xóa được lô thầu ở DRAFT", 400, "BUSINESS_RULE");

  // Delete children first (defensive; FK ON DELETE CASCADE cũng lo, nhưng
  // bidders & lines có thể thiếu cascade - xóa tay cho chắc)
  await sb.from("bid_bidders").delete().eq("bid_lot_id", id);
  await sb.from("bid_lot_lines").delete().eq("bid_lot_id", id);

  const { error } = await sb.from("bid_lots").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /bid-lots/{id}/publish - DRAFT → PUBLISHED
// =============================================================================
async function publishLot(sb: SupabaseClient, id: string) {
  const { data: lot } = await sb.from("bid_lots")
    .select("id, bid_lot_status").eq("id", id).single();
  if (!lot) return err("Not found", 404);
  if (lot.bid_lot_status !== "DRAFT")
    return err("Chỉ publish lô thầu ở DRAFT", 400, "BUSINESS_RULE");

  // Must have ≥1 line
  const { count } = await sb.from("bid_lot_lines")
    .select("id", { count: "exact", head: true }).eq("bid_lot_id", id);
  if (!count || count === 0)
    return err("Lô thầu phải có ít nhất 1 dòng vật tư", 400, "BUSINESS_RULE");

  const { error } = await sb.from("bid_lots").update({
    bid_lot_status: "PUBLISHED",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return err(error.message, 500);

  return json({ ok: true, id, status: "PUBLISHED" });
}

// =============================================================================
// POST /bid-lots/{id}/bidders - Add bidder
// Body: { PartyId, BidPrice?, BidDate?, EvaluationScore?, Rank?, Notes? }
// =============================================================================
async function addBidder(sb: SupabaseClient, id: string, r: any) {
  const { data: lot } = await sb.from("bid_lots")
    .select("id, bid_lot_status").eq("id", id).single();
  if (!lot) return err("Not found", 404);
  if (lot.bid_lot_status === "CANCELLED" || lot.bid_lot_status === "AWARDED")
    return err("Lô thầu đã đóng hoặc đã trúng", 400, "BUSINESS_RULE");
  if (!r.PartyId) return err("Thiếu PartyId", 400, "VALIDATION");

  // Validate party
  const { data: party } = await sb.from("parties")
    .select("id, party_type").eq("id", r.PartyId).single();
  if (!party) return err(`Party ${r.PartyId} không tồn tại`, 404);
  if (party.party_type !== "SUPPLIER" && party.party_type !== "BOTH")
    return err("Party phải là SUPPLIER hoặc BOTH", 400, "BUSINESS_RULE");

  // Check duplicate (uq_bid_bidders_lot_party cũng lo, nhưng check trước để trả message rõ)
  const { data: existing } = await sb.from("bid_bidders")
    .select("id").eq("bid_lot_id", id).eq("party_id", r.PartyId).maybeSingle();
  if (existing) return err("Nhà thầu này đã đăng ký dự thầu lô này", 400, "BUSINESS_RULE");

  const { data: bidder, error } = await sb.from("bid_bidders").insert({
    bid_lot_id: id,
    party_id: r.PartyId,
    bid_price: r.BidPrice ?? null,
    bid_date: r.BidDate ?? new Date().toISOString(),
    evaluation_score: r.EvaluationScore ?? null,
    rank: r.Rank ?? null,
    notes: r.Notes ?? null,
    is_winner: false,
  }).select().single();
  if (error) return err(error.message, 500);

  // Nếu lot đang PUBLISHED → tự chuyển EVALUATING (giống C# handler)
  if (lot.bid_lot_status === "PUBLISHED") {
    await sb.from("bid_lots").update({
      bid_lot_status: "EVALUATING",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }

  return json(bidder, 201);
}

// =============================================================================
// DELETE /bid-lots/{id}/bidders/{bidderId} - Remove bidder
// =============================================================================
async function removeBidder(sb: SupabaseClient, id: string, bidderId: string) {
  const { data: bidder } = await sb.from("bid_bidders")
    .select("id, is_winner").eq("id", bidderId).eq("bid_lot_id", id).single();
  if (!bidder) return err("Bidder không tồn tại", 404);
  if (bidder.is_winner)
    return err("Không thể xóa nhà thầu đã trúng", 400, "BUSINESS_RULE");

  const { error } = await sb.from("bid_bidders").delete().eq("id", bidderId);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /bid-lots/{id}/award - PHỨC TẠP NHẤT
// Body: {
//   BidderId (uuid - trỏ tới bid_bidders.id),
//   AwardedValue (decimal, > 0),
//   AwardedDate (date),
//   DecisionNo? (string),
//   ContractNo? (string, optional - nếu không truyền sẽ auto-gen HĐ-YYYY-NNNN),
//   ContractName? (string),
//   ContractStartDate? (date, default = AwardedDate),
//   ContractEndDate? (date, default = AwardedDate + 1 year),
//   PaymentTerms? (text),
//   AdvancePaymentPct? (decimal),
//   RetentionPct? (decimal),
//   WarrantyMonths? (int),
//   SigningDate? (date),
//   Notes? (text)
// }
//
// Steps:
//   1. Validate lot, status != AWARDED/CANCELLED
//   2. Validate bidder thuộc lot, !is_winner
//   3. Generate contract_no nếu chưa có (HĐ-YYYY-NNNN theo năm AwardedDate)
//   4. INSERT bid_contracts (status=ACTIVE) → trigger sẽ set bid_lots.contract_id
//   5. UPDATE bid_lots: awarded_bidder_id (= winner.party_id), awarded_value,
//      awarded_date, decision_no, bid_lot_status=AWARDED
//   6. UPDATE bid_bidders: is_winner=true (cho winner)
//   7. Return lot + contract
// =============================================================================
async function awardLot(sb: SupabaseClient, id: string, r: any) {
  if (!r.BidderId) return err("Thiếu BidderId", 400, "VALIDATION");
  if (!r.AwardedValue || Number(r.AwardedValue) <= 0)
    return err("AwardedValue phải > 0", 400, "VALIDATION");
  if (!r.AwardedDate) return err("Thiếu AwardedDate", 400, "VALIDATION");

  // 1. Load lot
  const { data: lot } = await sb.from("bid_lots")
    .select("id, bid_package_id, lot_name, bid_lot_status, contract_id")
    .eq("id", id).single();
  if (!lot) return err("Not found", 404);
  if (lot.bid_lot_status === "AWARDED")
    return err("Lô thầu đã được chấm trúng rồi", 400, "BUSINESS_RULE");
  if (lot.bid_lot_status === "CANCELLED")
    return err("Lô thầu đã hủy", 400, "BUSINESS_RULE");
  if (lot.contract_id)
    return err("Lô thầu đã có hợp đồng", 400, "BUSINESS_RULE");

  // 2. Validate winner bidder
  const { data: winner } = await sb.from("bid_bidders")
    .select("id, party_id, is_winner")
    .eq("id", r.BidderId).eq("bid_lot_id", id).single();
  if (!winner) return err("Nhà thầu được chọn không nằm trong danh sách dự thầu", 404);
  if (winner.is_winner)
    return err("Nhà thầu này đã được đánh dấu trúng", 400, "BUSINESS_RULE");

  // Validate party (defensive)
  const { data: party } = await sb.from("parties")
    .select("id, party_type").eq("id", winner.party_id).single();
  if (!party) return err("Party của nhà thầu không tồn tại", 404);
  if (party.party_type !== "SUPPLIER" && party.party_type !== "BOTH")
    return err("Party thắng thầu phải là SUPPLIER hoặc BOTH", 400, "BUSINESS_RULE");

  // 3. Resolve contract dates & number
  const startDate: string = r.ContractStartDate ?? r.AwardedDate;
  // default end = start + 1 year (giống C# AddYears(1))
  const defaultEnd = new Date(r.AwardedDate);
  defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
  const endDate: string = r.ContractEndDate ?? defaultEnd.toISOString().slice(0, 10);

  if (new Date(endDate) < new Date(startDate))
    return err("Ngày kết thúc phải sau ngày bắt đầu", 400, "VALIDATION");

  let contractNo: string = r.ContractNo;
  if (!contractNo) {
    const year = new Date(r.AwardedDate).getFullYear();
    const prefix = `HĐ-${year}-`;
    const { count } = await sb.from("bid_contracts")
      .select("id", { count: "exact", head: true })
      .like("contract_no", `${prefix}%`);
    contractNo = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
  }

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 4. Insert BidContract (status=ACTIVE)
  const { data: contract, error: cErr } = await sb.from("bid_contracts").insert({
    bid_lot_id: id,
    contract_no: contractNo,
    contract_name: r.ContractName ?? `HĐ thầu cho lô '${lot.lot_name ?? ""}'`,
    winning_party_id: winner.party_id,
    contract_value: r.AwardedValue,
    contract_start_date: startDate,
    contract_end_date: endDate,
    payment_terms: r.PaymentTerms ?? null,
    advance_payment_pct: r.AdvancePaymentPct ?? null,
    retention_pct: r.RetentionPct ?? null,
    warranty_months: r.WarrantyMonths ?? null,
    signing_date: r.SigningDate ?? null,
    notes: r.Notes ?? null,
    bid_contract_status: "ACTIVE",
    used_value: 0,
    created_by: userId,
  }).select().single();
  if (cErr || !contract) return err(cErr?.message ?? "Contract insert failed", 500);

  // 5. Update lot (set contract_id thẳng - trigger DB cũng sẽ set, set dư thì OK
  //    vì UNIQUE INDEX uq_bid_lots_contract cho phép 1-1)
  const { error: lErr } = await sb.from("bid_lots").update({
    awarded_bidder_id: winner.party_id,  // FK to parties.id (KHÔNG phải bid_bidders.id)
    awarded_value: r.AwardedValue,
    awarded_date: r.AwardedDate,
    decision_no: r.DecisionNo ?? null,
    contract_id: contract.id,
    bid_lot_status: "AWARDED",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (lErr) return err(lErr.message, 500);

  // 6. Mark winner bidder
  const { error: bErr } = await sb.from("bid_bidders").update({
    is_winner: true,
    updated_at: new Date().toISOString(),
  }).eq("id", winner.id);
  if (bErr) return err(bErr.message, 500);

  return json({ ok: true, lot_id: id, contract_id: contract.id, contract_no: contractNo }, 201);
}
