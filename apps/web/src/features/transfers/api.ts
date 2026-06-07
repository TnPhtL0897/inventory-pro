// =============================================================================
// Stock Transfers feature
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type StockTransferStatus = "DRAFT" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  fromWarehouseId: string;
  fromWarehouseCode: string | null;
  toBranchId: string;
  toWarehouseId: string;
  toWarehouseCode: string | null;
  transferDate: string;
  expectedReceiptDate: string | null;
  notes: string | null;
  status: string;
  outShippedBy: string | null;
  outShippedAt: string | null;
  inReceivedBy: string | null;
  inReceivedAt: string | null;
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

export interface TransferListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  fromBranchId?: string;
  toBranchId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(p: TransferListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useStockTransfers(params: TransferListParams = {}) {
  return useQuery({
    queryKey: ["stock-transfers", params],
    queryFn: () => api.get<PaginatedResult<StockTransfer>>(`/api/v1/stock-transfers${buildQuery(params)}`),
  });
}

export function useStockTransfer(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-transfers", id],
    queryFn: () => api.get<StockTransfer>(`/api/v1/stock-transfers/${id}`),
    enabled: !!id,
  });
}

export interface CreateTransferLineInput {
  productId: string;
  unitId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  batchNo?: string | null;
  serialNo?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}

export interface CreateTransferInput {
  fromBranchId: string;
  fromWarehouseId: string;
  toBranchId: string;
  toWarehouseId: string;
  transferDate: string;
  expectedReceiptDate?: string | null;
  notes?: string | null;
  lines: CreateTransferLineInput[];
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransferInput) => api.post<StockTransfer>("/api/v1/stock-transfers", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã tạo phiếu chuyển kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo phiếu", { description: e.message }),
  });
}

export function useShipTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StockTransfer>(`/api/v1/stock-transfers/${id}/ship`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã ship - tạo TRANSFER_OUT movements");
    },
    onError: (e: ApiError) => toast.error("Lỗi ship", { description: e.message }),
  });
}

export interface ReceiveTransferLine {
  lineId: string;
  receivedQty: number;
}

export function useReceiveTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: { lines: ReceiveTransferLine[]; notes?: string } }) =>
      api.post<StockTransfer>(`/api/v1/stock-transfers/${id}/receive`, request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã nhận hàng - tạo TRANSFER_IN movements");
    },
    onError: (e: ApiError) => toast.error("Lỗi nhận hàng", { description: e.message }),
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<StockTransfer>(`/api/v1/stock-transfers/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã hủy phiếu chuyển kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export function useDeleteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/stock-transfers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã xóa phiếu");
    },
    onError: (e: ApiError) => toast.error("Lỗi xóa", { description: e.message }),
  });
}

export const TRANSFER_STATUS_LABELS: Record<StockTransferStatus, string> = {
  DRAFT: "Nháp",
  IN_TRANSIT: "Đang chuyển",
  RECEIVED: "Đã nhận",
  CANCELLED: "Đã hủy",
};
export const TRANSFER_STATUS_COLORS: Record<StockTransferStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  IN_TRANSIT: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};
