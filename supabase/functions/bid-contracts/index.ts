// Supabase Edge Function: bid-contracts
// Handles BidContract CRUD + workflow
//
// POST   /functions/v1/bid-contracts              - create (rare; thường tạo qua /bid-lots/{id}/award)
// PUT    /functions/v1/bid-contracts?id=<uuid>    - update (TERMINATED thì reject)
// DELETE /functions/v1/bid-contracts?id=<uuid>    - delete (chỉ DRAFT; nếu used_value>0 hoặc ACTIVE thì reject)
// POST   /functions/v1/bid-contracts/{id}/terminate - ACTIVE → TERMINATED (yêu cầu reason)
//
// List/Get: handled by PostgREST (tables bid_contracts)
//
// Deploy: supabase functions deploy bid-contracts --no-verify-jwt

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

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /functions/v1/bid-contracts/{id}/{action}
  const tail = pathParts.slice(pathParts.indexOf("bid-contracts") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createContract(sb, body);
    if (req.method === "PUT" && id) return await updateContract(sb, id, body);
    if (req.method === "DELETE" && id && !action) return await deleteContract(sb, id);
    if (req.method === "POST" && id && action === "terminate") {
      return await terminateContract(sb, id, body);
    }

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /bid-contracts - Create (rare, thường dùng /bid-lots/{id}/award)
// Body: {
//   BidLotId (uuid - required),
//   ContractNo? (auto-gen HĐ-YYYY-NNNN theo năm ContractStartDate nếu bỏ trống),
//   ContractName?, WinningPartyId (uuid - required),
//   ContractValue (decimal > 0), ContractStartDate, ContractEndDate,
//   PaymentTerms?, AdvancePaymentPct?, RetentionPct?, WarrantyMonths?,
//   SigningDate?, Notes?
// }
// =============================================================================
async function createContract(sb: SupabaseClient, r: any) {
  if (!r.BidLotId) return err("Thiếu BidLotId", 400, "VALIDATION");
  if (!r.WinningPartyId) return err("Thiếu WinningPartyId", 400, "VALIDATION");
  if (!r.ContractValue || Number(r.ContractValue) <= 0)
    return err("Giá trị hợp đồng phải > 0", 400, "VALIDATION");
  if (!r.ContractStartDate || !r.ContractEndDate)
    return err("Thiếu ContractStartDate hoặc ContractEndDate", 400, "VALIDATION");
  if (new Date(r.ContractEndDate) < new Date(r.ContractStartDate))
    return err("Ngày kết thúc phải sau ngày bắt đầu", 400, "VALIDATION");

  // Validate lot
  const { data: lot } = await sb.from("bid_lots")
    .select("id, contract_id").eq("id", r.BidLotId).single();
  if (!lot) return err(`BidLot ${r.BidLotId} không tồn tại`, 404);
  if (lot.contract_id)
    return err("Lô thầu này đã có hợp đồng", 400, "BUSINESS_RULE");

  // Validate party
  const { data: party } = await sb.from("parties")
    .select("id, party_type").eq("id", r.WinningPartyId).single();
  if (!party) return err(`Party ${r.WinningPartyId} không tồn tại`, 404);
  if (party.party_type !== "SUPPLIER" && party.party_type !== "BOTH")
    return err("Party thắng thầu phải là SUPPLIER hoặc BOTH", 400, "BUSINESS_RULE");

  // Resolve contract_no
  let contractNo: string = r.ContractNo;
  if (!contractNo) {
    const year = new Date(r.ContractStartDate).getFullYear();
    const prefix = `HĐ-${year}-`;
    const { count } = await sb.from("bid_contracts")
      .select("id", { count: "exact", head: true })
      .like("contract_no", `${prefix}%`);
    contractNo = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;
  }

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  const { data: contract, error } = await sb.from("bid_contracts").insert({
    bid_lot_id: r.BidLotId,
    contract_no: contractNo,
    contract_name: r.ContractName ?? null,
    winning_party_id: r.WinningPartyId,
    contract_value: r.ContractValue,
    contract_start_date: r.ContractStartDate,
    contract_end_date: r.ContractEndDate,
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
  if (error || !contract) return err(error?.message ?? "Insert failed", 500);

  return json(contract, 201);
}

// =============================================================================
// PUT /bid-contracts/{id} - Update (TERMINATED thì reject)
// =============================================================================
async function updateContract(sb: SupabaseClient, id: string, r: any) {
  const { data: contract } = await sb.from("bid_contracts")
    .select("id, bid_contract_status").eq("id", id).single();
  if (!contract) return err("Not found", 404);
  if (contract.bid_contract_status === "TERMINATED")
    return err("HĐ thầu đã bị terminate, không sửa được", 400, "BUSINESS_RULE");

  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (r.ContractName !== undefined) updateFields.contract_name = r.ContractName ?? null;
  if (r.ContractValue !== undefined && Number(r.ContractValue) > 0) {
    updateFields.contract_value = r.ContractValue;
  }
  if (r.ContractStartDate !== undefined) updateFields.contract_start_date = r.ContractStartDate;
  if (r.ContractEndDate !== undefined) updateFields.contract_end_date = r.ContractEndDate;
  if (r.PaymentTerms !== undefined) updateFields.payment_terms = r.PaymentTerms ?? null;
  if (r.AdvancePaymentPct !== undefined) updateFields.advance_payment_pct = r.AdvancePaymentPct ?? null;
  if (r.RetentionPct !== undefined) updateFields.retention_pct = r.RetentionPct ?? null;
  if (r.WarrantyMonths !== undefined) updateFields.warranty_months = r.WarrantyMonths ?? null;
  if (r.SigningDate !== undefined) updateFields.signing_date = r.SigningDate ?? null;
  if (r.Notes !== undefined) updateFields.notes = r.Notes ?? null;

  const { error } = await sb.from("bid_contracts").update(updateFields).eq("id", id);
  if (error) return err(error.message, 500);

  return json({ ok: true, id });
}

// =============================================================================
// DELETE /bid-contracts/{id} - Delete (DRAFT only; reject nếu used_value>0 hoặc ACTIVE)
// =============================================================================
async function deleteContract(sb: SupabaseClient, id: string) {
  const { data: contract } = await sb.from("bid_contracts")
    .select("id, bid_contract_status, used_value").eq("id", id).single();
  if (!contract) return err("Not found", 404);
  if (Number(contract.used_value ?? 0) > 0)
    return err("HĐ thầu đã phát sinh PO/GRN, không thể xóa (chỉ terminate)", 400, "BUSINESS_RULE");
  if (contract.bid_contract_status === "ACTIVE")
    return err("HĐ thầu đang ACTIVE, không thể xóa", 400, "BUSINESS_RULE");
  if (contract.bid_contract_status === "EXPIRED")
    return err("HĐ thầu đã EXPIRED, không thể xóa", 400, "BUSINESS_RULE");

  // Clear back-ref trên bid_lots trước (UNIQUE INDEX uq_bid_lots_contract sẽ
  // fail nếu xóa contract mà vẫn còn lot trỏ tới)
  await sb.from("bid_lots").update({ contract_id: null }).eq("contract_id", id);

  const { error } = await sb.from("bid_contracts").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /bid-contracts/{id}/terminate - ACTIVE/EXPIRED → TERMINATED
// Body: { Reason: string }
// =============================================================================
async function terminateContract(sb: SupabaseClient, id: string, body: any) {
  if (!body?.Reason) return err("Phải nhập lý do terminate", 400, "VALIDATION");

  const { data: contract } = await sb.from("bid_contracts")
    .select("id, bid_contract_status, notes").eq("id", id).single();
  if (!contract) return err("Not found", 404);
  if (contract.bid_contract_status === "TERMINATED")
    return err("HĐ thầu đã bị terminate", 400, "BUSINESS_RULE");

  // Append "[TERMINATED] <date> <reason>" vào notes (giống C# handler)
  const ts = new Date().toISOString().slice(0, 10);
  const appended = (contract.notes ?? "") + `\n[TERMINATED] ${ts} ${body.Reason}`;

  const { error } = await sb.from("bid_contracts").update({
    bid_contract_status: "TERMINATED",
    notes: appended,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return err(error.message, 500);

  return json({ ok: true, id, status: "TERMINATED" });
}
