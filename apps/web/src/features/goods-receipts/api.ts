// =============================================================================
// Goods Receipts (GRN) feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type GrnStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type GrnLineStatus = "OPEN" | "POSTED" | "CANCELLED";

export interface GrnLine {
  id?: string;
  lineNo?: number;
  poLineId?: string | null;
  productId: string;
  productSku?: string;
  productName?: string;
  unitId: string;
  unitCode?: string;
  locationId: string;
  locationCode?: string;
  quantity: number;
  unitCost: number;
  lineTotal?: number;
  batchNo?: string | null;
  serialNo?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  movementId?: string | null;
  status?: GrnLineStatus;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  branchId: string;
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  partyId: string;
  partyName?: string;
  partyCode?: string;
  warehouseId: string;
  warehouseCode?: string;
  receiptDate: string;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  notes?: string | null;
  status: GrnStatus;
  postedBy?: string | null;
  postedAt?: string | null;
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

export interface GrnListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  partyId?: string;
  purchaseOrderId?: string;
  branchId?: string;
  status?: GrnStatus;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(p: GrnListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useGoodsReceipts(params: GrnListParams = {}) {
  return useQuery({
    queryKey: ["goods-receipts", params],
    queryFn: () => api.get<PaginatedResult<GoodsReceipt>>(`/api/v1/goods-receipts${buildQuery(params)}`),
  });
}

export function useGoodsReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["goods-receipts", id],
    queryFn: () => api.get<GoodsReceipt>(`/api/v1/goods-receipts/${id}`),
    enabled: !!id,
  });
}

export interface CreateGrnInput {
  branchId: string;
  purchaseOrderId?: string | null;
  partyId: string;
  warehouseId: string;
  receiptDate: string;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  notes?: string | null;
  lines: Array<Omit<GrnLine, "id" | "lineNo" | "status" | "movementId" | "productSku" | "productName" | "unitCode" | "locationCode" | "lineTotal">>;
  idempotencyKeys: string[];
}

export function useCreateGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGrnInput) => api.post<GoodsReceipt>("/api/v1/goods-receipts", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã tạo phiếu nhập kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo GRN", { description: e.message }),
  });
}

export function useUpdateGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateGrnInput> }) =>
      api.put<GoodsReceipt>(`/api/v1/goods-receipts/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã cập nhật GRN");
    },
    onError: (e: ApiError) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function usePostGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<GoodsReceipt>(`/api/v1/goods-receipts/${id}/post`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Đã post GRN — đã ghi stock_movements");
    },
    onError: (e: ApiError) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<GoodsReceipt>(`/api/v1/goods-receipts/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã hủy GRN");
    },
    onError: (e: ApiError) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export const GRN_STATUS_LABELS: Record<GrnStatus, string> = {
  DRAFT: "Nháp",
  POSTED: "Đã nhập kho",
  CANCELLED: "Đã hủy",
};
export const GRN_STATUS_COLORS: Record<GrnStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  POSTED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};
