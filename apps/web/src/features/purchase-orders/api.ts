// =============================================================================
// Purchase Orders feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type PoStatus = "DRAFT" | "APPROVED" | "POSTED" | "COMPLETED" | "CANCELLED";
export type PoLineStatus = "OPEN" | "PARTIAL" | "RECEIVED" | "CANCELLED";

export interface PoLine {
  id?: string;
  lineNo?: number;
  productId: string;
  productSku?: string;
  productName?: string;
  unitId: string;
  unitCode?: string;
  quantity: number;
  receivedQty?: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
  lineTotal?: number;
  status?: PoLineStatus;
  notes?: string | null;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  branchId: string;
  partyId: string;
  partyName?: string;
  partyCode?: string;
  orderDate: string;
  expectedDate?: string | null;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  paidAmount: number;
  status: PoStatus;
  paymentTerms: number;
  shippingAddress?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  postedBy?: string | null;
  postedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  lineCount: number;
  // ⭐ Thông tin thầu (mới)
  bidContractId?: string | null;
  bidContractNo?: string | null;
  bidContractValue?: number | null;
  bidContractUsedValue?: number | null;
  bidContractRemainingValue?: number | null;
  bidContractEndDate?: string | null;
  bidContractDaysToExpiry?: number | null;
  bidLotId?: string | null;
  bidLotName?: string | null;
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

export interface CreatePoLineInput {
  productId: string;
  unitId: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  taxPct?: number;
  notes?: string | null;
}

export interface CreatePoInput {
  branchId: string;
  partyId: string;
  orderDate: string;
  expectedDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  discountAmount?: number;
  shippingAmount?: number;
  paymentTerms?: number;
  shippingAddress?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  // ⭐ BẮT BUỘC: HĐ thầu
  bidContractId: string;
  bidLotId?: string | null;
  lines: CreatePoLineInput[];
}

export interface PoListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  partyId?: string;
  branchId?: string;
  status?: PoStatus;
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(p: PoListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function usePurchaseOrders(params: PoListParams = {}) {
  return useQuery({
    queryKey: ["purchase-orders", params],
    queryFn: () => api.get<PaginatedResult<PurchaseOrder>>(`/api/v1/purchase-orders${buildQuery(params)}`),
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => api.get<PurchaseOrder>(`/api/v1/purchase-orders/${id}`),
    enabled: !!id,
  });
}

export function useCreatePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePoInput) => api.post<PurchaseOrder>("/api/v1/purchase-orders", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã tạo đơn mua hàng");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo PO", { description: e.message }),
  });
}

export function useUpdatePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreatePoInput> }) =>
      api.put<PurchaseOrder>(`/api/v1/purchase-orders/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã cập nhật PO");
    },
    onError: (e: ApiError) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeletePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã xóa PO");
    },
    onError: (e: ApiError) => toast.error("Lỗi xóa PO", { description: e.message }),
  });
}

export function useApprovePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/approve`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã duyệt PO");
    },
    onError: (e: ApiError) => toast.error("Lỗi duyệt", { description: e.message }),
  });
}

export function usePostPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/post`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã post PO — chờ GRN");
    },
    onError: (e: ApiError) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<PurchaseOrder>(`/api/v1/purchase-orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã hủy PO");
    },
    onError: (e: ApiError) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  POSTED: "Đã đặt hàng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
export const PO_STATUS_COLORS: Record<PoStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  APPROVED: "bg-blue-100 text-blue-800",
  POSTED: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};
