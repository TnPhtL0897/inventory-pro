// =============================================================================
// Khoa XN — Module #4: Monthly Stock Take (Dual Scope) API hooks
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sb, deepMap, deepMapRows } from "@/lib/data-access";
import {
  STOCK_TAKE_APPROVAL_THRESHOLD_VND,
  type StockTakeKhoaXn,
  type StockTakeLineKhoaXn,
  type StockTakeLineStatus,
  type StockTakeDiscrepancyCategory,
  type ProductGroup,
} from "@inventorypro/shared-types";

// =============================================================================
// Queries
// =============================================================================

export interface StockTakeListParams {
  productGroup?: ProductGroup | "";
  periodYear?: number;
  periodMonth?: number;
  status?: string;
  assignedTo?: string;
  limit?: number;
}

export function useStockTakes(params: StockTakeListParams = {}) {
  return useQuery({
    queryKey: ["stocktakes", params],
    queryFn: async () => {
      let q = sb()
        .from("stock_takes")
        .select("*, lines:stock_take_lines(count)")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(params.limit ?? 50);

      if (params.productGroup) q = q.eq("product_group", params.productGroup);
      if (params.periodYear) q = q.eq("period_year", params.periodYear);
      if (params.periodMonth) q = q.eq("period_month", params.periodMonth);
      if (params.status) q = q.eq("status", params.status);
      if (params.assignedTo) q = q.eq("assigned_to", params.assignedTo);

      const { data, error } = await q;
      if (error) throw error;
      return deepMapRows<StockTakeKhoaXn & { lines: { count: number }[] }>(data ?? []);
    },
  });
}

export function useStockTake(id: string | undefined) {
  return useQuery({
    queryKey: ["stocktake", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await sb()
        .from("stock_takes")
        .select(
          `*,
          lines:stock_take_lines(*)
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return deepMap<StockTakeKhoaXn & { lines: StockTakeLineKhoaXn[] }>(data);
    },
    enabled: !!id,
  });
}

/** Đợt kiểm kê được giao cho user hiện tại */
export function useMyAssignedStockTakes() {
  return useQuery({
    queryKey: ["stocktakes", "mine"],
    queryFn: async () => {
      const { data: user } = await sb().auth.getUser();
      if (!user.user?.id) return [];
      const { data, error } = await sb()
        .from("stock_takes")
        .select("*, lines:stock_take_lines(count)")
        .eq("assigned_to", user.user.id)
        .in("status", ["DRAFT", "COUNTED", "PENDING_APPROVAL"])
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return deepMapRows<StockTakeKhoaXn & { lines: { count: number }[] }>(data ?? []);
    },
  });
}

/** Lịch sử kiểm kê đã hoàn thành */
export function useStockTakeHistory(productGroup?: ProductGroup | "", limit = 12) {
  return useQuery({
    queryKey: ["stocktakes", "history", productGroup],
    queryFn: async () => {
      let q = sb()
        .from("stock_takes")
        .select("*, lines:stock_take_lines(count)")
        .in("status", ["POSTED", "CANCELLED"])
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(limit);
      if (productGroup) q = q.eq("product_group", productGroup);
      const { data, error } = await q;
      if (error) throw error;
      return deepMapRows<StockTakeKhoaXn & { lines: { count: number }[] }>(data ?? []);
    },
  });
}

// =============================================================================
// Mutations
// =============================================================================

export interface CreateStockTakeInput {
  productGroup: ProductGroup;
  periodYear?: number;
  periodMonth?: number;
  assignedTo: string;
  warehouseIds?: string[];
  stockTakeDate?: string;
}

/** Tạo mới + snapshot tự động từ lots (idempotent) */
export function useCreateStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStockTakeInput) => {
      const { data, error } = await sb().rpc("fn_create_monthly_stocktake", {
        p_product_group: input.productGroup,
        p_assigned_to: input.assignedTo,
        p_period_year: input.periodYear ?? null,
        p_period_month: input.periodMonth ?? null,
        p_warehouse_ids: input.warehouseIds ?? null,
        p_stock_take_date: input.stockTakeDate ?? null,
        p_tenant_id: (await sb().from("warehouses").select("tenant_id").limit(1).single()).data
          ?.tenant_id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      toast.success("Đã tạo đợt kiểm kê. Snapshot tồn kho tự động.");
    },
    onError: (e: Error) => toast.error("Lỗi tạo kiểm kê", { description: e.message }),
  });
}

export interface CountLineInput {
  lineId: string;
  countedQty: number;
}

/** Thủ kho nhập số đếm cho 1 line */
export function useCountStockTakeLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CountLineInput) => {
      const { data: user } = await sb().auth.getUser();
      const { data, error } = await sb().rpc("fn_count_stocktake_line", {
        p_line_id: input.lineId,
        p_counted_qty: input.countedQty,
        p_user_id: user.user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake"] });
    },
    onError: (e: Error) => toast.error("Lỗi ghi số đếm", { description: e.message }),
  });
}

export interface SetLineReasonInput {
  lineId: string;
  category: StockTakeDiscrepancyCategory;
  reason: string;
}

/** Thủ kho nhập lý do chênh lệch (bắt buộc khi discrepancy != 0) */
export function useSetStockTakeLineReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetLineReasonInput) => {
      const { data: user } = await sb().auth.getUser();
      const { error } = await sb().rpc("fn_set_stocktake_line_reason", {
        p_line_id: input.lineId,
        p_category: input.category,
        p_reason: input.reason,
        p_user_id: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      toast.success("Đã lưu lý do chênh lệch");
    },
    onError: (e: Error) =>
      toast.error("Lỗi lưu lý do", { description: e.message }),
  });
}

/** Trưởng khoa duyệt 1 line */
export function useApproveStockTakeLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lineId: string) => {
      const { data: user } = await sb().auth.getUser();
      const { data, error } = await sb().rpc("fn_approve_stocktake_line", {
        p_line_id: lineId,
        p_user_id: user.user?.id,
      });
      if (error) throw error;
      return data as string | null; // StockMovement ID
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      toast.success("Đã duyệt. Đã cập nhật tồn kho.");
    },
    onError: (e: Error) => toast.error("Lỗi duyệt", { description: e.message }),
  });
}

/** Trưởng khoa duyệt tất cả line (loop) */
export function useApproveAllStockTakeLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stockTakeId: string) => {
      const { data: user } = await sb().auth.getUser();
      // Lấy tất cả line chưa approve
      const { data: lines, error: lErr } = await sb()
        .from("stock_take_lines")
        .select("id, line_status")
        .eq("stock_take_id", stockTakeId)
        .in("line_status", ["PENDING", "COUNTED", "DISCREPANCY"]);
      if (lErr) throw lErr;
      if (!lines || lines.length === 0) {
        throw new Error("Không có line nào để duyệt");
      }
      const results: string[] = [];
      for (const line of lines) {
        const { data, error } = await sb().rpc("fn_approve_stocktake_line", {
          p_line_id: line.id,
          p_user_id: user.user?.id,
        });
        if (error) throw error;
        if (data) results.push(data as string);
      }
      return results;
    },
    onSuccess: (movements) => {
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      toast.success(`Đã duyệt tất cả. Tạo ${movements.length} StockMovement.`);
    },
    onError: (e: Error) => toast.error("Lỗi duyệt tất cả", { description: e.message }),
  });
}

export interface RejectStockTakeInput {
  stockTakeId: string;
  reason: string;
}

/** Trưởng khoa từ chối (yêu cầu kiểm lại) */
export function useRejectStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RejectStockTakeInput) => {
      const { error } = await sb()
        .from("stock_takes")
        .update({
          status: "CANCELLED",
          cancel_reason: `[REJECTED] ${input.reason}`,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", input.stockTakeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      toast.success("Đã yêu cầu kiểm lại");
    },
    onError: (e: Error) => toast.error("Lỗi từ chối", { description: e.message }),
  });
}

/** Hủy đợt kiểm kê */
export function useCancelStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { stockTakeId: string; reason?: string }) => {
      const { error } = await sb()
        .from("stock_takes")
        .update({
          status: "CANCELLED",
          cancel_reason: input.reason ?? "Hủy bởi thủ kho",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", input.stockTakeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      toast.success("Đã hủy đợt kiểm kê");
    },
    onError: (e: Error) => toast.error("Lỗi hủy", { description: e.message }),
  });
}

/** Submit cho Trưởng khoa duyệt (DRAFT/COUNTED → PENDING_APPROVAL) */
export function useSubmitStockTakeForApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stockTakeId: string) => {
      // Validate: tất cả line phải có line_status != PENDING
      const { data: pending, error: pErr } = await sb()
        .from("stock_take_lines")
        .select("id, line_status")
        .eq("stock_take_id", stockTakeId)
        .eq("line_status", "PENDING");
      if (pErr) throw pErr;
      if (pending && pending.length > 0) {
        throw new Error(
          `Còn ${pending.length} lô chưa đếm. Vui lòng đếm hết trước khi gửi duyệt.`
        );
      }
      // Validate: tất cả line có discrepancy != 0 phải có lý do
      const { data: noReason, error: rErr } = await sb()
        .from("stock_take_lines")
        .select("id, line_status")
        .eq("stock_take_id", stockTakeId)
        .eq("line_status", "DISCREPANCY")
        .is("discrepancy_reason", null);
      if (rErr) throw rErr;
      if (noReason && noReason.length > 0) {
        throw new Error(
          `Còn ${noReason.length} lô có chênh lệch chưa nhập lý do. Bắt buộc.`
        );
      }
      // Update
      const { error } = await sb()
        .from("stock_takes")
        .update({ status: "POSTED" })
        .eq("id", stockTakeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      qc.invalidateQueries({ queryKey: ["stocktake"] });
      toast.success("Đã gửi cho Trưởng khoa duyệt");
    },
    onError: (e: Error) => toast.error("Không thể gửi duyệt", { description: e.message }),
  });
}

export { STOCK_TAKE_APPROVAL_THRESHOLD_VND };
