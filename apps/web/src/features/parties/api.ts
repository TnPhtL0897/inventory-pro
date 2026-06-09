// =============================================================================
// Parties feature - hooks + types (Supabase PostgREST version)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  getById,
  insertRow,
  updateRow,
  deleteRow,
  type PaginatedResult,
} from "@/lib/data-access";
import type { CreatePartyInput, UpdatePartyInput } from "@inventorypro/validation/party";

// =============================================================================
// Types (mirror backend DTOs)
// =============================================================================
export type PartyType = "SUPPLIER" | "CUSTOMER" | "BOTH";
export type PartyStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Party {
  id: string;
  partyType: string;
  code: string;
  name: string;
  taxCode?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  city?: string | null;
  country: string;
  paymentTerms: number;
  creditLimit: number;
  bankAccount?: string | null;
  bankName?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type {
  CreatePartyInput,
  UpdatePartyInput,
} from "@inventorypro/validation/party";

// =============================================================================
// List query
// =============================================================================
export interface PartyListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  partyType?: PartyType;
  status?: PartyStatus;
}

export function useParties(params: PartyListParams = {}) {
  return useQuery({
    queryKey: ["parties", params],
    queryFn: () =>
      listTable<Party>("parties", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["code", "name", "tax_code"],
        orderBy: "name",
        filters: {
          party_type: params.partyType,
          status: params.status,
        },
      }),
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: ["parties", id],
    queryFn: () => getById<Party>("parties", id),
    enabled: !!id,
  });
}

export function useCreateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePartyInput) => insertRow<Party>("parties", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã tạo đối tác");
    },
    onError: (e: Error) => toast.error("Lỗi tạo đối tác", { description: e.message }),
  });
}

export function useUpdateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePartyInput }) =>
      updateRow<Party>("parties", id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã cập nhật đối tác");
    },
    onError: (e: Error) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow("parties", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã xóa/ngưng đối tác");
    },
    onError: (e: Error) => toast.error("Lỗi xóa", { description: e.message }),
  });
}
