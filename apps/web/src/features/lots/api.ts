// =============================================================================
// Khoa XN — Lots feature: API hooks (queries + mutations)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sb, deepMap, deepMapRows } from "@/lib/data-access";
import type {
  Lot,
  LotStatus,
  LotQCRecord,
  LotQCType,
  LotQCResult,
  OpenVialHistory,
  RecallNotice,
  RecallSeverity,
  RecallActionType,
  DisposalRequest,
  DisposalStatus,
  LotAlert,
  LotAlertLevel,
  ProductGroup,
} from "@inventorypro/shared-types";

// =============================================================================
// Queries
// =============================================================================

export interface LotListParams {
  productGroup?: ProductGroup | "";
  status?: LotStatus | "";
  warehouseId?: string;
  expiringWithin?: number; // days
  search?: string;
  limit?: number;
  offset?: number;
}

export function useLots(params: LotListParams = {}) {
  return useQuery({
    queryKey: ["lots", params],
    queryFn: async () => {
      let q = sb()
        .from("lots")
        .select(
          "*, product:products(id, sku, name, product_group, open_vial_stability_days, unit_of_measure:base_unit_id(code)), warehouse:warehouses(id, name, code, role)"
        )
        .order("expiration_date", { ascending: true });

      if (params.status) q = q.eq("status", params.status);
      if (params.warehouseId) q = q.eq("warehouse_id", params.warehouseId);
      if (params.search) q = q.ilike("lot_number", `%${params.search}%`);
      if (params.limit) {
        q = q.range(params.offset ?? 0, (params.offset ?? 0) + params.limit - 1);
      }

      const { data, error } = await q;
      if (error) throw error;

      // Filter theo product_group client-side (RLS đã filter, nhưng để chắc)
      let items = deepMapRows<Lot & { product: any; warehouse: any }>(data ?? []);
      if (params.productGroup) {
        items = items.filter((l: any) => l.product?.productGroup === params.productGroup);
      }
      if (params.expiringWithin !== undefined) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + params.expiringWithin);
        items = items.filter(
          (l: any) => new Date(l.expirationDate) <= cutoff && l.status !== "EXPIRED" && l.status !== "DESTROYED"
        );
      }

      return items;
    },
  });
}

export function useLot(id: string | undefined) {
  return useQuery({
    queryKey: ["lots", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await sb()
        .from("lots")
        .select(
          "*, product:products(id, sku, name, product_group, open_vial_stability_days), warehouse:warehouses(id, name, code, role)"
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return deepMap<Lot & { product: any; warehouse: any }>(data);
    },
    enabled: !!id,
  });
}

/** Lots sắp hết hạn (dùng cho dashboard) */
export function useExpiringLots(days: number = 30) {
  return useLots({ expiringWithin: days, limit: 50 });
}

/** Lots chờ QC duyệt (HC-SP) */
export function usePendingQCLots() {
  return useLots({ status: "PENDING_QC", limit: 50 });
}

/** Lots đã mở nắp (IN_USE + có open_vial_expiration_date) */
export function useOpenVialLots() {
  return useQuery({
    queryKey: ["lots", "open-vial"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("lots")
        .select("*, product:products(id, sku, name, product_group)")
        .eq("status", "IN_USE")
        .not("open_vial_expiration_date", "is", null)
        .order("open_vial_expiration_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return deepMapRows<Lot & { product: any }>(data ?? []);
    },
  });
}

/** Lots bị recall (BLOCKED + có recall_notice_id) */
export function useRecalledLots() {
  return useQuery({
    queryKey: ["lots", "recalled"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("lots")
        .select("*, product:products(id, sku, name), recall_notice:recall_notices(*)")
        .eq("status", "BLOCKED")
        .not("recall_notice_id", "is", null)
        .order("recall_blocked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return deepMapRows<Lot & { product: any; recallNotice: any }>(data ?? []);
    },
  });
}

/** Lot alerts (cảnh báo chưa resolve) */
export function useLotAlerts(params: { level?: LotAlertLevel; limit?: number } = {}) {
  return useQuery({
    queryKey: ["lots", "alerts", params],
    queryFn: async () => {
      let q = sb()
        .from("lot_alerts")
        .select("*, lot:lots(id, lot_number, status, product:products(id, name, product_group))")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 50);
      if (params.level) q = q.eq("alert_level", params.level);
      const { data, error } = await q;
      if (error) throw error;
      return deepMapRows<LotAlert & { lot: any }>(data ?? []);
    },
  });
}

/** Lịch sử QC của 1 lot */
export function useLotQCHistory(lotId: string | undefined) {
  return useQuery({
    queryKey: ["lots", lotId, "qc-history"],
    queryFn: async () => {
      if (!lotId) return [];
      const { data, error } = await sb()
        .from("lot_qc_records")
        .select("*, qc_officer:qc_officer_id(id, full_name, email)")
        .eq("lot_id", lotId)
        .order("qc_date", { ascending: false });
      if (error) throw error;
      return deepMapRows<LotQCRecord & { qcOfficer: any }>(data ?? []);
    },
    enabled: !!lotId,
  });
}

/** Lịch sử mở nắp của 1 lot */
export function useOpenVialHistory(lotId: string | undefined) {
  return useQuery({
    queryKey: ["lots", lotId, "open-vial-history"],
    queryFn: async () => {
      if (!lotId) return [];
      const { data, error } = await sb()
        .from("open_vial_history")
        .select("*, opened_by_user:opened_by(id, full_name)")
        .eq("lot_id", lotId)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return deepMapRows<OpenVialHistory & { openedByUser: any }>(data ?? []);
    },
    enabled: !!lotId,
  });
}

// =============================================================================
// Mutations
// =============================================================================

export interface CreateLotInput {
  productId: string;
  warehouseId: string;
  lotNumber: string;
  expirationDate: string;
  quantity: number;
  manufacturerDate?: string;
  packageVolume?: number;
  storageCondition?: string;
  qcRequired?: boolean;
  certificateOfAnalysisUrl?: string;
  notes?: string;
}

export function useCreateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLotInput) => {
      // qc_required auto: HC-SP = true, VTYT = false
      // Lấy từ product.product_group
      const { data: product, error: pErr } = await sb()
        .from("products")
        .select("product_group")
        .eq("id", input.productId)
        .single();
      if (pErr) throw pErr;
      const isHCSP = (product as any)?.product_group === "HOA_CHAT_SINH_PHAM";

      const insertData = {
        product_id: input.productId,
        warehouse_id: input.warehouseId,
        lot_number: input.lotNumber,
        expiration_date: input.expirationDate,
        quantity: input.quantity,
        manufacturer_date: input.manufacturerDate || null,
        package_volume: input.packageVolume || null,
        storage_condition: input.storageCondition || null,
        qc_required: input.qcRequired ?? isHCSP,
        qc_required_at: isHCSP ? new Date().toISOString() : null,
        status: isHCSP ? "PENDING_QC" : "APPROVED", // VTYT auto-approve
        certificate_of_analysis_url: input.certificateOfAnalysisUrl || null,
        notes: input.notes || null,
        created_by: (await sb().auth.getUser()).data.user?.id,
      };

      const { data, error } = await sb()
        .from("lots")
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return deepMap<Lot>(data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      if (data.status === "PENDING_QC") {
        qc.invalidateQueries({ queryKey: ["lots", "pending-qc"] });
      }
      toast.success(
        data.status === "PENDING_QC"
          ? "Đã tạo lô - chờ QC duyệt"
          : "Đã tạo lô (VTYT auto-approve)"
      );
    },
    onError: (e: Error) => toast.error("Lỗi tạo lô", { description: e.message }),
  });
}

export interface CompleteQCInput {
  lotId: string;
  qcType: LotQCType;
  qcMethod: string;
  qcResult: LotQCResult;
  qcNotes?: string;
  validUntil?: string; // cho OPEN_VIAL_RETEST
  controlNormalLotId?: string;
  controlPathologicalLotId?: string;
  attachments?: any[];
}

export function useCompleteQC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteQCInput) => {
      const { data, error } = await sb().rpc("fn_complete_lot_qc", {
        p_lot_id: input.lotId,
        p_qc_type: input.qcType,
        p_qc_method: input.qcMethod,
        p_qc_result: input.qcResult,
        p_qc_notes: input.qcNotes || null,
        p_valid_until: input.validUntil || null,
        p_control_normal_lot_id: input.controlNormalLotId || null,
        p_control_pathological_lot_id: input.controlPathologicalLotId || null,
        p_attachments: input.attachments ?? [],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["lots", vars.lotId, "qc-history"] });
      qc.invalidateQueries({ queryKey: ["lots", "pending-qc"] });
      toast.success(vars.qcResult === "PASS" ? "QC PASS - Lô đã được duyệt" : "QC FAIL - Lô bị khóa");
    },
    onError: (e: Error) => toast.error("Lỗi QC", { description: e.message }),
  });
}

export interface RecordOpenVialInput {
  lotId: string;
  openedAt?: string;
  quantityTaken: number;
  notes?: string;
}

export function useRecordOpenVial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordOpenVialInput) => {
      // Lấy thông tin lot + product để tính toán
      const { data: lot, error: lErr } = await sb()
        .from("lots")
        .select("quantity, product:products(open_vial_stability_days)")
        .eq("id", input.lotId)
        .single();
      if (lErr) throw lErr;

      const lotData: any = lot;
      const productStability = lotData.product?.open_vial_stability_days;
      if (!productStability) {
        throw new Error(
          "Sản phẩm chưa cấu hình open_vial_stability_days. Vui lòng cấu hình trước."
        );
      }

      const currentRemaining = lotData.open_vial_quantity_remaining ?? lotData.quantity;
      const quantityAfter = currentRemaining - input.quantityTaken;
      if (quantityAfter < 0) {
        throw new Error("Lượng lấy vượt quá lượng còn lại");
      }

      const openedAt = input.openedAt ? new Date(input.openedAt) : new Date();
      const expDate = new Date(openedAt);
      expDate.setDate(expDate.getDate() + productStability);

      const { data, error } = await sb()
        .from("open_vial_history")
        .insert({
          lot_id: input.lotId,
          opened_at: openedAt.toISOString(),
          opened_by: (await sb().auth.getUser()).data.user?.id,
          quantity_before: currentRemaining,
          quantity_taken: input.quantityTaken,
          quantity_after: quantityAfter,
          open_vial_stability_days: productStability,
          open_vial_expiration_date: expDate.toISOString().split("T")[0],
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return deepMap<OpenVialHistory>(data);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["lots", vars.lotId, "open-vial-history"] });
      qc.invalidateQueries({ queryKey: ["lots", "open-vial"] });
      toast.success("Đã ghi nhận mở nắp - in nhãn sẽ tự động xử lý");
    },
    onError: (e: Error) => toast.error("Lỗi mở nắp", { description: e.message }),
  });
}

export interface CreateRecallInput {
  recallNumber: string;
  supplierName: string;
  reason: string;
  severity: RecallSeverity;
  recallDate: string;
  affectedLotNumbers: string[];
  productNames?: string[];
  actionTakenBySupplier?: string;
}

export function useCreateRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRecallInput) => {
      const { data, error } = await sb()
        .from("recall_notices")
        .insert({
          recall_number: input.recallNumber,
          supplier_name: input.supplierName,
          reason: input.reason,
          severity: input.severity,
          recall_date: input.recallDate,
          affected_lot_numbers: input.affectedLotNumbers,
          product_names: input.productNames ?? [],
          action_taken_by_supplier: input.actionTakenBySupplier || null,
          status: "ACTIVE",
          created_by: (await sb().auth.getUser()).data.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return deepMap<RecallNotice>(data);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["lots", "recalled"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["lots", "alerts"] });
      toast.success(
        `Đã tạo recall ${data.recall_number} - hệ thống tự động BLOCK ${data.affected_lot_numbers.length} lô`
      );
    },
    onError: (e: Error) => toast.error("Lỗi tạo recall", { description: e.message }),
  });
}

export interface ProcessRecallLotInput {
  recallNoticeId: string;
  lotId: string;
  stillInStock: boolean;
  alreadyUsed: boolean;
  usageNotes?: string;
  action: RecallActionType;
  actionNotes?: string;
}

export function useProcessRecallLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProcessRecallLotInput) => {
      const { data, error } = await sb()
        .from("recall_lot_actions")
        .insert({
          recall_notice_id: input.recallNoticeId,
          lot_id: input.lotId,
          still_in_stock: input.stillInStock,
          already_used: input.alreadyUsed,
          usage_notes: input.usageNotes || null,
          action: input.action,
          action_notes: input.actionNotes || null,
          processed_by: (await sb().auth.getUser()).data.user?.id,
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots", "recalled"] });
      toast.success("Đã ghi nhận xử lý lô recall");
    },
    onError: (e: Error) => toast.error("Lỗi xử lý", { description: e.message }),
  });
}

export interface CreateDisposalRequestInput {
  reason: string;
  lines: {
    lotId: string;
    quantity: number;
    reason?: string;
  }[];
  notes?: string;
}

export function useCreateDisposalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDisposalRequestInput) => {
      // Tạo request header
      const requestNumber = `DR-MAN-${Date.now()}`;
      const { data: dr, error: drErr } = await sb()
        .from("disposal_requests")
        .insert({
          request_number: requestNumber,
          reason: input.reason,
          status: "PENDING" as DisposalStatus,
          auto_generated: false,
          notes: input.notes || null,
          created_by: (await sb().auth.getUser()).data.user?.id,
        })
        .select()
        .single();
      if (drErr) throw drErr;
      const drData = dr as any;

      // Tạo lines
      const lines = input.lines.map((line) => ({
        disposal_request_id: drData.id,
        lot_id: line.lotId,
        // product_id lookup omitted for brevity - can be done via join
        product_id: line.lotId, // FIXME: lookup thực tế từ lots table
        quantity: line.quantity,
        reason: line.reason || null,
      }));
      const { error: lErr } = await sb().from("disposal_request_lines").insert(lines);
      if (lErr) throw lErr;

      return deepMap<DisposalRequest>(dr);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["disposal"] });
      toast.success("Đã tạo phiếu đề nghị xuất hủy");
    },
    onError: (e: Error) => toast.error("Lỗi tạo phiếu hủy", { description: e.message }),
  });
}

export function useApproveDisposalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      disposalRequestId: string;
      approved: boolean;
      reason?: string;
    }) => {
      const status = input.approved ? "APPROVED" : "CANCELLED";
      const { data, error } = await sb()
        .from("disposal_requests")
        .update({
          status: status as DisposalStatus,
          approved_by: input.approved
            ? (await sb().auth.getUser()).data.user?.id
            : null,
          rejected_by: !input.approved
            ? (await sb().auth.getUser()).data.user?.id
            : null,
          rejection_reason: input.reason || null,
        })
        .eq("id", input.disposalRequestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["disposal"] });
      toast.success(vars.approved ? "Đã duyệt phiếu hủy" : "Đã từ chối");
    },
    onError: (e: Error) => toast.error("Lỗi duyệt", { description: e.message }),
  });
}

/** Resolve lot alert */
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await sb()
        .from("lot_alerts")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: (await sb().auth.getUser()).data.user?.id,
        })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots", "alerts"] });
      toast.success("Đã đánh dấu cảnh báo đã xử lý");
    },
  });
}
