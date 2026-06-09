// =============================================================================
// Goods Receipts (GRN) feature - Supabase + Edge Function version
// =============================================================================
// Reads: PostgREST (tables goods_receipts + goods_receipt_lines)
// Writes: Edge Function "goods-receipts" (create/update/post/cancel)
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

export function useGoodsReceipts(params: GrnListParams = {}) {
  return useQuery({
    queryKey: ["goods-receipts", params],
    queryFn: () =>
      listTable<GoodsReceipt>("goods_receipts", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["grn_number", "supplier_invoice_no", "notes"],
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          party_id: params.partyId,
          purchase_order_id: params.purchaseOrderId,
          branch_id: params.branchId,
          status: params.status,
        },
      }),
  });
}

export function useGoodsReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ["goods-receipts", id],
    queryFn: () => getById<GoodsReceipt>("goods_receipts", id),
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
    mutationFn: (input: CreateGrnInput) => callFunctionPascal<GoodsReceipt>("goods-receipts", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã tạo phiếu nhập kho");
    },
    onError: (e: Error) => toast.error("Lỗi tạo GRN", { description: e.message }),
  });
}

export function useUpdateGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateGrnInput> }) =>
      callEdgeWithId<GoodsReceipt>("goods-receipts", id, input, "PUT"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã cập nhật GRN");
    },
    onError: (e: Error) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function usePostGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callActionPascal<GoodsReceipt>("goods-receipts", id, "post"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Đã post GRN — đã ghi stock_movements");
    },
    onError: (e: Error) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelGrn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<GoodsReceipt>("goods-receipts", id, "cancel", { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      toast.success("Đã hủy GRN");
    },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
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
