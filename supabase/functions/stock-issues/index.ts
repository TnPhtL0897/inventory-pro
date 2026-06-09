// Supabase Edge Function: stock-issues
// Handles phiếu xuất kho CRUD + workflow (DRAFT → POSTED → CANCELLED)
//
// POST   /functions/v1/stock-issues               - create (DRAFT)
// PUT    /functions/v1/stock-issues/{id}          - update (DRAFT only)
// DELETE /functions/v1/stock-issues/{id}          - delete (DRAFT only)
// POST   /functions/v1/stock-issues/{id}/post     - DRAFT → POSTED (ghi stock_movements OUT)
// POST   /functions/v1/stock-issues/{id}/cancel   - DRAFT → CANCELLED (yêu cầu reason)
//
// List/Get: handled by PostgREST (tables stock_issues + stock_issue_lines)
//
// Business rules:
//  - Phiếu xuất chỉ tạo được từ kho lẻ (warehouse.type = 'ISSUE')
//  - Post: ghi stock_movements với movement_type='OUT', ref_type='ISSUE'
//  - Post: nếu warehouse.allow_negative = false → pre-check tồn kho
//  - Cancel: chỉ DRAFT mới hủy được (POSTED phải dùng reversal)
//
// Deploy: supabase functions deploy stock-issues --no-verify-jwt

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
  // Path: /functions/v1/stock-issues/{id}/{action}
  // pathParts after "stock-issues": ["<id>", "<action>"] | ["<action>"] | []
  const tail = pathParts.slice(pathParts.indexOf("stock-issues") + 1);
  const id = tail[0];
  const action = tail[1];

  try {
    const sb = makeClient(req);
    const body = req.method === "POST" || req.method === "PUT"
      ? await req.json().catch(() => ({}))
      : {};

    if (req.method === "POST" && !id) return await createIssue(sb, body);
    if (req.method === "PUT" && id) return await updateIssue(sb, id, body);
    if (req.method === "DELETE" && id) return await deleteIssue(sb, id);
    if (req.method === "POST" && id && action === "post") return await postIssue(sb, id);
    if (req.method === "POST" && id && action === "cancel") return await cancelIssue(sb, id, body);

    return err("Not found", 404);
  } catch (e) {
    return err((e as Error).message, 500, "INTERNAL");
  }
});

// =============================================================================
// POST /stock-issues - Create (DRAFT)
// =============================================================================
async function createIssue(sb: SupabaseClient, r: any) {
  // 1. Validate cơ bản
  if (!r.Lines || r.Lines.length === 0) return err("Phiếu xuất phải có ít nhất 1 dòng");
  if (!r.IdempotencyKeys || r.IdempotencyKeys.length !== r.Lines.length)
    return err("Mỗi dòng cần 1 idempotency_key");
  if (new Set(r.IdempotencyKeys).size !== r.IdempotencyKeys.length)
    return err("Idempotency keys phải unique");
  if (!r.Purpose) return err("Phải chỉ định Purpose (SALE/INTERNAL/TRANSFER/DAMAGE/RETURN...)", 400, "VALIDATION");

  // 2. Validate warehouse = phải là kho lẻ (ISSUE)
  const { data: wh } = await sb.from("warehouses")
    .select("id, branch_id, type, allow_negative, code").eq("id", r.WarehouseId).single();
  if (!wh) return err(`Warehouse không tồn tại`, 404);
  if (wh.branch_id !== r.BranchId)
    return err(`Warehouse không thuộc branch ${r.BranchId}`, 404);
  if (wh.type !== "ISSUE")
    return err(`Kho '${wh.code}' là kho chẵn (RECEIVING), không thể tạo phiếu xuất. Vui lòng chọn kho lẻ (ISSUE).`, 400, "BUSINESS_RULE");

  // 3. Validate locations thuộc warehouse
  const locationIds = [...new Set(r.Lines.map((l: any) => l.LocationId))];
  const { data: locs } = await sb.from("locations")
    .select("id, warehouse_id").in("id", locationIds);
  const badLoc = (locs || []).filter((l: any) => l.warehouse_id !== r.WarehouseId);
  if (badLoc.length)
    return err(`Location ${badLoc.map((l: any) => l.id).join(", ")} không thuộc warehouse`, 404);

  // 4. Nếu có party + purpose=SALE → validate party là CUSTOMER
  if (r.PartyId && r.Purpose === "SALE") {
    const { data: party } = await sb.from("parties")
      .select("id, party_type").eq("id", r.PartyId).single();
    if (!party) return err(`Party ${r.PartyId} không tồn tại`, 404);
    if (party.party_type === "SUPPLIER")
      return err("Xuất bán phải là khách hàng (CUSTOMER) hoặc BOTH", 400, "BUSINESS_RULE");
  }

  // 5. Generate issue_number: ISS-YYYYMM-NNNN
  const now = new Date();
  const prefix = `ISS-${now.toISOString().slice(0, 7).replace("-", "")}-`;
  const { count } = await sb.from("stock_issues")
    .select("id", { count: "exact", head: true })
    .like("issue_number", `${prefix}%`);
  const issueNumber = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  // 6. Lấy user từ JWT cho created_by
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // 7. Load products + units để denormalize name/code
  const productIds = [...new Set(r.Lines.map((l: any) => l.ProductId))];
  const unitIds = [...new Set(r.Lines.map((l: any) => l.UnitId))];
  const [{ data: products }, { data: units }] = await Promise.all([
    sb.from("products").select("id, name").in("id", productIds),
    sb.from("units_of_measure").select("id, code").in("id", unitIds),
  ]);
  const productMap = new Map((products || []).map((p: any) => [p.id, p.name]));
  const unitMap = new Map((units || []).map((u: any) => [u.id, u.code]));

  // 8. Build lines
  const lines = r.Lines.map((line: any, i: number) => ({
    tenant_id: undefined, // RLS auto-fills
    line_no: i + 1,
    product_id: line.ProductId,
    product_name: productMap.get(line.ProductId) ?? "",
    unit_id: line.UnitId,
    unit_code: unitMap.get(line.UnitId) ?? "",
    location_id: line.LocationId,
    quantity: line.Quantity,
    unit_price: line.UnitPrice ?? 0,
    batch_no: line.BatchNo ?? "",
    serial_no: line.SerialNo ?? "",
    expiry_date: line.ExpiryDate ?? null,
    notes: line.Notes ?? null,
    status: "OPEN",
  }));

  // 9. Insert header
  const { data: issue, error: issueErr } = await sb.from("stock_issues").insert({
    branch_id: r.BranchId,
    issue_number: issueNumber,
    party_id: r.PartyId ?? null,
    warehouse_id: r.WarehouseId,
    purpose: r.Purpose,
    issue_date: r.IssueDate,
    reference_no: r.ReferenceNo ?? null,
    notes: r.Notes ?? null,
    status: "DRAFT",
    created_by: userId,
  }).select().single();
  if (issueErr || !issue) return err(issueErr?.message ?? "Insert failed", 500);

  // 10. Insert lines
  const { error: lineErr } = await sb.from("stock_issue_lines").insert(
    lines.map((l: any) => ({ ...l, stock_issue_id: issue.id }))
  );
  if (lineErr) return err(lineErr.message, 500);

  return json({ ...issue, lines: lines.map((l: any) => ({ ...l, stock_issue_id: issue.id })) }, 201);
}

// =============================================================================
// PUT /stock-issues/{id} - Update (DRAFT only)
// =============================================================================
async function updateIssue(sb: SupabaseClient, id: string, r: any) {
  const { data: issue } = await sb.from("stock_issues")
    .select("id, status, branch_id, party_id, warehouse_id, purpose")
    .eq("id", id).single();
  if (!issue) return err("Not found", 404);
  if (issue.status !== "DRAFT")
    return err("Chỉ phiếu xuất ở DRAFT mới sửa được", 400, "BUSINESS_RULE");

  // Re-run create validation với các field header đã khóa
  const createR = {
    BranchId: issue.branch_id,
    PartyId: r.PartyId ?? issue.party_id,
    WarehouseId: issue.warehouse_id,
    Purpose: r.Purpose ?? issue.purpose,
    IssueDate: r.IssueDate,
    ReferenceNo: r.ReferenceNo,
    Notes: r.Notes,
    Lines: r.Lines,
    IdempotencyKeys: r.IdempotencyKeys,
  };
  const validateRes = await createIssue(sb, createR);
  if (validateRes.status !== 201) return validateRes;

  // Update header (các field được phép thay đổi)
  await sb.from("stock_issues").update({
    party_id: r.PartyId ?? issue.party_id,
    purpose: r.Purpose ?? issue.purpose,
    issue_date: r.IssueDate,
    reference_no: r.ReferenceNo ?? null,
    notes: r.Notes ?? null,
  }).eq("id", id);

  // Replace lines
  await sb.from("stock_issue_lines").delete().eq("stock_issue_id", id);
  // createIssue đã insert lines mới (trong validateRes). Trả về kết quả.
  return validateRes;
}

// =============================================================================
// DELETE /stock-issues/{id} - Delete (DRAFT only)
// =============================================================================
async function deleteIssue(sb: SupabaseClient, id: string) {
  const { data: issue } = await sb.from("stock_issues").select("status").eq("id", id).single();
  if (!issue) return err("Not found", 404);
  if (issue.status !== "DRAFT")
    return err("Chỉ phiếu xuất ở DRAFT mới xóa được", 400, "BUSINESS_RULE");
  const { error } = await sb.from("stock_issues").delete().eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}

// =============================================================================
// POST /stock-issues/{id}/post - DRAFT → POSTED + ghi stock_movements OUT
// =============================================================================
async function postIssue(sb: SupabaseClient, id: string) {
  const svc = serviceClient();

  const { data: issue } = await sb.from("stock_issues")
    .select("id, tenant_id, branch_id, warehouse_id, status, party_id, purpose")
    .eq("id", id).single();
  if (!issue) return err("Not found", 404);
  if (issue.status !== "DRAFT")
    return err(`Chỉ phiếu xuất ở DRAFT mới post được. Hiện tại: ${issue.status}`, 400, "BUSINESS_RULE");

  // Re-check warehouse type = ISSUE (defensive)
  const { data: wh } = await sb.from("warehouses")
    .select("type, allow_negative, code").eq("id", issue.warehouse_id).single();
  if (!wh) return err("Warehouse not found", 404);
  if (wh.type !== "ISSUE")
    return err(`Kho '${wh.code}' hiện là kho chẵn (RECEIVING), không thể post phiếu xuất.`, 400, "BUSINESS_RULE");

  const { data: lines, error: linesErr } = await sb.from("stock_issue_lines")
    .select("id, product_id, unit_id, location_id, quantity, unit_price, batch_no, serial_no, expiry_date, notes, status, idempotency_key")
    .eq("stock_issue_id", id);
  if (linesErr) return err(linesErr.message, 500);
  const openLines = (lines || []).filter((l: any) => l.status === "OPEN");
  if (openLines.length === 0) return err("Phiếu xuất phải có ít nhất 1 dòng OPEN", 400, "BUSINESS_RULE");

  // Pre-check tồn kho nếu warehouse không cho phép âm
  if (!wh.allow_negative) {
    for (const line of openLines) {
      // stock composite PK: (branch_id, warehouse_id, location_id, product_id, batch_no, serial_no)
      const { data: stock } = await svc.from("stock")
        .select("quantity").eq("branch_id", issue.branch_id)
        .eq("warehouse_id", issue.warehouse_id).eq("location_id", line.location_id)
        .eq("product_id", line.product_id).eq("batch_no", line.batch_no || "")
        .eq("serial_no", line.serial_no || "").maybeSingle();
      const stockQty = Number(stock?.quantity ?? 0);
      if (stockQty < Number(line.quantity)) {
        return err(
          `Tồn kho không đủ cho dòng ${line.line_no}: cần ${line.quantity}, có ${stockQty}`,
          400, "INSUFFICIENT_STOCK"
        );
      }
    }
  }

  // Lấy user cho created_by
  const { data: { user } } = await sb.auth.getUser();
  const userId = user?.id;

  // Tạo stock_movements OUT cho mỗi line
  const movements = openLines.map((l: any) => ({
    tenant_id: issue.tenant_id,
    branch_id: issue.branch_id,
    warehouse_id: issue.warehouse_id,
    location_id: l.location_id,
    product_id: l.product_id,
    unit_id: l.unit_id,
    movement_type: "OUT",
    status: "POSTED",
    quantity: l.quantity,
    unit_cost: null, // OUT không cập nhật avg cost
    ref_type: "ISSUE",
    ref_id: issue.id,
    ref_line_id: l.id,
    notes: l.notes,
    batch_no: l.batch_no || "",
    serial_no: l.serial_no || "",
    expiry_date: l.expiry_date || null,
    idempotency_key: l.idempotency_key ?? crypto.randomUUID(),
    created_by: userId,
    posted_at: new Date().toISOString(),
  }));

  const { data: insertedMovs, error: movErr } = await svc.from("stock_movements")
    .insert(movements).select("id, ref_line_id");
  if (movErr) return err(`Failed to create movements: ${movErr.message}`, 500);

  // Cập nhật line với movement_id + status POSTED
  const movByLine = new Map((insertedMovs || []).map((m: any) => [m.ref_line_id, m.id]));
  for (const line of openLines) {
    await svc.from("stock_issue_lines").update({
      movement_id: movByLine.get(line.id) ?? null,
      status: "POSTED",
    }).eq("id", line.id);
  }

  // Cập nhật header → POSTED
  await svc.from("stock_issues").update({
    status: "POSTED",
    posted_by: userId,
    posted_at: new Date().toISOString(),
  }).eq("id", id);

  return json({ ok: true, posted_at: new Date().toISOString() });
}

// =============================================================================
// POST /stock-issues/{id}/cancel - DRAFT → CANCELLED
// =============================================================================
async function cancelIssue(sb: SupabaseClient, id: string, body: any) {
  if (!body?.Reason) return err("Phải nhập lý do hủy", 400, "VALIDATION");
  const { data: issue } = await sb.from("stock_issues").select("status").eq("id", id).single();
  if (!issue) return err("Not found", 404);
  if (issue.status !== "DRAFT")
    return err("Chỉ phiếu xuất ở DRAFT mới hủy được (đã POSTED phải dùng reversal)", 400, "BUSINESS_RULE");
  const { error } = await sb.from("stock_issues").update({
    status: "CANCELLED",
    cancelled_at: new Date().toISOString(),
    cancel_reason: body.Reason,
  }).eq("id", id);
  if (error) return err(error.message, 500);
  return json({ ok: true });
}
