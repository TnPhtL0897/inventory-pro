// =============================================================================
// Purchase Orders feature - Supabase + Edge Function version
// =============================================================================
// Reads: PostgREST (tables purchase_orders + purchase_order_lines)
// Writes: Edge Function "purchase-orders" (create/update/approve/post/cancel)
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
  // Thông tin thầu
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

export function usePurchaseOrders(params: PoListParams = {}) {
  return useQuery({
    queryKey: ["purchase-orders", params],
    queryFn: () =>
      listTable<PurchaseOrder>("purchase_orders", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["po_number", "notes"],
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          party_id: params.partyId,
          branch_id: params.branchId,
          status: params.status,
        },
      }),
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => getById<PurchaseOrder>("purchase_orders", id),
    enabled: !!id,
  });
}

export function useCreatePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePoInput) => callFunctionPascal<PurchaseOrder>("purchase-orders", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã tạo đơn mua hàng");
    },
    onError: (e: Error) => toast.error("Lỗi tạo PO", { description: e.message }),
  });
}

export function useUpdatePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreatePoInput> }) =>
      callEdgeWithId<PurchaseOrder>("purchase-orders", id, input, "PUT"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã cập nhật PO");
    },
    onError: (e: Error) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeletePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callEdgeWithId<void>("purchase-orders", id, {}, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã xóa PO");
    },
    onError: (e: Error) => toast.error("Lỗi xóa PO", { description: e.message }),
  });
}

export function useApprovePo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      callActionPascal<PurchaseOrder>("purchase-orders", id, "approve", { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã duyệt PO");
    },
    onError: (e: Error) => toast.error("Lỗi duyệt", { description: e.message }),
  });
}

export function usePostPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callActionPascal<PurchaseOrder>("purchase-orders", id, "post"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã post PO — chờ GRN");
    },
    onError: (e: Error) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<PurchaseOrder>("purchase-orders", id, "cancel", { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success("Đã hủy PO");
    },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
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
