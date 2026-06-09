// Supabase Edge Function: purchase-requests
// Handles PurchaseRequest (Đề nghị mua hàng nội bộ) CRUD + workflow
//   DRAFT → SUBMITTED → APPROVED
//
// POST   /functions/v1/purchase-requests              - create (DRAFT, generate pr_number DT-YYYY-NNNN)
// PUT    /functions/v1/purchase-requests/{id}         - update (DRAFT only, replace lines)
// DELETE /functions/v1/purchase-requests/{id}         - delete (DRAFT only)
// POST   /functions/v1/purchase-requests/{id}/submit  - DRAFT → SUBMITTED
// POST   /functions/v1/purchase-requests/{id}/approve - SUBMITTED → APPROVED
//
// List/Get: handled by PostgREST (tables purchase_requests + purchase_request_lines)
//
// Deploy: supabase functions deploy purchase-requests --no-verify-jwt

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
  // Path: /functions/v1/purchase-requests/{id}/{action}
  // pathParts after "purchase-requests": ["<id>", "<action>"] | ["<id>"] | []
  const tail = pathParts.slice(pathParts.indexOf("purchase-requests") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createPr(sb, body);
    if (req.method === "PUT" && id && !action) return await updatePr(sb, id, body);
    if (req.method === "DELETE" && id && !action) return await deletePr(sb, id);
    if (req.method === "POST" && id && action === "submit") return await submitPr(sb, id);
    if (req.method === "POST" && id && action === "approve") return await approvePr(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /purchase-requests - Create (DRAFT, generate pr_number DT-YYYY-NNNN)
// =============================================================================
async function createPr(sb: SupabaseClient, r: any) {
  if (!r.Lines || r.Lines.length === 0) {
    return err("Đề nghị mua hàng phải có ít nhất 1 dòng");
  }

  // Validate branch
  const { data: branch } = await sb.from("branches")
    .select("id").eq("id", r.BranchId).single();
  if (!branch) return err(`Branch ${r.BranchId} không tồn tại`, 404);

  // Generate pr_number = DT-YYYY-NNNN (per fiscal year)
  const fiscalYear = r.FiscalYear ?? new Date().getUTCFullYear();
  const prefix = `DT-${fiscalYear}-`;
  const { count } = await sb.from("purchase_requests")
    .select("id", { count: "exact", head: true })
    .like("pr_number", `${prefix}%`);
  const prNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // Get user_id from JWT for created_by / requester_id
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Validate products + units (load to denormalize name/code into lines)
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name, sku").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u]));

  for (const line of r.Lines) {
    if (!productMap.has(line.ProductId))
      return err(`Product ${line.ProductId} không tồn tại`, 404);
    if (!unitMap.has(line.UnitId))
      return err(`Unit ${line.UnitId} không tồn tại`, 404);
  }

  // Insert header
  const { data: pr, error: prErr } = await sb.from("purchase_requests").insert({
    branch_id: r.BranchId,
    bid_plan_id: r.BidPlanId ?? null,
    pr_number: prNumber,
    request_dept: r.RequestDept ?? null,
    requester_id: userId ?? null,
    fiscal_year: fiscalYear,
    status: "DRAFT",
    requested_date: r.RequestedDate ?? new Date().toISOString().slice(0, 10),
    notes: r.Notes ?? null,
    created_by: userId,
  }).select().single();
  if (prErr || !pr) return err(prErr?.message ?? "Insert failed", 500);

  // Insert lines
  const lines = r.Lines.map((line: any, i: number) => ({
    purchase_request_id: pr.id,
    line_no: i + 1,
    product_id: line.ProductId,
    unit_id: line.UnitId,
    quantity: line.Quantity,
    estimated_unit_price: line.EstimatedUnitPrice ?? 0,
    notes: line.Notes ?? null,
  }));
  const { error: lineErr } = await sb.from("purchase_request_lines").insert(lines);
  if (lineErr) return err(lineErr.message, 500);

  return json({ ...pr, lines }, 201);
}

// =============================================================================
// PUT /purchase-requests/{id} - Update (DRAFT only, replace lines)
// =============================================================================
async function updatePr(sb: SupabaseClient, id: string, r: any) {
  const { data: pr } = await sb.from("purchase_requests")
    .select("id, status, branch_id, bid_plan_id, fiscal_year")
    .eq("id", id).single();
  if (!pr) return err("Not found", 404);
  if (pr.status !== "DRAFT")
    return err("Chỉ đề nghị mua hàng ở DRAFT mới sửa được", 400, "BUSINESS_RULE");

  if (!r.Lines || r.Lines.length === 0) {
    return err("Đề nghị mua hàng phải có ít nhất 1 dòng");
  }

  // Validate products + units
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id").in("id", productIds),
    sb.from("units_of_measure").select("id").in("id", unitIds),
  ]);
  if ((products || []).length !== productIds.length)
    return err("Một số product không tồn tại", 404);
  if ((units || []).length !== unitIds.length)
    return err("Một số unit không tồn tại", 404);

  // Update header
  await sb.from("purchase_requests").update({
    request_dept: r.RequestDept ?? null,
    notes: r.Notes ?? null,
    requested_date: r.RequestedDate ?? undefined,
  }).eq("id", id);

  // Replace lines
  await sb.from("purchase_request_lines").delete().eq("purchase_request_id", id);
  const lines = r.Lines.map((line: any, i: number) => ({
    purchase_request_id: id,
    line_no: i + 1,
    product_id: line.ProductId,
    unit_id: line.UnitId,
    quantity: line.Quantity,
    estimated_unit_price: line.EstimatedUnitPrice ?? 0,
    notes: line.Notes ?? null,
  }));
  const { error: lineErr } = await sb.from("purchase_request_lines").insert(lines);
  if (lineErr) return err(lineErr.message, 500);

  return json({ id, ...lines });
}

// =============================================================================
// DELETE /purchase-requests/{id} - Delete (DRAFT only)
// =============================================================================
async function deletePr(sb: SupabaseClient, id: string) {
  const { data: pr } = await sb.from("purchase_requests")
    .select("status").eq("id", id).single();
  if (!pr) return err("Not found", 404);
  if (pr.status !== "DRAFT")
    return err("Chỉ đề nghị mua hàng ở DRAFT mới xóa được", 400, "BUSINESS_RULE");
  const { error } = await sb.from("purchase_requests").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /purchase-requests/{id}/submit - DRAFT → SUBMITTED
// =============================================================================
async function submitPr(sb: SupabaseClient, id: string) {
  const { data: pr } = await sb.from("purchase_requests")
    .select("id, status").eq("id", id).single();
  if (!pr) return err("Not found", 404);
  if (pr.status !== "DRAFT")
    return err(`Chỉ đề nghị ở DRAFT mới gửi duyệt được. Hiện tại: ${pr.status}`, 400, "BUSINESS_RULE");

  const { count, error: cErr } = await sb.from("purchase_request_lines")
    .select("id", { count: "exact", head: true })
    .eq("purchase_request_id", id);
  if (cErr) return err(cErr.message, 500);
  if (!count || count === 0)
    return err("Đề nghị mua hàng phải có ít nhất 1 dòng", 400, "BUSINESS_RULE");

  const { error } = await sb.from("purchase_requests").update({
    status: "SUBMITTED",
  }).eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /purchase-requests/{id}/approve - SUBMITTED → APPROVED
// =============================================================================
async function approvePr(sb: SupabaseClient, id: string, _body: any) {
  const { data: pr } = await sb.from("purchase_requests")
    .select("id, status").eq("id", id).single();
  if (!pr) return err("Not found", 404);
  if (pr.status !== "SUBMITTED")
    return err(`Chỉ duyệt đề nghị ở SUBMITTED. Hiện tại: ${pr.status}`, 400, "BUSINESS_RULE");

  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  const { error } = await sb.from("purchase_requests").update({
    status: "APPROVED",
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true, approved_at: new Date().toISOString() });
}
