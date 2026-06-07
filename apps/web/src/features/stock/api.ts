// =============================================================================
// Stock feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type StockMovementType =
  | "IN" | "OUT" | "TRANSFER_IN" | "TRANSFER_OUT"
  | "ADJUST_IN" | "ADJUST_OUT" | "RETURN_IN" | "RETURN_OUT";

export interface StockLevel {
  productId: string;
  productSku: string;
  productName: string;
  baseUnitCode: string | null;
  branchId: string;
  warehouseId: string;
  warehouseCode: string;
  locationId: string;
  locationCode: string;
  batchNo: string | null;
  serialNo: string | null;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  avgCost: number;
  lastMovementAt: string | null;
}

export interface StockMovement {
  id: string;
  branchId: string;
  warehouseId: string;
  locationId: string;
  productId: string;
  productSku: string | null;
  productName: string | null;
  unitId: string;
  movementType: string;
  quantity: number;
  unitCost: number | null;
  refType: string;
  refId: string | null;
  notes: string | null;
  batchNo: string | null;
  serialNo: string | null;
  expiryDate: string | null;
  idempotencyKey: string;
  postedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================================================
// List stock levels
// =============================================================================
export interface StockListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  warehouseId?: string;
  productId?: string;
  categoryId?: string;
  search?: string;
}

function buildQuery(p: StockListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useStockLevels(params: StockListParams = {}) {
  return useQuery({
    queryKey: ["stock", "levels", params],
    queryFn: () => api.get<PaginatedResult<StockLevel>>(`/api/v1/stock${buildQuery(params)}`),
  });
}

// =============================================================================
// List stock movements
// =============================================================================
export interface MovementListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  warehouseId?: string;
  productId?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useStockMovements(params: MovementListParams = {}) {
  return useQuery({
    queryKey: ["stock", "movements", params],
    queryFn: () => api.get<PaginatedResult<StockMovement>>(`/api/v1/stock/movements${buildQuery(params)}`),
  });
}

// =============================================================================
// Record stock movement (manual IN/OUT/ADJUST...)
// =============================================================================
export interface RecordMovementInput {
  branchId: string;
  warehouseId: string;
  locationId: string;
  productId: string;
  unitId: string;
  movementType: StockMovementType;
  quantity: number;
  unitCost?: number | null;
  notes?: string | null;
  batchNo?: string | null;
  serialNo?: string | null;
  expiryDate?: string | null;
}

function genUuid(): string {
  // Browser crypto UUID
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useRecordMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordMovementInput) => {
      const idempotencyKey = genUuid();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000"}/api/v1/stock/movements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, idempotency_key: idempotencyKey }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new ApiError(
          body?.error?.code ?? `HTTP_${res.status}`,
          body?.error?.message ?? "Lỗi ghi movement",
          res.status,
          body?.error?.details,
        );
      }
      return body.data as StockMovement;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock", "levels"] });
      qc.invalidateQueries({ queryKey: ["stock", "movements"] });
      const verb = vars.movementType === "IN" || vars.movementType === "TRANSFER_IN" || vars.movementType === "ADJUST_IN"
        ? "nhập" : "xuất";
      toast.success(`Đã ghi ${verb} kho`);
    },
    onError: (e: ApiError) => toast.error("Lỗi ghi movement", { description: e.message }),
  });
}

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  IN: "Nhập kho",
  OUT: "Xuất kho",
  TRANSFER_IN: "Nhận chuyển kho",
  TRANSFER_OUT: "Chuyển kho đi",
  ADJUST_IN: "Điều chỉnh tăng",
  ADJUST_OUT: "Điều chỉnh giảm",
  RETURN_IN: "Khách trả hàng",
  RETURN_OUT: "Trả nhà cung cấp",
};
export const MOVEMENT_COLORS: Record<StockMovementType, string> = {
  IN: "bg-green-100 text-green-800",
  OUT: "bg-orange-100 text-orange-800",
  TRANSFER_IN: "bg-blue-100 text-blue-800",
  TRANSFER_OUT: "bg-indigo-100 text-indigo-800",
  ADJUST_IN: "bg-emerald-100 text-emerald-800",
  ADJUST_OUT: "bg-amber-100 text-amber-800",
  RETURN_IN: "bg-cyan-100 text-cyan-800",
  RETURN_OUT: "bg-purple-100 text-purple-800",
};
