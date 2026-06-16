// =============================================================================
// Bid Tracking feature - Full Workflow + Cảnh báo
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { callActionNoId, listTable } from "@/lib/data-access";

export type BidAlertLevel = "INFO" | "WARNING" | "CRITICAL" | "EXPIRED";

export interface BidContractDashboard {
  totalContracts: number;
  activeContracts: number;
  expiring30Days: number;
  expiring60Days: number;
  expiring90Days: number;
  totalContractValue: number;
  totalUsedValue: number;
  totalRemainingValue: number;
  avgUsagePercent: number;
}

export interface BidContractExpiring {
  contractId: string;
  contractNumber: string;
  supplierName: string;
  endDate: string;
  daysUntilExpiry: number;
  alertLevel: BidAlertLevel;
  totalContractValue: number;
  usedValue: number;
  remainingValue: number;
  usagePercent: number;
  message: string;
}

// Dashboard tổng quan HĐ
export function useBidContractDashboard() {
  return useQuery({
    queryKey: ["bid-tracking-dashboard"],
    queryFn: () =>
      callActionNoId<BidContractDashboard>(
        "bid-tracking-dashboard",
        "dashboard",
        {}
      ),
    staleTime: 5 * 60_000,
  });
}

// HĐ sắp hết hạn
export function useBidContractExpiring() {
  return useQuery({
    queryKey: ["bid-contract-expiring"],
    queryFn: () =>
      callActionNoId<BidContractExpiring[]>(
        "bid-tracking-dashboard",
        "expiring",
        {}
      ),
    staleTime: 5 * 60_000,
  });
}

export const BID_ALERT_COLORS: Record<BidAlertLevel, string> = {
  INFO: "bg-blue-100 text-blue-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  CRITICAL: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-800 text-white",
};

export const BID_ALERT_LABELS: Record<BidAlertLevel, string> = {
  INFO: "90 ngày",
  WARNING: "60 ngày",
  CRITICAL: "30 ngày",
  EXPIRED: "Quá hạn",
};

export function formatVND(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}
