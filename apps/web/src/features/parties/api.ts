// =============================================================================
// Parties feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
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

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
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

function buildQuery(p: PartyListParams): string {
  const qs = new URLSearchParams();
  if (p.page) qs.set("page", String(p.page));
  if (p.pageSize) qs.set("pageSize", String(p.pageSize));
  if (p.search) qs.set("search", p.search);
  if (p.partyType) qs.set("partyType", p.partyType);
  if (p.status) qs.set("status", p.status);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useParties(params: PartyListParams = {}) {
  return useQuery({
    queryKey: ["parties", params],
    queryFn: () => api.get<PaginatedResult<Party>>(`/api/v1/parties${buildQuery(params)}`),
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: ["parties", id],
    queryFn: () => api.get<Party>(`/api/v1/parties/${id}`),
    enabled: !!id,
  });
}

export function useCreateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePartyInput) => api.post<Party>("/api/v1/parties", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã tạo đối tác");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo đối tác", { description: e.message }),
  });
}

export function useUpdateParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePartyInput }) =>
      api.put<Party>(`/api/v1/parties/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã cập nhật đối tác");
    },
    onError: (e: ApiError) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/parties/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      toast.success("Đã xóa/ngưng đối tác");
    },
    onError: (e: ApiError) => toast.error("Lỗi xóa", { description: e.message }),
  });
}
