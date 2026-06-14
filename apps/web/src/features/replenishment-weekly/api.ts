// =============================================================================
// Khoa XN — Module 3: Weekly Replenishment API hooks
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sb, deepMap, deepMapRows, callFunction } from "@/lib/data-access";
import {
  REPLENISHMENT_APPROVAL_THRESHOLD_VND,
  type WeeklyReplenishmentRun,
  type WeeklyReplenishmentLine,
  type ReplenishmentRunStatus,
  type ProductGroup,
} from "@inventorypro/shared-types";

// =============================================================================
// Queries
// =============================================================================

export interface WeeklyReplenishmentRunListParams {
  productGroup?: ProductGroup | "";
  status?: ReplenishmentRunStatus | "";
  periodDate?: string;
  limit?: number;
}

export function useWeeklyReplenishmentRuns(params: WeeklyReplenishmentRunListParams = {}) {
  return useQuery({
    queryKey: ["weekly-replenishment-runs", params],
    queryFn: async () => {
      let q = sb()
        .from("weekly_replenishment_runs")
        .select("*, lines:weekly_replenishment_lines(count)")
        .order("period_date", { ascending: false })
        .limit(params.limit ?? 20);

      if (params.productGroup) q = q.eq("product_group", params.productGroup);
      if (params.status) q = q.eq("status", params.status);
      if (params.periodDate) q = q.eq("period_date", params.periodDate);

      const { data, error } = await q;
      if (error) throw error;
      return deepMapRows<WeeklyReplenishmentRun & { lines: { count: number }[] }>(
        data ?? []
      );
    },
  });
}

export function useWeeklyReplenishmentRun(id: string | undefined) {
  return useQuery({
    queryKey: ["weekly-replenishment-run", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await sb()
        .from("weekly_replenishment_runs")
        .select(
          `*,
          lines:weekly_replenishment_lines(
            *,
            product:products(id, sku, name, unit_of_measure:base_unit_id(code), product_group, min_stock, max_stock, open_vial_stability_days),
            lot:lots!selected_lot_id(id, lot_number, expiration_date, quantity)
          )`
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return deepMap<WeeklyReplenishmentRun & { lines: any[] }>(data);
    },
    enabled: !!id,
  });
}

export function usePendingReplenishmentAlerts() {
  return useQuery({
    queryKey: ["weekly-replenishment-alerts", "unresolved"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("weekly_replenishment_alerts")
        .select("*, product:products(id, name, sku), warehouse:warehouses(id, name, code, role)")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// =============================================================================
// Mutations
// =============================================================================

export interface AdjustReplenishmentLineInput {
  lineId: string;
  adjustedQty: number;
  reason: string;
}

export function useAdjustReplenishmentLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdjustReplenishmentLineInput) => {
      const { data, error } = await sb().rpc("fn_adjust_replenishment_line", {
        p_line_id: input.lineId,
        p_adjusted_qty: input.adjustedQty,
        p_reason: input.reason,
        p_user_id: (await sb().auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-run"] });
      toast.success("Đã điều chỉnh số lượng");
    },
    onError: (e: Error) => toast.error("Lỗi điều chỉnh", { description: e.message }),
  });
}

export interface ConfirmReplenishmentByDailyInput {
  lineId: string;
  confirmedQty: number;
}

/** Thủ kho kho lẻ confirm số lượng */
export function useConfirmReplenishmentByDaily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmReplenishmentByDailyInput) => {
      const { data, error } = await sb().rpc("fn_confirm_replenishment_by_daily", {
        p_line_id: input.lineId,
        p_confirmed_qty: input.confirmedQty,
        p_user_id: (await sb().auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-run"] });
      toast.success("Đã xác nhận số lượng");
    },
    onError: (e: Error) => toast.error("Lỗi xác nhận", { description: e.message }),
  });
}

export function useSubmitReplenishmentForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await sb()
        .from("weekly_replenishment_runs")
        .update({
          status: "REVIEWED",
          reviewed_by: (await sb().auth.getUser()).data.user?.id,
        })
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-runs"] });
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-run"] });
      toast.success("Đã gửi cho kho lẻ xác nhận");
    },
  });
}

export function useConfirmReplenishmentByDailyRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      // Update run status
      const { error } = await sb()
        .from("weekly_replenishment_runs")
        .update({
          status: "CONFIRMED_BY_DAILY",
          confirmed_by: (await sb().auth.getUser()).data.user?.id,
        })
        .eq("id", runId);
      if (error) throw error;
      // Auto-approve nếu ≤ ngưỡng
      const { data, error: approveErr } = await sb().rpc("fn_auto_approve_if_low_value", {
        p_run_id: runId,
      });
      if (approveErr) throw approveErr;
      return data;  // 'AUTO_APPROVED' | 'REQUIRES_DEPT_HEAD'
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-runs"] });
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-run"] });
      if (result === "AUTO_APPROVED") {
        toast.success(
          `Tự động duyệt (tổng giá trị ≤ ${REPLENISHMENT_APPROVAL_THRESHOLD_VND / 1_000_000}M VNĐ)`
        );
      } else {
        toast.success("Đã gửi lên Trưởng khoa duyệt (vượt ngưỡng giá trị)");
      }
    },
    onError: (e: Error) => toast.error("Lỗi xác nhận", { description: e.message }),
  });
}

export function useApproveReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; approved: boolean; reason?: string }) => {
      const { error } = await sb()
        .from("weekly_replenishment_runs")
        .update({
          status: input.approved ? "APPROVED" : "REJECTED",
          approved_by: input.approved
            ? (await sb().auth.getUser()).data.user?.id
            : null,
          rejected_by: !input.approved
            ? (await sb().auth.getUser()).data.user?.id
            : null,
          rejection_reason: input.reason || null,
        })
        .eq("id", input.runId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-runs"] });
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-run"] });
      toast.success(vars.approved ? "Đã duyệt" : "Đã từ chối");
    },
    onError: (e: Error) => toast.error("Lỗi duyệt", { description: e.message }),
  });
}

export function useCancelReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; reason?: string }) => {
      const { error } = await sb()
        .from("weekly_replenishment_runs")
        .update({
          status: "CANCELLED",
          notes: input.reason || "Cancelled by user",
        })
        .eq("id", input.runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-runs"] });
      toast.success("Đã hủy đề xuất");
    },
  });
}

/** Trigger manual compute (gọi edge function) */
export function useRunWeeklyReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productGroup?: ProductGroup;
      periodDate?: string;
    }) => {
      return await callFunction("compute-weekly-replenishment", {
        body: {
          productGroup: input.productGroup,
          periodDate: input.periodDate,
          triggerSource: "MANUAL",
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-runs"] });
      qc.invalidateQueries({ queryKey: ["weekly-replenishment-alerts"] });
      toast.success("Đã tạo đề xuất. Xem danh sách bên dưới.");
    },
    onError: (e: Error) => toast.error("Lỗi tạo đề xuất", { description: e.message }),
  });
}
