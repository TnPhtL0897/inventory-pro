// =============================================================================
// Stock Takes feature (kiểm kê) - Supabase + Edge Function version
// =============================================================================
// Reads: PostgREST (tables stock_takes + stock_take_lines via FK)
// Writes: Edge Function "stock-takes" (handles snapshot, status transitions,
//   ADJUST movements)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  getById,
  callFunctionPascal,
  callActionPascal,
  callEdgeWithId,
  type PaginatedResult,
} from "@/lib/data-access";

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

export function useStockTakes(params: StockTakeListParams = {}) {
  return useQuery({
    queryKey: ["stock-takes", params],
    queryFn: () =>
      listTable<StockTake>("stock_takes", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["stock_take_number", "notes"],
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          branch_id: params.branchId,
          warehouse_id: params.warehouseId,
          status: params.status,
        },
      }),
  });
}

export function useStockTake(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-takes", id],
    queryFn: () => getById<StockTake>("stock_takes", id),
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
    mutationFn: (input: CreateStockTakeInput) => callFunctionPascal<StockTake>("stock-takes", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã tạo phiếu kiểm kê");
    },
    onError: (e: Error) => toast.error("Lỗi tạo phiếu", { description: e.message }),
  });
}

export function useUpdateCounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { lineId: string; countedQty: number | null; notes?: string }[] }) =>
      // Edge Function: PUT /stock-takes/{id} (no action => updateCounts)
      callEdgeWithId<StockTake>("stock-takes", id, { updates }, "PUT"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã lưu số đếm");
    },
    onError: (e: Error) => toast.error("Lỗi lưu số đếm", { description: e.message }),
  });
}

export function usePostStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callActionPascal<StockTake>("stock-takes", id, "post"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock", "movements"] });
      toast.success("Đã chốt kiểm kê - tạo ADJUST movements");
    },
    onError: (e: Error) => toast.error("Lỗi chốt", { description: e.message }),
  });
}

export function useCancelStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<StockTake>("stock-takes", id, "cancel", { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] });
      toast.success("Đã hủy phiếu kiểm kê");
    },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
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
