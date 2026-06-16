// =============================================================================
// FEFO feature - First-Expire-First-Out Enforcement (Khoa XN Module 2)
// =============================================================================
// - Auto-pick: Edge Function "fefo-pick" (POST)
// - Override: Edge Function "fefo-override" (POST)
// - Compliance report: Edge Function "fefo-pick" with action "compliance"
// - Audit log: PostgREST (table fefo_audit_log)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { callActionNoId, listTable } from "@/lib/data-access";

// =============================================================================
// Types
// =============================================================================

export type FefoOverrideReason =
  | "FEFO_INSUFFICIENT"
  | "FEFO_EXPIRED_SOON"
  | "FEFO_RECALLED"
  | "EMERGENCY"
  | "NO_OTHER_LOT"
  | "OTHER";

export type FefoAuditLevel = "INFO" | "WARNING" | "CRITICAL";

export interface FefoPickLine {
  lotId: string;
  lotNumber: string;
  expirationDate: string;
  openVialExpirationDate: string | null;
  isOpenVial: boolean;
  pickQuantity: number;
  pickOrder: number;
  pickReason: string;
}

export interface FefoPickResponse {
  picks: FefoPickLine[];
  totalRequested: number;
  totalPicked: number;
  shortage: number;
  isSufficient: boolean;
  warnings: string[];
}

export interface FefoPickRequest {
  productId: string;
  warehouseId: string;
  quantity: number;
  documentType?: string;
  documentId?: string;
  documentNumber?: string;
}

export interface FefoOverrideRequest {
  productId: string;
  warehouseId: string;
  requestedQuantity: number;
  actualLotId: string;
  overrideReason: FefoOverrideReason;
  overrideDescription: string;
  documentType?: string;
  documentId?: string;
  documentNumber?: string;
}

export interface FefoOverrideResponse {
  success: boolean;
  auditId: string;
  auditLevel: FefoAuditLevel;
  message: string;
}

export interface FefoAuditLog {
  id: string;
  documentType: string | null;
  documentNumber: string | null;
  productId: string;
  warehouseId: string;
  requestedQuantity: number;
  fefoFirstLotId: string | null;
  fefoFirstLotExpiration: string | null;
  actualLotId: string;
  actualLotNumber: string;
  actualLotExpiration: string;
  actualLotStatus: string;
  isFefoCompliant: boolean;
  isExpiredUsed: boolean;
  overrideReason: string | null;
  overrideDescription: string | null;
  auditLevel: FefoAuditLevel;
  userEmail?: string;
  createdAt: string;
}

export interface FefoComplianceReport {
  totalPicks: number;
  compliantPicks: number;
  overridePicks: number;
  expiredPicks: number;
  complianceRate: number;
  overrideRate: number;
  topOverriddenProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    overrideCount: number;
  }> | null;
  topOverrideUsers: Array<{
    userId: string;
    email: string | null;
    overrideCount: number;
  }> | null;
  topOverrideReasons: Array<{
    overrideReason: string;
    reasonCount: number;
  }> | null;
}

// =============================================================================
// Hooks: Auto-pick
// =============================================================================

export function useFefoPick() {
  return useMutation({
    mutationFn: (input: FefoPickRequest) =>
      callActionNoId<FefoPickResponse>("fefo-pick", "pick", {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
      }),
  });
}

// =============================================================================
// Hooks: Override
// =============================================================================

export function useFefoOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FefoOverrideRequest) =>
      callActionNoId<FefoOverrideResponse>("fefo-override", "override", {
        productId: input.productId,
        warehouseId: input.warehouseId,
        requestedQuantity: input.requestedQuantity,
        actualLotId: input.actualLotId,
        overrideReason: input.overrideReason,
        overrideDescription: input.overrideDescription,
        documentType: input.documentType,
        documentId: input.documentId,
        documentNumber: input.documentNumber,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["fefo-audit-log"] });
      if (data.auditLevel === "CRITICAL") {
        toast.error(data.message, {
          description: "DEPT_HEAD sẽ nhận cảnh báo NGAY",
        });
      } else {
        toast.warning(data.message);
      }
    },
    onError: (e: Error) =>
      toast.error("Lỗi ghi FEFO override", { description: e.message }),
  });
}

// =============================================================================
// Hooks: Compliance report
// =============================================================================

export interface FefoComplianceParams {
  year: number;
  month: number;
}

export function useFefoComplianceReport(params: FefoComplianceParams) {
  return useQuery({
    queryKey: ["fefo-compliance", params.year, params.month],
    queryFn: () =>
      callActionNoId<FefoComplianceReport>("fefo-pick", "compliance", {
        year: params.year,
        month: params.month,
      }),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

// =============================================================================
// Hooks: Audit log list
// =============================================================================

export interface ListFefoAuditParams {
  page?: number;
  pageSize?: number;
  productId?: string;
  auditLevel?: FefoAuditLevel;
  isFefoCompliant?: boolean;
}

export function useFefoAuditLog(params: ListFefoAuditParams = {}) {
  return useQuery({
    queryKey: ["fefo-audit-log", params],
    queryFn: () =>
      listTable<FefoAuditLog>("fefo_audit_log", {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 50,
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          ...(params.productId ? { product_id: params.productId } : {}),
          ...(params.auditLevel ? { audit_level: params.auditLevel } : {}),
          ...(params.isFefoCompliant !== undefined
            ? { is_fefo_compliant: params.isFefoCompliant }
            : {}),
        },
      }),
  });
}

// =============================================================================
// Helpers
// =============================================================================

export const FEFO_OVERRIDE_REASON_LABELS: Record<FefoOverrideReason, string> = {
  FEFO_INSUFFICIENT: "Lô FEFO không đủ số lượng",
  FEFO_EXPIRED_SOON: "Lô FEFO sắp hết hạn, chờ nhập lô mới",
  FEFO_RECALLED: "Lô FEFO bị recall, không dùng được",
  EMERGENCY: "Cấp cứu",
  NO_OTHER_LOT: "Hết lô khác",
  OTHER: "Khác (mô tả chi tiết)",
};

export const FEFO_AUDIT_LEVEL_COLORS: Record<FefoAuditLevel, string> = {
  INFO: "bg-green-100 text-green-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const FEFO_AUDIT_LEVEL_LABELS: Record<FefoAuditLevel, string> = {
  INFO: "Tuân thủ",
  WARNING: "Override",
  CRITICAL: "Dùng lô hết hạn",
};
