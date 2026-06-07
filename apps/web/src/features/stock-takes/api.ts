// =============================================================================
// Stock Takes feature (kiểm kê)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type StockTakeStatus = "DRAFT" | "COUNTED" | "POSTED" | "CANCELLED";

export interface StockTake {
  id: string;
  stockTakeNumber: string;
  branchId: string;
  warehouseId: string;
  warehouseCode: string | null;
  stockTakeDate: string;
  notes: string | null;
  status: string;
  countedBy: string | null;
  countedAt: string | null;
  postedBy: string | null;
  postedAt: string | null;
  cancelReason: string | null;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface StockTakeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  warehouseId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(p: StockTakeListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useStockTakes(params: StockTakeListParams = {}) {
  return useQuery({
    queryKey: ["stock-takes", params],
    queryFn: () => api.get<PaginatedResult<StockTake>>(`/api/v1/stock-takes${buildQuery(params)}`),
  });
}

export function useStockTake(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-takes", id],
    queryFn: () => api.get<StockTake>(`/api/v1/stock-takes/${id}`),
    enabled: !!id,
  });
}

export interface CreateStockTakeInput {
  branchId: string;
  warehouseId: string;
  stockTakeDate: string;
  notes?: string | null;
  lines?: { productId: string; unitId: string; locationId: string; batchNo?: string | null; serialNo?: string | null }[] | null;
}

export function useCreateStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockTakeInput) => api.post<StockTake>("/api/v1/stock-takes", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã tạo phiếu kiểm kê");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo phiếu", { description: e.message }),
  });
}

export function useUpdateCounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { lineId: string; countedQty: number | null; notes?: string }[] }) =>
      api.post<StockTake>(`/api/v1/stock-takes/${id}/counts`, { updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã lưu số đếm");
    },
    onError: (e: ApiError) => toast.error("Lỗi lưu số đếm", { description: e.message }),
  });
}

export function usePostStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StockTake>(`/api/v1/stock-takes/${id}/post`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock", "movements"] });
      toast.success("Đã chốt kiểm kê - tạo ADJUST movements");
    },
    onError: (e: ApiError) => toast.error("Lỗi chốt", { description: e.message }),
  });
}

export function useCancelStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<StockTake>(`/api/v1/stock-takes/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã hủy phiếu kiểm kê");
    },
    onError: (e: ApiError) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export const STOCKTAKE_STATUS_LABELS: Record<StockTakeStatus, string> = {
  DRAFT: "Đang đếm",
  COUNTED: "Đã đếm xong",
  POSTED: "Đã chốt",
  CANCELLED: "Đã hủy",
};
export const STOCKTAKE_STATUS_COLORS: Record<StockTakeStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  COUNTED: "bg-amber-100 text-amber-800",
  POSTED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};
