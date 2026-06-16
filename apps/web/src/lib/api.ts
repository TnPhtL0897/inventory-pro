// =============================================================================
// API client chung cho web. Tự gắn Bearer token từ Supabase session.
// DEV MODE: trả mock data khi env Supabase là placeholder (chạy cả server + client).
// =============================================================================
import {
  IS_DEV_MOCK,
  MOCK_PRODUCTS,
  MOCK_WAREHOUSES,
  MOCK_BRANCHES,
  MOCK_CATEGORIES,
  MOCK_UNITS,
  MOCK_STOCK_LEVELS,
  MOCK_STOCK_MOVEMENTS,
  MOCK_PARTIES,
  MOCK_PURCHASE_ORDERS,
  MOCK_GOODS_RECEIPTS,
  MOCK_STOCK_TRANSFERS,
  MOCK_STOCK_TAKES,
  MOCK_STOCK_ISSUES,
  MOCK_BID_PLANS,
  MOCK_BID_PACKAGES,
  MOCK_BID_LOTS,
  MOCK_BID_CONTRACTS,
  MOCK_REPLENISHMENT_RUNS,
  MOCK_FORECAST_LINES,
  MOCK_FEFO_PICK_RESPONSE,
  MOCK_FEFO_COMPLIANCE,
  MOCK_FEFO_AUDIT_LOG,
  MOCK_OPEN_VIAL_EXPIRING,
  MOCK_OPEN_VIAL_STATUS,
  MOCK_OPEN_VIAL_LOTS,
  paginatedMock,
} from "./dev-mock";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// Stub - real token retrieval only happens in production
async function getAuthToken(): Promise<string | null> {
  if (IS_DEV_MOCK) return null;
  try {
    // Lazy import để tránh crash server-side khi không có env
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Dispatch mock data trong DEV MODE.
 * Trả ApiResponse shape giống backend ASP.NET.
 */
function devMockResponse<T>(path: string, method: string, body: unknown): T | null {
  if (!IS_DEV_MOCK) return null;
  if (method !== "GET" && method !== "POST" && method !== "") return null; // Mock GET + POST ở đây

  const parts = path.split("?");
  const pathname = parts[0];
  const params = new URLSearchParams(parts[1] ?? "");
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 20);

  if (pathname.startsWith("/api/v1/products")) return paginatedMock(MOCK_PRODUCTS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/warehouses")) {
    // Support filter by type, status, branchId
    let items = MOCK_WAREHOUSES as Array<Record<string, unknown>>;
    const t = params.get("type");
    const s = params.get("status");
    const b = params.get("branchId");
    if (t) items = items.filter((x) => x.type === t);
    if (s) items = items.filter((x) => x.status === s);
    if (b) items = items.filter((x) => x.branchId === b);
    return paginatedMock(items, page, pageSize) as unknown as T;
  }
  if (pathname.startsWith("/api/v1/branches")) return paginatedMock(MOCK_BRANCHES, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/categories")) return paginatedMock(MOCK_CATEGORIES, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/units")) return paginatedMock(MOCK_UNITS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/stock/movements")) return paginatedMock(MOCK_STOCK_MOVEMENTS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/stock")) return paginatedMock(MOCK_STOCK_LEVELS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/parties")) return paginatedMock(MOCK_PARTIES, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/purchase-orders")) return paginatedMock(MOCK_PURCHASE_ORDERS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/goods-receipts")) return paginatedMock(MOCK_GOODS_RECEIPTS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/stock-transfers")) return paginatedMock(MOCK_STOCK_TRANSFERS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/stock-takes")) return paginatedMock(MOCK_STOCK_TAKES, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/stock-issues")) return paginatedMock(MOCK_STOCK_ISSUES, page, pageSize) as unknown as T;
  // Bidding
  if (pathname.startsWith("/api/v1/bid-contracts/active-lookup")) {
    return MOCK_BID_CONTRACTS.filter((c: any) => c.bidContractStatus === "ACTIVE") as unknown as T;
  }
  if (pathname.startsWith("/api/v1/bid-contracts")) {
    let items = MOCK_BID_CONTRACTS as Array<Record<string, unknown>>;
    const st = params.get("status");
    if (st) items = items.filter((x) => x.bidContractStatus === st);
    return paginatedMock(items, page, pageSize) as unknown as T;
  }
  if (pathname.startsWith("/api/v1/bid-lots")) return paginatedMock(MOCK_BID_LOTS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/bid-packages")) return paginatedMock(MOCK_BID_PACKAGES, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/bid-plans")) return paginatedMock(MOCK_BID_PLANS, page, pageSize) as unknown as T;
  if (pathname.startsWith("/api/v1/purchase-requests")) return paginatedMock([], page, pageSize) as unknown as T;
  // Replenishment (Dự trù cuối tháng)
  if (pathname.startsWith("/api/v1/replenishment/runs")) {
    let items = MOCK_REPLENISHMENT_RUNS as Array<Record<string, unknown>>;
    const y = params.get("year");
    if (y) items = items.filter((x) => String(x.fiscalYear) === y);
    return paginatedMock(items, page, pageSize) as unknown as T;
  }
  if (pathname.startsWith("/api/v1/replenishment/preview")) {
    // Mock preview: trả về các forecast lines mẫu
    return {
      tenantId: "00000000-0000-0000-0000-000000000001",
      asOfDate: new Date().toISOString().split("T")[0],
      fiscalYear: new Date().getFullYear(),
      fiscalMonth: new Date().getMonth() + 1,
      warehouseCount: 2,
      productCount: 4,
      totalEstimatedValue: 2_419_825_500,
      lines: MOCK_FORECAST_LINES,
    } as unknown as T;
  }
  if (pathname.startsWith("/api/v1/replenishment/run")) {
    // Mock run: thêm record mới vào danh sách (chỉ trả record mới)
    return MOCK_REPLENISHMENT_RUNS[0] as unknown as T;
  }
  // FEFO (First-Expire-First-Out) - Khoa XN Module 2
  if (pathname.includes("/functions/v1/fefo-pick/compliance")) {
    return MOCK_FEFO_COMPLIANCE as unknown as T;
  }
  if (pathname.includes("/functions/v1/fefo-pick")) {
    return MOCK_FEFO_PICK_RESPONSE as unknown as T;
  }
  if (pathname.includes("/functions/v1/fefo-override")) {
    return {
      success: true,
      auditId: "fefo-audit-mock-" + Date.now(),
      auditLevel: "WARNING",
      message: "⚠️ Đã ghi audit log override (mock)",
    } as unknown as T;
  }
  if (pathname.startsWith("/fefo_audit_log")) {
    let items = MOCK_FEFO_AUDIT_LOG.data as Array<Record<string, unknown>>;
    const al = params.get("audit_level");
    if (al) items = items.filter((x) => x.auditLevel === al);
    return paginatedMock(items, page, pageSize) as unknown as T;
  }
  // Open-Vial
  if (pathname.includes("/functions/v1/open-vial-action/expiring")) {
    return MOCK_OPEN_VIAL_EXPIRING as unknown as T;
  }
  if (pathname.includes("/functions/v1/open-vial-action/status")) {
    return MOCK_OPEN_VIAL_STATUS as unknown as T;
  }
  if (pathname.includes("/functions/v1/open-vial-action")) {
    return {
      success: true,
      action: "open",
      historyId: "ov-history-mock-" + Date.now(),
      openVialExpirationDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      printQueueId: "ov-queue-mock-" + Date.now(),
      message: "🧪 Đã mở nắp (mock). Nhãn sẽ in tự động.",
    } as unknown as T;
  }
  if (pathname.includes("/functions/v1/open-vial-qc")) {
    return {
      success: true,
      qcRecordId: "ov-qc-mock-" + Date.now(),
      message: "✅ QC lại thành công (mock).",
    } as unknown as T;
  }
  if (pathname.startsWith("/lots") && params.get("status") === "IN_USE") {
    return paginatedMock(MOCK_OPEN_VIAL_LOTS.data, page, pageSize) as unknown as T;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";

  // Ưu tiên 1: Mock data trong DEV MODE (cả GET và POST cho dialog/preview flows)
  if (IS_DEV_MOCK && (method === "GET" || method === "POST")) {
    const mock = devMockResponse<T>(path, method, init.body);
    if (mock) return mock;
    // Nếu không match mock route nào, trả empty paginated (cho GET) hoặc success (cho POST)
    if (pathnameStartsWithApiV1(path)) {
      if (method === "GET") {
        return { items: [], total: 0, page: 1, page_size: 20, has_more: false } as unknown as T;
      }
      // POST fallback: trả về success envelope rỗng
      return { success: true, data: null } as unknown as T;
    }
  }

  // Ưu tiên 2: Real fetch (khi backend chạy)
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as ApiResult<T>;

  if (!res.ok || !body.success) {
    const err = (body as ApiFailure).error ?? { code: "HTTP_ERROR", message: res.statusText };
    throw new ApiError(err.code, err.message, res.status, err.details);
  }
  return (body as ApiSuccess<T>).data;
}

function pathnameStartsWithApiV1(path: string): boolean {
  return path.startsWith("/api/v1/");
}

// Helpers
export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export const API_BASE = API_BASE_URL;
export { IS_DEV_MOCK };
