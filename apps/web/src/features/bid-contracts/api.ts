// =============================================================================
// Bid Contracts feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export type BidContractStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED" | "COMPLETED";

export interface BidContractLookup {
  id: string;
  contractNo: string;
  contractName?: string;
  bidLotId: string;
  lotNo?: string;
  lotName?: string;
  winningPartyId: string;
  winningPartyName: string;
  winningPartyCode: string;
  contractValue: number;
  usedValue: number;
  remainingValue: number;
  contractStartDate: string;
  contractEndDate: string;
  daysToExpiry: number;
  status: BidContractStatus;
}

export interface BidContract {
  id: string;
  contractNo: string;
  contractName?: string;
  bidLotId: string;
  lotNo?: string;
  lotName?: string;
  winningPartyId: string;
  winningPartyName?: string;
  winningPartyCode?: string;
  contractValue: number;
  contractStartDate: string;
  contractEndDate: string;
  usedValue: number;
  remainingValue: number;
  daysToExpiry: number;
  bidContractStatus: BidContractStatus;
  paymentTerms?: number;
  advancePaymentPct?: number;
  retentionPct?: number;
  warrantyMonths?: number;
  signingDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidContractListParams {
  page?: number;
  pageSize?: number;
  bidLotId?: string;
  winningPartyId?: string;
  status?: BidContractStatus;
  expiringSoon?: boolean;
}

function buildQuery(p: BidContractListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Hook lấy danh sách HĐ ACTIVE để chọn khi tạo PO */
export function useActiveBidContractsLookup() {
  return useQuery({
    queryKey: ["bid-contracts", "active-lookup"],
    queryFn: () => api.get<BidContractLookup[]>("/api/v1/bid-contracts/active-lookup"),
    staleTime: 60_000,
  });
}

export function useBidContracts(params: BidContractListParams = {}) {
  return useQuery({
    queryKey: ["bid-contracts", params],
    queryFn: () => api.get<{ items: BidContract[]; total: number; page: number; pageSize: number; hasMore: boolean }>(`/api/v1/bid-contracts${buildQuery(params)}`),
  });
}

export function useBidContract(id: string | undefined) {
  return useQuery({
    queryKey: ["bid-contracts", id],
    queryFn: () => api.get<BidContract>(`/api/v1/bid-contracts/${id}`),
    enabled: !!id,
  });
}
