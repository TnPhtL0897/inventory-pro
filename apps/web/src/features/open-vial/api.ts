// =============================================================================
// Open-Vial feature - Tracking HC-SP sau khi mở nắp
// =============================================================================
// - Open/Update volume: Edge Function "open-vial-action"
// - QC retest: Edge Function "open-vial-qc"
// - Status: SQL function fn_get_open_vial_status (gọi qua Edge Function wrapper)
// - Expiring list: SQL function fn_list_open_vial_expiring
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { callActionNoId, listTable } from "@/lib/data-access";

export type OpenVialAction = "open" | "update-volume";
export type QcResult = "PASS" | "FAIL" | "PENDING";
export type AlertLevel = "INFO" | "WARNING" | "CRITICAL";

export interface OpenVialActionInput {
  action: OpenVialAction;
  lotId: string;
  quantityTaken: number;
  quantityRemaining?: number;
  notes?: string;
}

export interface OpenVialActionResponse {
  success: boolean;
  action: OpenVialAction;
  historyId?: string;
  openVialExpirationDate?: string;
  printQueueId?: string;
  newRemaining?: number;
  message: string;
}

export interface OpenVialQcRetestInput {
  lotId: string;
  qcMethod: string;
  qcResult: QcResult;
  qcNotes: string;
  validUntil?: string;
  controlNormalLotId?: string;
  controlPathologicalLotId?: string;
  attachments?: unknown[];
}

export interface OpenVialQcRetestResponse {
  success: boolean;
  qcRecordId: string;
  message: string;
}

export interface OpenVialStatus {
  isOpen: boolean;
  openedAt: string | null;
  openedByUser: string | null;
  openVialExpirationDate: string | null;
  daysUntilExpiry: number | null;
  volumeRemaining: number | null;
  needsQcRetest: boolean;
  qcRetestReason: string | null;
  lastQcRetestAt: string | null;
  lastQcRetestResult: string | null;
  qcRetestValidUntil: string | null;
  openVialCount: number;
}

export interface OpenVialExpiringItem {
  lotId: string;
  lotNumber: string;
  productName: string;
  productSku: string;
  openVialExpirationDate: string;
  daysUntilExpiry: number;
  alertLevel: AlertLevel;
  message: string;
}

// =============================================================================
// Hooks: Open / Update volume
// =============================================================================

export function useOpenVial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenVialActionInput) =>
      callActionNoId<OpenVialActionResponse>("open-vial-action", input.action, {
        action: input.action,
        lotId: input.lotId,
        quantityTaken: input.quantityTaken,
        quantityRemaining: input.quantityRemaining,
        notes: input.notes,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["open-vial"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast.success(data.message);
    },
    onError: (e: Error) =>
      toast.error("Lỗi mở nắp", { description: e.message }),
  });
}

// =============================================================================
// Hooks: QC retest
// =============================================================================

export function useOpenVialQcRetest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenVialQcRetestInput) =>
      callActionNoId<OpenVialQcRetestResponse>("open-vial-qc", "qc-retest", {
        lotId: input.lotId,
        qcMethod: input.qcMethod,
        qcResult: input.qcResult,
        qcNotes: input.qcNotes,
        validUntil: input.validUntil,
        controlNormalLotId: input.controlNormalLotId,
        controlPathologicalLotId: input.controlPathologicalLotId,
        attachments: input.attachments,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["open-vial"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      toast.success(data.message);
    },
    onError: (e: Error) =>
      toast.error("Lỗi QC lại", { description: e.message }),
  });
}

// =============================================================================
// Hooks: Open-vial status
// =============================================================================

export function useOpenVialStatus(lotId: string | null) {
  return useQuery({
    queryKey: ["open-vial-status", lotId],
    queryFn: () =>
      callActionNoId<OpenVialStatus>("open-vial-action", "status", {
        lotId,
      }),
    enabled: !!lotId,
    staleTime: 30_000,
  });
}

// =============================================================================
// Hooks: List expiring open-vials
// =============================================================================

export function useOpenVialExpiring() {
  return useQuery({
    queryKey: ["open-vial-expiring"],
    queryFn: () =>
      callActionNoId<OpenVialExpiringItem[]>("open-vial-action", "expiring", {}),
    staleTime: 5 * 60_000,
  });
}

// =============================================================================
// Hooks: List all open-vial lots (PostgREST)
// =============================================================================

export function useOpenVialLots(params: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["open-vial-lots", params],
    queryFn: () =>
      listTable("lots", {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 50,
        orderBy: "open_vial_expiration_date",
        orderDesc: false,
        filters: {
          status: "IN_USE",
        },
      }),
  });
}

// =============================================================================
// Helpers
// =============================================================================

export const ALERT_LEVEL_COLORS: Record<AlertLevel, string> = {
  INFO: "bg-blue-100 text-blue-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  INFO: "Thông tin",
  WARNING: "Cảnh báo",
  CRITICAL: "Nghiêm trọng",
};
