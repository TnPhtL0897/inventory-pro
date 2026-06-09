// =============================================================================
// Replenishment feature - Dự trù cuối tháng cho kho chẵn (RECEIVING)
// =============================================================================
// Preview/Run: Edge Function "replenishment" with /preview and /run actions.
// Runs history: PostgREST (table month_end_forecast_runs).
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  callActionNoId,
} from "@/lib/data-access";

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

function toPayload(input: RunReplenishmentInput) {
  return {
    fiscalYear: input.fiscalYear,
    fiscalMonth: input.fiscalMonth,
    asOfDate: input.asOfDate ?? null,
    saveAsPurchaseRequest: input.saveAsPurchaseRequest,
    notes: input.notes ?? null,
  };
}

/** Preview - xem trước (dry-run, không save gì). */
export function useReplenishmentPreview() {
  return useMutation({
    mutationFn: (input: RunReplenishmentInput) =>
      // Edge Function: POST /replenishment/preview (single-segment action)
      callActionNoId<ForecastPreview>("replenishment", "preview", toPayload(input)),
  });
}

/** Run - chạy thật, tạo 1 PurchaseRequest DRAFT nếu saveAsPurchaseRequest=true. */
export function useRunReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunReplenishmentInput) =>
      callActionNoId<ReplenishmentRun>("replenishment", "run", toPayload(input)),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["replenishment-runs"] });
      toast.success(
        `Đã chạy dự trù tháng ${data.fiscalMonth}/${data.fiscalYear}: ${data.productCount} sản phẩm, tổng ${formatVND(data.totalEstimatedValue)}`,
        { description: data.createdPurchaseRequestIds.length > 0 ? `Đã tạo ${data.createdPurchaseRequestIds.length} PurchaseRequest` : undefined },
      );
    },
    onError: (e: Error) =>
      toast.error("Lỗi chạy dự trù", { description: e.message }),
  });
}

export function useReplenishmentRuns(params: ListReplenishmentRunsParams = {}) {
  return useQuery({
    queryKey: ["replenishment-runs", params],
    queryFn: () =>
      listTable<ReplenishmentRun>("month_end_forecast_runs", {
        page: params.page,
        pageSize: params.pageSize,
        orderBy: "created_at",
        orderDesc: true,
        filters: { fiscal_year: params.year },
      }),
  });
}

export function formatVND(n: number | undefined | null) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}
