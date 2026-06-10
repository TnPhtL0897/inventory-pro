// Supabase Edge Function: import-stock-snapshot
// Bulk insert IN stock_movements từ báo cáo tồn kho Excel/JSON.
// Bootstrap tồn kho ban đầu cho tenant mới hoặc migrate từ hệ thống cũ.
//
// POST /functions/v1/import-stock-snapshot
// Body: {
//   warehouseId: string,         // bắt buộc
//   reportDate: string,          // ISO date, dùng cho idempotency_key + posted_at
//   locationId?: string,         // optional, default = MAIN location của warehouse
//   dryRun: boolean,
//   sheets: Array<{
//     sheetName: string,
//     rows: Array<{              // đã parse + normalize từ client
//       productName: string,
//       sku?: string | null,     // extract từ productName nếu null
//       unitCode: string,        // đã map từ ĐVT
//       batchNo: string | null,
//       quantity: number,
//       unitCost: number,
//       supplierName: string | null,
//     }>
//   }>
// }
//
// Returns: {
//   total: number,
//   inserted: number,
//   updated: number,             // luôn 0 (idempotent skip nếu đã tồn tại)
//   failed: number,
//   errors: Array<{ row: number, sheet: string, sku: string, message: string }>,
//   insertedMovements: string[], // movement_id để UI follow-up
// }
//
// Deploy: supabase functions deploy import-stock-snapshot --no-verify-jwt

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

function err(message: string, status = 400, code = "BAD_REQUEST") {
  return json({ error: { code, message } }, status);
}

// =============================================================================
// SHA-256 helper (Edge runtime: Deno has crypto.subtle)
// =============================================================================
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// =============================================================================
// UUID v5-like: build deterministic UUID from sha256 hex
// Format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx (v4-shaped)
// =============================================================================
function uuidFromHex(hex: string): string {
  // First 32 chars of SHA-256 → format as UUID v4
  const h = hex.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// =============================================================================
// Load lookup map (paginated)
// =============================================================================
async function loadLookup(
  svc: SupabaseClient,
  table: string,
  keyCol: string,
  valueCol: string,
  where?: Record<string, any>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = svc.from(table).select(`${keyCol},${valueCol}`).range(from, from + PAGE - 1);
    for (const [k, v] of Object.entries(where ?? {})) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`Lookup ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      if (row[keyCol] != null) map.set(row[keyCol], row[valueCol]);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

// =============================================================================
// Main handler
// =============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return err("Method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const warehouseId: string = (body?.warehouseId ?? "").toString().trim();
  const reportDate: string = (body?.reportDate ?? "").toString().trim();
  const locationIdIn: string = (body?.locationId ?? "").toString().trim();
  const dryRun: boolean = Boolean(body?.dryRun);
  const sheets: any[] = Array.isArray(body?.sheets) ? body.sheets : [];

  if (!warehouseId) return err("Thiếu warehouseId");
  if (!reportDate) return err("Thiếu reportDate (YYYY-MM-DD)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return err("reportDate phải định dạng YYYY-MM-DD");
  }
  if (sheets.length === 0) return err("Thiếu sheets[]");
  const totalRows = sheets.reduce((acc, s) => acc + (Array.isArray(s?.rows) ? s.rows.length : 0), 0);
  if (totalRows === 0) return err("Không có dòng dữ liệu nào");
  if (totalRows > 5000) return err("Tối đa 5000 dòng / request");

  // Service-role client (bypass RLS, validate tenant qua JWT)
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Auth: read JWT
  const auth = req.headers.get("Authorization");
  let userId: string | null = null;
  let tenantId: string | null = null;
  if (auth) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    userId = user?.id ?? null;
    tenantId = (user?.app_metadata?.tenant_id as string) ?? null;
  }
  if (!userId) return err("Unauthorized", 401);
  if (!tenantId) return err("Missing tenant_id in JWT", 401);

  // Validate warehouse + get branch + default location
  const { data: wh, error: whErr } = await svc
    .from("warehouses")
    .select("id, branch_id, status, name, code, is_default")
    .eq("id", warehouseId)
    .eq("tenant_id", tenantId)
    .single();
  if (whErr || !wh) return err(`Warehouse không tồn tại hoặc không thuộc tenant này`, 404);
  if (wh.status !== "ACTIVE") return err(`Warehouse không ACTIVE (status=${wh.status})`, 400);
  const branchId: string = wh.branch_id;

  // Resolve location
  let locationId = locationIdIn;
  if (!locationId) {
    // Pick default MAIN location (code = 'MAIN' theo seed 0003)
    const { data: loc } = await svc
      .from("locations")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("code", "MAIN")
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();
    if (!loc) {
      return err(
        `Warehouse chưa có MAIN location. Vui lòng chọn locationId thủ công hoặc tạo MAIN location trước.`,
        400,
      );
    }
    locationId = loc.id;
  } else {
    const { data: loc } = await svc
      .from("locations")
      .select("id, status, warehouse_id")
      .eq("id", locationId)
      .single();
    if (!loc) return err(`Location ${locationId} không tồn tại`, 404);
    if (loc.warehouse_id !== warehouseId) {
      return err(`Location ${locationId} không thuộc warehouse ${warehouseId}`, 400);
    }
    if (loc.status !== "ACTIVE") return err(`Location không ACTIVE (status=${loc.status})`, 400);
  }

  // Pre-fetch lookup maps
  const [unitsMap, productsMap] = await Promise.all([
    loadLookup(svc, "units_of_measure", "code", "id", { tenant_id: tenantId }),
    loadLookup(svc, "products", "sku", "id", { tenant_id: tenantId }),
  ]);

  // Validate all rows first
  type ValidRow = {
    sheetName: string;
    sheetIdx: number;
    rowIdx: number;
    sku: string;
    productId: string;
    unitId: string;
    batchNo: string | null;
    quantity: number;
    unitCost: number;
    supplierName: string | null;
    productName: string;
    idempotencyKey: string;
  };
  type ValidationError = {
    row: number;
    sheet: string;
    sku: string;
    message: string;
  };

  const validRows: ValidRow[] = [];
  const errors: ValidationError[] = [];

  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    const sheetName = (sheet?.sheetName ?? `Sheet${s + 1}`).toString();
    const rows: any[] = Array.isArray(sheet?.rows) ? sheet.rows : [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const rowNum = i + 1;

      // SKU
      let sku = (r.sku ?? "").toString().trim();
      if (!sku && r.productName) {
        // Try extract from productName
        const m = String(r.productName).match(/M[ãa]\s*:\s*([A-Z0-9][A-Z0-9.\-_]+)/i);
        if (m) sku = m[1];
      }
      if (!sku) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku: "(empty)",
          message: "Thiếu SKU (không tìm thấy trong productName)",
        });
        continue;
      }

      // Product lookup
      const productId = productsMap.get(sku);
      if (!productId) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku,
          message: `SKU không tồn tại trong hệ thống: "${sku}". Import products trước.`,
        });
        continue;
      }

      // Unit
      const unitCode = (r.unitCode ?? "").toString().trim();
      if (!unitCode) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku,
          message: "Thiếu unitCode",
        });
        continue;
      }
      const unitId = unitsMap.get(unitCode);
      if (!unitId) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku,
          message: `Unit code không tồn tại: "${unitCode}". Seed units_of_measure trước.`,
        });
        continue;
      }

      // Quantity
      const qty = Number(r.quantity);
      if (!isFinite(qty) || qty <= 0) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku,
          message: `Số lượng tồn phải > 0 (nhận: ${r.quantity})`,
        });
        continue;
      }

      // Unit cost
      const cost = Number(r.unitCost) || 0;
      if (cost < 0) {
        errors.push({
          row: rowNum,
          sheet: sheetName,
          sku,
          message: `Đơn giá không hợp lệ (nhận: ${r.unitCost})`,
        });
        continue;
      }

      const batchNo = r.batchNo ? String(r.batchNo).trim() || null : null;
      const supplierName = r.supplierName ? String(r.supplierName).trim() || null : null;

      // Idempotency key
      const idemInput = `${sku}|${batchNo ?? ""}|${reportDate}|${warehouseId}`;
      const hex = await sha256Hex(idemInput);
      const idempotencyKey = uuidFromHex(hex);

      validRows.push({
        sheetName,
        sheetIdx: s,
        rowIdx: i,
        sku,
        productId,
        unitId,
        batchNo,
        quantity: qty,
        unitCost: cost,
        supplierName,
        productName: String(r.productName ?? "").trim(),
        idempotencyKey,
      });
    }
  }

  if (dryRun) {
    return json({
      total: totalRows,
      inserted: 0,
      updated: 0,
      failed: errors.length,
      errors,
      insertedMovements: [],
      message: "Dry run - no rows inserted",
      warehouseId,
      locationId,
      branchId,
    });
  }

  if (validRows.length === 0) {
    return json({
      total: totalRows,
      inserted: 0,
      updated: 0,
      failed: errors.length,
      errors,
      insertedMovements: [],
      warehouseId,
      locationId,
      branchId,
    });
  }

  // Check existing idempotency keys (batch query)
  const idempKeys = Array.from(new Set(validRows.map((r) => r.idempotencyKey)));
  const existingKeys = new Set<string>();
  for (let i = 0; i < idempKeys.length; i += 500) {
    const batch = idempKeys.slice(i, i + 500);
    const { data } = await svc
      .from("stock_movements")
      .select("idempotency_key")
      .eq("tenant_id", tenantId)
      .in("idempotency_key", batch);
    (data ?? []).forEach((d: any) => existingKeys.add(d.idempotency_key));
  }

  // Filter out already-imported rows
  const newRows = validRows.filter((r) => !existingKeys.has(r.idempotencyKey));
  const dupRows = validRows.filter((r) => existingKeys.has(r.idempotencyKey));
  for (const r of dupRows) {
    errors.push({
      row: r.rowIdx + 1,
      sheet: r.sheetName,
      sku: r.sku,
      message: `Đã import trước đó (idempotency key tồn tại). Bỏ qua.`,
    });
  }

  // Insert via RPC record_stock_movement (one at a time — bảo đảm trigger chạy)
  // Batch qua Promise.all nhưng concurrency 10 để tránh overwhelm DB
  const insertedMovements: string[] = [];
  const CONCURRENCY = 10;
  let inserted = 0;

  for (let i = 0; i < newRows.length; i += CONCURRENCY) {
    const batch = newRows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (r) => {
        try {
          const { data, error } = await svc.rpc("record_stock_movement", {
            p_branch_id: branchId,
            p_warehouse_id: warehouseId,
            p_location_id: locationId,
            p_product_id: r.productId,
            p_unit_id: r.unitId,
            p_movement_type: "IN",
            p_quantity: r.quantity,
            p_unit_cost: r.unitCost,
            p_ref_type: "MANUAL",
            p_notes: `Snapshot import: ${r.sheetName} dòng ${r.rowIdx + 1}`,
            p_batch_no: r.batchNo,
            p_idempotency_key: r.idempotencyKey,
          });
          if (error) {
            return { ok: false, row: r, error: error.message };
          }
          return { ok: true, row: r, id: (data as any)?.id };
        } catch (e) {
          return { ok: false, row: r, error: (e as Error).message };
        }
      }),
    );
    for (const res of results) {
      if (res.ok) {
        inserted++;
        if (res.id) insertedMovements.push(res.id);
      } else {
        errors.push({
          row: res.row.rowIdx + 1,
          sheet: res.row.sheetName,
          sku: res.row.sku,
          message: `DB error: ${res.error}`,
        });
      }
    }
  }

  return json({
    total: totalRows,
    inserted,
    updated: 0,
    failed: errors.length,
    errors,
    insertedMovements,
    warehouseId,
    locationId,
    branchId,
  });
});
