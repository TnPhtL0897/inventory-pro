// =============================================================================
// Replenishment feature - Dự trù cuối tháng cho kho chẵn (RECEIVING)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type ReplenishmentRunType = "MANUAL" | "SCHEDULED";
export type ReplenishmentRunStatus = "COMPLETED" | "FAILED";

export interface ForecastLine {
  productId: string;
  productSku: string;
  productName: string;
  unitId: string;
  unitCode: string;
  currentStock: number;
  minStock: number;
  maxStock: number | null;
  avgDailyOut: number;
  forecastNextMonth: number;
  suggestedReplenishQty: number;
  estimatedUnitPrice: number;
  estimatedTotal: number;
  bidContractId: string | null;
  bidContractNo: string | null;
  bidLotId: string | null;
  bidLotName: string | null;
  reason: string;
}

export interface ForecastPreview {
  tenantId: string;
  asOfDate: string;
  fiscalYear: number;
  fiscalMonth: number;
  warehouseCount: number;
  productCount: number;
  totalEstimatedValue: number;
  lines: ForecastLine[];
}

export interface ReplenishmentRun {
  id: string;
  runType: ReplenishmentRunType;
  fiscalYear: number;
  fiscalMonth: number;
  asOfDate: string;
  triggeredByUser: string | null;
  status: ReplenishmentRunStatus;
  warehouseCount: number;
  productCount: number;
  totalEstimatedValue: number;
  createdPurchaseRequestIds: string[];
  errorMessage: string | null;
  createdAt: string;
}

export interface RunReplenishmentInput {
  fiscalYear: number;
  fiscalMonth: number;
  asOfDate?: string | null;
  saveAsPurchaseRequest: boolean;
  notes?: string | null;
}

export interface ListReplenishmentRunsParams {
  year?: number;
  page?: number;
  pageSize?: number;
}

function buildQuery(p: ListReplenishmentRunsParams): string {
  const qs = new URLSearchParams();
  if (p.year) qs.set("year", String(p.year));
  if (p.page) qs.set("page", String(p.page));
  if (p.pageSize) qs.set("pageSize", String(p.pageSize));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function toSnake(input: RunReplenishmentInput) {
  return {
    fiscal_year: input.fiscalYear,
    fiscal_month: input.fiscalMonth,
    as_of_date: input.asOfDate ?? null,
    save_as_purchase_request: input.saveAsPurchaseRequest,
    notes: input.notes ?? null,
  };
}

/** Preview - xem trước (dry-run, không save gì). */
export function useReplenishmentPreview() {
  return useMutation({
    mutationFn: (input: RunReplenishmentInput) =>
      api.post<ForecastPreview>("/api/v1/replenishment/preview", toSnake(input)),
  });
}

/** Run - chạy thật, tạo 1 PurchaseRequest DRAFT nếu saveAsPurchaseRequest=true. */
export function useRunReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunReplenishmentInput) =>
      api.post<ReplenishmentRun>("/api/v1/replenishment/run", toSnake(input)),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["replenishment-runs"] });
      toast.success(
        `Đã chạy dự trù tháng ${data.fiscalMonth}/${data.fiscalYear}: ${data.productCount} sản phẩm, tổng ${formatVND(data.totalEstimatedValue)}`,
        { description: data.createdPurchaseRequestIds.length > 0 ? `Đã tạo ${data.createdPurchaseRequestIds.length} PurchaseRequest` : undefined },
      );
    },
    onError: (e: ApiError) =>
      toast.error("Lỗi chạy dự trù", { description: e.message }),
  });
}

export function useReplenishmentRuns(params: ListReplenishmentRunsParams = {}) {
  return useQuery({
    queryKey: ["replenishment-runs", params],
    queryFn: () =>
      api.get<{ items: ReplenishmentRun[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
        `/api/v1/replenishment/runs${buildQuery(params)}`,
      ),
  });
}

export function formatVND(n: number | undefined | null) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}
