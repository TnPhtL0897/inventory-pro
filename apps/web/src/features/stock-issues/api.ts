// =============================================================================
// Stock Issues feature (Supabase PostgREST + Edge Function version)
// =============================================================================
// Reads: PostgREST (tables stock_issues, stock_issue_lines)
// Writes (CRUD + workflow): Edge Function "stock-issues" (handles DRAFT→POSTED,
//   lines, status transitions, stock_movements trigger)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  getById,
  callFunctionPascal,
  callActionPascal,
  type PaginatedResult,
} from "@/lib/data-access";

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

export interface IssueListParams {
  page?: number; pageSize?: number; search?: string;
  partyId?: string; branchId?: string; warehouseId?: string;
  purpose?: IssuePurpose; status?: IssueStatus; dateFrom?: string; dateTo?: string;
}

export function useStockIssues(params: IssueListParams = {}) {
  return useQuery({
    queryKey: ["stock-issues", params],
    queryFn: () =>
      listTable<StockIssue>("stock_issues", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["issue_number", "reference_no", "notes"],
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          party_id: params.partyId,
          branch_id: params.branchId,
          warehouse_id: params.warehouseId,
          purpose: params.purpose,
          status: params.status,
        },
      }),
  });
}

export function useStockIssue(id: string | undefined) {
  return useQuery({
    queryKey: ["stock-issues", id],
    queryFn: () => getById<StockIssue>("stock_issues", id),
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
    mutationFn: (input: CreateIssueInput) => callFunctionPascal<StockIssue>("stock-issues", input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-issues"] }); toast.success("Đã tạo phiếu xuất"); },
    onError: (e: Error) => toast.error("Lỗi", { description: e.message }),
  });
}

export function usePostIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callActionPascal<StockIssue>("stock-issues", id, "post"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-issues"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Đã xuất kho — trừ tồn");
    },
    onError: (e: Error) => toast.error("Lỗi post", { description: e.message }),
  });
}

export function useCancelIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<StockIssue>("stock-issues", id, "cancel", { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-issues"] }); toast.success("Đã hủy"); },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
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
