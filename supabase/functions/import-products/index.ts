// Supabase Edge Function: import-products
// Bulk insert products from a parsed Excel/JSON payload.
//
// POST /functions/v1/import-products
// Body: {
//   rows: Array<{
//     sku: string,
//     name: string,
//     description?: string,
//     categoryCode?: string,     // FK to categories.code
//     baseUnitCode: string,      // FK to units_of_measure.code
//     productType?: string,      // GOODS | SERVICE | RAW_MATERIAL | FINISHED_GOOD | CONSUMABLE
//     costPrice?: number,
//     sellPrice?: number,
//     minStock?: number,
//     maxStock?: number,
//     isBatchTracked?: boolean,
//     isSerialTracked?: boolean,
//     isExpiryTracked?: boolean,
//     status?: string,           // ACTIVE | INACTIVE | ARCHIVED
//   }>,
//   dryRun?: boolean,            // true = validate only, no insert
//   updateExisting?: boolean,    // true = upsert by SKU; false = insert only (skip duplicates)
// }
//
// Returns: {
//   total: number,
//   inserted: number,
//   updated: number,
//   failed: number,
//   errors: Array<{ row: number, sku: string, message: string }>,
//   insertedSkus: string[],     // for follow-up UI
// }
//
// Deploy: supabase functions deploy import-products --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const ALLOWED_PRODUCT_TYPES = new Set([
  "GOODS", "SERVICE", "RAW_MATERIAL", "FINISHED_GOOD", "CONSUMABLE",
]);

const ALLOWED_STATUS = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return err("Method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  const dryRun: boolean = Boolean(body?.dryRun);
  const updateExisting: boolean = Boolean(body?.updateExisting);

  if (rows.length === 0) return err("No rows provided");
  if (rows.length > 5000) return err("Maximum 5000 rows per request");

  // Use service_role to bypass RLS (we validate tenant manually)
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify auth: read JWT from Authorization header
  const auth = req.headers.get("Authorization");
  let userId: string | null = null;
  if (auth) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    userId = user?.id ?? null;
  }
  if (!userId) return err("Unauthorized", 401);

  // Pre-fetch FK lookup maps (cache for performance)
  const [unitsMap, categoriesMap] = await Promise.all([
    loadLookup(svc, "units_of_measure", "code", "id"),
    loadLookup(svc, "categories", "code", "id"),
  ]);

  // Validate + normalize all rows first
  type ValidRow = {
    sku: string;
    name: string;
    description: string | null;
    base_unit_id: string;
    category_id: string | null;
    product_type: string;
    cost_price: number;
    sell_price: number;
    min_stock: number;
    max_stock: number | null;
    is_batch_tracked: boolean;
    is_serial_tracked: boolean;
    is_expiry_tracked: boolean;
    status: string;
    created_by: string;
  };
  type ValidationError = { row: number; sku: string; message: string };

  const validRows: ValidRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const sku = (r.sku ?? "").toString().trim();
    if (!sku) {
      errors.push({ row: i + 1, sku: sku || "(empty)", message: "Thiếu SKU" });
      continue;
    }
    if (!r.name) {
      errors.push({ row: i + 1, sku, message: "Thiếu tên sản phẩm" });
      continue;
    }
    const baseUnitCode = (r.baseUnitCode ?? "").toString().trim();
    if (!baseUnitCode) {
      errors.push({ row: i + 1, sku, message: "Thiếu mã đơn vị tính (baseUnitCode)" });
      continue;
    }
    const baseUnitId = unitsMap.get(baseUnitCode);
    if (!baseUnitId) {
      errors.push({ row: i + 1, sku, message: `Mã đơn vị tính không tồn tại: "${baseUnitCode}". Tạo trước khi import.` });
      continue;
    }
    let categoryId: string | null = null;
    if (r.categoryCode) {
      const cc = r.categoryCode.toString().trim();
      categoryId = categoriesMap.get(cc) ?? null;
      if (!categoryId) {
        errors.push({ row: i + 1, sku, message: `Mã nhóm không tồn tại: "${cc}". Tạo trước khi import.` });
        continue;
      }
    }
    const productType = (r.productType ?? "GOODS").toString().trim().toUpperCase();
    if (!ALLOWED_PRODUCT_TYPES.has(productType)) {
      errors.push({ row: i + 1, sku, message: `productType không hợp lệ: "${productType}"` });
      continue;
    }
    const status = (r.status ?? "ACTIVE").toString().trim().toUpperCase();
    if (!ALLOWED_STATUS.has(status)) {
      errors.push({ row: i + 1, sku, message: `status không hợp lệ: "${status}"` });
      continue;
    }
    validRows.push({
      sku,
      name: r.name.toString().trim(),
      description: r.description?.toString().trim() || null,
      base_unit_id: baseUnitId,
      category_id: categoryId,
      product_type: productType,
      cost_price: Number(r.costPrice) || 0,
      sell_price: Number(r.sellPrice) || 0,
      min_stock: Number(r.minStock) || 0,
      max_stock: r.maxStock != null ? Number(r.maxStock) : null,
      is_batch_tracked: Boolean(r.isBatchTracked),
      is_serial_tracked: Boolean(r.isSerialTracked),
      is_expiry_tracked: Boolean(r.isExpiryTracked),
      status,
      created_by: userId,
    });
  }

  if (dryRun) {
    return json({
      total: rows.length,
      inserted: 0,
      updated: 0,
      failed: errors.length,
      errors,
      insertedSkus: [],
      message: "Dry run - no rows inserted",
    });
  }

  if (validRows.length === 0) {
    return json({ total: rows.length, inserted: 0, updated: 0, failed: errors.length, errors, insertedSkus: [] });
  }

  // Batch insert (in chunks of 500 to avoid request size limits)
  const BATCH_SIZE = 500;
  let inserted = 0;
  let updated = 0;
  const insertedSkus: string[] = [];

  if (updateExisting) {
    // Upsert: use PostgREST with Prefer: resolution=merge-duplicates
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await svc
        .from("products")
        .upsert(batch, { onConflict: "sku", ignoreDuplicates: false })
        .select("sku");
      if (error) {
        for (const r of batch) {
          errors.push({ row: -1, sku: r.sku, message: error.message });
        }
      } else {
        // All rows in batch are upserts (count = batch.length)
        inserted += batch.length;
        insertedSkus.push(...(data?.map((d) => d.sku).filter(Boolean) as string[]) || batch.map((r) => r.sku));
      }
    }
  } else {
    // Insert only — check duplicates first
    const existingSkus = new Set<string>();
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const skus = validRows.slice(i, i + BATCH_SIZE).map((r) => r.sku);
      const { data } = await svc.from("products").select("sku").in("sku", skus);
      (data ?? []).forEach((d: any) => existingSkus.add(d.sku));
    }
    const newRows = validRows.filter((r) => !existingSkus.has(r.sku));
    const dupRows = validRows.filter((r) => existingSkus.has(r.sku));
    for (const r of dupRows) {
      errors.push({ row: -1, sku: r.sku, message: "SKU đã tồn tại (set updateExisting=true để ghi đè)" });
    }
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await svc
        .from("products")
        .insert(batch)
        .select("sku");
      if (error) {
        for (const r of batch) {
          errors.push({ row: -1, sku: r.sku, message: error.message });
        }
      } else {
        inserted += batch.length;
        insertedSkus.push(...(data?.map((d) => d.sku).filter(Boolean) as string[]) || batch.map((r) => r.sku));
      }
    }
  }

  return json({
    total: rows.length,
    inserted,
    updated,
    failed: errors.length,
    errors,
    insertedSkus,
  });
});

async function loadLookup(
  svc: SupabaseClient,
  table: string,
  keyCol: string,
  valueCol: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // Paginate in case >1000 rows
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await svc
      .from(table as any)
      .select(`${keyCol},${valueCol}`)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) map.set(row[keyCol], row[valueCol]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}
