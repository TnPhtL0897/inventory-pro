// =============================================================================
// Branches feature - hooks + types
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
  status: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function useBranches(params: { page?: number; pageSize?: number; status?: string } = {}) {
  return useQuery({
    queryKey: ["branches", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
      });
      const s = qs.toString();
      const res = await api.get<PaginatedResult<any>>(`/api/v1/warehouses${s ? `?${s}` : ""}`);
      // /api/v1/warehouses trả về warehouse, không phải branch
      // → Map sang branch shape (tạm thời dùng warehouse làm branch proxy)
      return {
        ...res,
        items: res.items.map((w: any) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          address: w.address,
          phone: w.phone,
          isDefault: w.isDefault,
          status: w.status,
        })),
      } as PaginatedResult<Branch>;
    },
  });
}
