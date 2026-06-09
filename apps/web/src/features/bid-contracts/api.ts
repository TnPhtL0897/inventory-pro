// =============================================================================
// Bid Contracts feature - Supabase PostgREST + Edge Function version
// =============================================================================
// Reads: PostgREST (table bid_contracts)
// Terminate workflow: Edge Function "bid-contracts" /{id}/terminate
// (Note: original API had /active-lookup denormalized endpoint. Here we just
//  filter bid_contracts where status=ACTIVE and compute daysToExpiry + remaining
//  client-side.)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  getById,
  callActionPascal,
  type PaginatedResult,
} from "@/lib/data-access";

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
  remainingValue: number;        // computed client-side
  contractStartDate: string;
  contractEndDate: string;
  daysToExpiry: number;          // computed client-side
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

function enrich(c: any): BidContract {
  const start = new Date(c.contractStartDate ?? c.contract_start_date);
  const end = new Date(c.contractEndDate ?? c.contract_end_date);
  const today = new Date();
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const value = Number(c.contractValue ?? c.contract_value ?? 0);
  const used = Number(c.usedValue ?? c.used_value ?? 0);
  return {
    ...c,
    contractValue: value,
    usedValue: used,
    remainingValue: Math.max(0, value - used),
    daysToExpiry: days,
  };
}

/** Hook lấy danh sách HĐ ACTIVE để chọn khi tạo PO */
export function useActiveBidContractsLookup() {
  return useQuery({
    queryKey: ["bid-contracts", "active-lookup"],
    queryFn: async () => {
      const res = await listTable<any>("bid_contracts", {
        pageSize: 200,
        orderBy: "contract_end_date",
        filters: { bid_contract_status: "ACTIVE" },
      });
      return res.items.map(enrich) as unknown as BidContractLookup[];
    },
    staleTime: 60_000,
  });
}

export function useBidContracts(params: BidContractListParams = {}) {
  return useQuery({
    queryKey: ["bid-contracts", params],
    queryFn: async () => {
      const res = await listTable<any>("bid_contracts", {
        page: params.page,
        pageSize: params.pageSize,
        orderBy: "created_at",
        orderDesc: true,
        filters: {
          bid_lot_id: params.bidLotId,
          winning_party_id: params.winningPartyId,
          bid_contract_status: params.status,
        },
      });
      let items = res.items.map(enrich);
      if (params.expiringSoon) {
        items = items.filter((c) => c.daysToExpiry >= 0 && c.daysToExpiry <= 30);
      }
      return { ...res, items };
    },
  });
}

export function useBidContract(id: string | undefined) {
  return useQuery({
    queryKey: ["bid-contracts", id],
    queryFn: async () => {
      const c = await getById<any>("bid_contracts", id!);
      return c ? enrich(c) : null;
    },
    enabled: !!id,
  });
}

export function useTerminateBidContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      callActionPascal<{ ok: true; id: string; status: string }>("bid-contracts", id, "terminate", { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bid-contracts"] });
      toast.success("Đã chấm dứt hợp đồng thầu");
    },
    onError: (e: Error) => toast.error("Lỗi chấm dứt HĐ", { description: e.message }),
  });
}
