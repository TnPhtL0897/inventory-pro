// =============================================================================
// Stock Transfers feature - Supabase + Edge Function version
// =============================================================================
// Reads: PostgREST (tables stock_transfers + stock_transfer_lines)
// Writes: Edge Function "stock-transfers" (create/ship/receive/cancel/delete)
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

export function useStockTransfers(params: TransferListParams = {}) {
  return useQuery({
    queryKey: ["stock-transfers", params],
    queryFn: () =>
      listTable<StockTransfer>("stock_transfers", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["transfer_number", "notes"],
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          from_branch_id: params.fromBranchId,
          to_branch_id: params.toBranchId,
          from_warehouse_id: params.fromWarehouseId,
          to_warehouse_id: params.toWarehouseId,
          status: params.status,
        },
      }),
  });
}

export function useStockTransfer(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-transfers", id],
    queryFn: () => getById<StockTransfer>("stock_transfers", id),
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
    mutationFn: (input: CreateTransferInput) => callFunctionPascal<StockTransfer>("stock-transfers", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã tạo phiếu chuyển kho");
    },
    onError: (e: Error) => toast.error("Lỗi tạo phiếu", { description: e.message }),
  });
}

export function useShipTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callActionPascal<StockTransfer>("stock-transfers", id, "ship"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã ship - tạo TRANSFER_OUT movements");
    },
    onError: (e: Error) => toast.error("Lỗi ship", { description: e.message }),
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
      callActionPascal<StockTransfer>("stock-transfers", id, "receive", request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã nhận hàng - tạo TRANSFER_IN movements");
    },
    onError: (e: Error) => toast.error("Lỗi nhận hàng", { description: e.message }),
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<StockTransfer>("stock-transfers", id, "cancel", { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã hủy phiếu chuyển kho");
    },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export function useDeleteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callEdgeWithId<void>("stock-transfers", id, {}, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success("Đã xóa phiếu");
    },
    onError: (e: Error) => toast.error("Lỗi xóa", { description: e.message }),
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
