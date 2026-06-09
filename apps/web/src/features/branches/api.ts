// =============================================================================
// Branches feature - hooks + types (Supabase PostgREST version)
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { listTable, type PaginatedResult } from "@/lib/data-access";

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
  status: string;
}

export function useBranches(params: { page?: number; pageSize?: number; status?: string } = {}) {
  return useQuery({
    queryKey: ["branches", params],
    queryFn: () =>
      listTable<Branch>("branches", {
        page: params.page,
        pageSize: params.pageSize,
        orderBy: "name",
        filters: { status: params.status },
      }),
  });
}
