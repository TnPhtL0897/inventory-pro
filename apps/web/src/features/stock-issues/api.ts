// =============================================================================
// Stock Issues feature
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type IssueStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type IssuePurpose = "SALE" | "INTERNAL_USE" | "SCRAP" | "SAMPLE" | "GIFT" | "TRANSFER_OUT" | "ADJUSTMENT";
export type IssueLineStatus = "OPEN" | "POSTED" | "CANCELLED";

export interface IssueLine {
  id?: string;
  lineNo?: number;
  productId: string;
  productSku?: string;
  productName?: string;
  unitId: string;
  unitCode?: string;
  locationId: string;
  locationCode?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  batchNo?: string | null;
  serialNo?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  movementId?: string | null;
  status?: IssueLineStatus;
}

export interface StockIssue {
  id: string;
  issueNumber: string;
  branchId: string;
  partyId?: string | null;
  partyName?: string;
  warehouseId: string;
  warehouseCode?: string;
  purpose: IssuePurpose;
  issueDate: string;
  referenceNo?: string | null;
  notes?: string | null;
  status: IssueStatus;
  postedBy?: string | null;
  postedAt?: string | null;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean; }

export interface IssueListParams {
  page?: number; pageSize?: number; search?: string;
  partyId?: string; branchId?: string; warehouseId?: string;
  purpose?: IssuePurpose; status?: IssueStatus; dateFrom?: string; dateTo?: string;
}

function buildQuery(p: IssueListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v)); });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useStockIssues(params: IssueListParams = {}) {
  return useQuery({
    queryKey: ["stock-issues", params],
    queryFn: () => api.get<PaginatedResult<StockIssue>>(`/api/v1/stock-issues${buildQuery(params)}`),
  });
}

export function useStockIssue(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-issues", id],
    queryFn: () => api.get<StockIssue>(`/api/v1/stock-issues/${id}`),
    enabled: !!id,
  });
}

export interface CreateIssueInput {
  branchId: string; partyId?: string | null; warehouseId: string;
  purpose: IssuePurpose; issueDate: string; referenceNo?: string | null; notes?: string | null;
  lines: Array<Omit<IssueLine, "id" | "lineNo" | "status" | "movementId" | "productSku" | "productName" | "unitCode" | "locationCode" | "lineTotal">>;
  idempotencyKeys: string[];
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIssueInput) => api.post<StockIssue>("/api/v1/stock-issues", input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-issues"] }); toast.success("Đã tạo phiếu xuất"); },
    onError: (e: ApiError) => toast.error("Lỗi", { description: e.message }),
  });
}

export function usePostIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<StockIssue>(`/api/v1/stock-issues/${id}/post`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-issues"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã xuất kho — trừ tồn");
    },
    onError: (e: ApiError) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<StockIssue>(`/api/v1/stock-issues/${id}/cancel`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-issues"] }); toast.success("Đã hủy"); },
    onError: (e: ApiError) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = { DRAFT: "Nháp", POSTED: "Đã xuất kho", CANCELLED: "Đã hủy" };
export const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800", POSTED: "bg-orange-100 text-orange-800", CANCELLED: "bg-red-100 text-red-800",
};
export const PURPOSE_LABELS: Record<IssuePurpose, string> = {
  SALE: "Bán hàng", INTERNAL_USE: "Dùng nội bộ", SCRAP: "Hủy hàng", SAMPLE: "Hàng mẫu",
  GIFT: "Quà tặng", TRANSFER_OUT: "Chuyển kho (legacy)", ADJUSTMENT: "Điều chỉnh (legacy)",
};
