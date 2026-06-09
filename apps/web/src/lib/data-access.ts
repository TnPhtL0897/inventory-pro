// =============================================================================
// Data access layer: bridges Supabase PostgREST + Edge Functions to frontend
//
// Replaces fetch calls to Render API. Each helper maps snake_case DB rows
// to camelCase TS types matching what the C# backend used to return.
// =============================================================================
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Singleton browser client (RLS-applies, uses anon key + user JWT from session)
let _client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: true, autoRefreshToken: true },
      },
    );
  }
  return _client;
}

// =============================================================================
// Case transformation (snake_case ↔ camelCase)
// =============================================================================
const SNAKE_RE = /_([a-z0-9])/g;
const CAMEL_RE = /[A-Z]/g;

export function snakeToCamel(s: string): string {
  return s.replace(SNAKE_RE, (_, c) => c.toUpperCase());
}

export function camelToSnake(s: string): string {
  return s.replace(CAMEL_RE, (c) => "_" + c.toLowerCase());
}

export function mapRow<T = any>(row: any): T {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

export function mapRows<T = any>(rows: any[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.map(mapRow<T>);
}

// Deep transform: handles nested objects (like denormalized joins)
export function deepMap<T = any>(row: any): T {
  if (row === null || row === undefined) return row as T;
  if (typeof row !== "object" || Array.isArray(row) || row instanceof Date) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    const newKey = snakeToCamel(k);
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out[newKey] = deepMap(v);
    } else if (Array.isArray(v)) {
      out[newKey] = v.map((item) =>
        item && typeof item === "object" && !(item instanceof Date) ? deepMap(item) : item,
      );
    } else {
      out[newKey] = v;
    }
  }
  return out as T;
}

export function deepMapRows<T = any>(rows: any[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.map(deepMap<T>);
}

// =============================================================================
// PostgREST query helpers
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  searchColumns?: string[];
  orderBy?: string;        // snake_case column
  orderDesc?: boolean;
  filters?: Record<string, any>;
  select?: string;         // explicit PostgREST select
}

/**
 * List rows from a PostgREST table, return paginated camelCase result.
 * Uses Range header + content-range for total count.
 */
export async function listTable<T = any>(
  table: string,
  opts: ListOptions = {},
): Promise<PaginatedResult<T>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = sb().from(table).select(opts.select ?? "*", { count: "exact" });

  // Filters
  for (const [col, val] of Object.entries(opts.filters ?? {})) {
    if (val === null || val === undefined || val === "") continue;
    if (Array.isArray(val)) {
      q = q.in(col, val);
    } else if (typeof val === "string" && val.includes("*")) {
      q = q.like(col, val.replace(/\*/g, "%"));
    } else {
      q = q.eq(col, val);
    }
  }

  // Search (OR across columns)
  if (opts.search && opts.searchColumns?.length) {
    const term = `%${opts.search}%`;
    const ors = opts.searchColumns.map((c) => `${c}.ilike.${term}`).join(",");
    q = q.or(ors);
  }

  // Order + paginate
  if (opts.orderBy) q = q.order(opts.orderBy, { ascending: !opts.orderDesc });
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);

  return {
    items: deepMapRows<T>(data),
    total: count ?? 0,
    page,
    pageSize,
    hasMore: (count ?? 0) > to + 1,
  };
}

export async function getById<T = any>(table: string, id: string, select = "*"): Promise<T | null> {
  const { data, error } = await sb().from(table).select(select).eq("id", id).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ? deepMap<T>(data) : null;
}

export async function insertRow<T = any>(table: string, row: any): Promise<T> {
  const snake: any = {};
  for (const [k, v] of Object.entries(row)) snake[camelToSnake(k)] = v;
  const { data, error } = await sb().from(table).insert(snake).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return deepMap<T>(data);
}

export async function updateRow<T = any>(table: string, id: string, patch: any): Promise<T> {
  const snake: any = {};
  for (const [k, v] of Object.entries(patch)) snake[camelToSnake(k)] = v;
  const { data, error } = await sb().from(table).update(snake).eq("id", id).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return deepMap<T>(data);
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await sb().from(table).delete().eq("id", id);
  if (error) throw new Error(`${table}: ${error.message}`);
}

// =============================================================================
// Edge Function caller
// =============================================================================
async function callEdgeFunction<T = any>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body: any,
): Promise<T> {
  const { data: { session } } = await sb().auth.getSession();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any).error?.message ?? json.error ?? res.statusText;
    throw new Error(`Edge Function ${url} [${res.status}]: ${msg}`);
  }
  return json as T;
}

/**
 * Gọi Edge Function với path top-level (POST/PUT/DELETE /functions/v1/{name}).
 * Body chứa payload (camelCase được).
 */
export async function callFunction<T = any>(
  name: string,
  body: any,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  return callEdgeFunction<T>(url, method, body);
}

/**
 * Gọi Edge Function action path: /functions/v1/{name}/{id}/{action}
 * Dùng cho workflow như /stock-issues/{id}/post, /bid-lots/{id}/award, ...
 * Body là payload (camelCase được). Truyền subId nếu action cần (vd /bidders/{bidderId}).
 */
export async function callAction<T = any>(
  name: string,
  id: string,
  action: string,
  body?: any,
  subId?: string,
): Promise<T> {
  const tail = subId ? `${id}/${action}/${subId}` : `${id}/${action}`;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}/${tail}`;
  return callEdgeFunction<T>(url, "POST", body ?? {});
}

/**
 * callFunction variant: convert body keys to PascalCase (Edge Functions ported
 * from C# DTOs expect PascalCase fields like BranchId, WarehouseId, ...).
 */
export async function callFunctionPascal<T = any>(
  name: string,
  body: any,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  return callFunction<T>(name, toPascalCase(body), method);
}

/**
 * callAction variant: convert body keys to PascalCase.
 */
export async function callActionPascal<T = any>(
  name: string,
  id: string,
  action: string,
  body?: any,
  subId?: string,
): Promise<T> {
  return callAction<T>(name, id, action, body ? toPascalCase(body) : {}, subId);
}

/**
 * Gọi Edge Function với /{id} tail, không có action.
 * Dùng cho route kiểu PUT /stock-takes/{id} (update counts) hoặc DELETE /{id}.
 * method mặc định PUT; truyền "DELETE" cho xóa.
 */
export async function callEdgeWithId<T = any>(
  name: string,
  id: string,
  body: any,
  method: "PUT" | "DELETE" = "PUT",
): Promise<T> {
  const { data: { session } } = await sb().auth.getSession();
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}/${id}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body !== undefined && body !== null ? JSON.stringify(toPascalCase(body)) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any).error?.message ?? json.error ?? res.statusText;
    throw new Error(`Edge Function ${name}/${id} [${res.status}]: ${msg}`);
  }
  return json as T;
}

/**
 * Gọi Edge Function với single-segment action (không có id).
 * Dùng cho route kiểu POST /replenishment/preview, /replenishment/run.
 * Gọi URL /functions/v1/{name}/{action}.
 */
export async function callActionNoId<T = any>(
  name: string,
  action: string,
  body: any,
): Promise<T> {
  const { data: { session } } = await sb().auth.getSession();
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}/${action}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body !== undefined && body !== null ? JSON.stringify(toPascalCase(body)) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any).error?.message ?? json.error ?? res.statusText;
    throw new Error(`Edge Function ${name}/${action} [${res.status}]: ${msg}`);
  }
  return json as T;
}

/**
 * Convert object keys from camelCase to PascalCase (Edge Functions were
 * ported from C# DTOs verbatim and expect PascalCase fields).
 */
function camelToPascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function toPascalCase<T = any>(body: any): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const out: any = {};
  for (const [k, v] of Object.entries(body)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out[camelToPascal(k)] = toPascalCase(v);
    } else if (Array.isArray(v)) {
      out[camelToPascal(k)] = v.map((item) =>
        item && typeof item === "object" && !(item instanceof Date) ? toPascalCase(item) : item,
      );
    } else {
      out[camelToPascal(k)] = v;
    }
  }
  return out as T;
}
