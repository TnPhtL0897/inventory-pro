// =============================================================================
// Warehouses feature
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@inventorypro/validation/warehouse";
import { toast } from "sonner";

export type WarehouseStatus = "ACTIVE" | "INACTIVE" | "CLOSED";
export type WarehouseType = "RECEIVING" | "ISSUE";

export interface Warehouse {
  id: string;
  branchId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  managerId: string | null;
  isDefault: boolean;
  allowNegative: boolean;
  status: string;
  type: WarehouseType;
  locationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  parentId: string | null;
  name: string;
  code: string;
  barcode: string | null;
  locationType: string;
  status: string;
  isPickable: boolean;
  pickSequence: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface WarehouseListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  status?: string;
  type?: WarehouseType | "";
  search?: string;
}

function buildQuery(p: WarehouseListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useWarehouses(params: WarehouseListParams = {}) {
  return useQuery({
    queryKey: ["warehouses", params],
    queryFn: () => api.get<PaginatedResult<Warehouse>>(`/api/v1/warehouses${buildQuery(params)}`),
  });
}

export function useWarehouse(id: string | undefined) {
  return useQuery({
    queryKey: ["warehouses", id],
    queryFn: () => api.get<Warehouse>(`/api/v1/warehouses/${id}`),
    enabled: !!id,
  });
}

export function useWarehouseLocations(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ["locations", "warehouse", warehouseId],
    queryFn: () => api.get<PaginatedResult<Location>>(
      `/api/v1/locations${warehouseId ? `?warehouseId=${warehouseId}&pageSize=200` : "?pageSize=200"}`
    ),
    enabled: !!warehouseId,
  });
}

// Re-export from validation package (snake_case để khớp với .NET backend JSON)
export type { CreateWarehouseInput, UpdateWarehouseInput } from "@inventorypro/validation/warehouse";

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => api.post<Warehouse>("/api/v1/warehouses", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã tạo kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo kho", { description: e.message }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      api.put<Warehouse>(`/api/v1/warehouses/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã cập nhật kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/warehouses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã đóng kho");
    },
    onError: (e: ApiError) => toast.error("Lỗi đóng kho", { description: e.message }),
  });
}

// Locations CRUD
export interface CreateLocationInput {
  warehouseId: string;
  parentId?: string | null;
  name: string;
  code: string;
  barcode?: string | null;
  locationType?: string;
  pickSequence?: number;
  isPickable?: boolean;
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLocationInput) => api.post<Location>("/api/v1/locations", input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["warehouses", vars.warehouseId] });
      toast.success("Đã tạo vị trí");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo vị trí", { description: e.message }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/locations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã xóa vị trí");
    },
    onError: (e: ApiError) => toast.error("Lỗi xóa vị trí", { description: e.message }),
  });
}

// Branches dropdown
export interface Branch {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

export function useBranchesAll() {
  return useQuery({
    queryKey: ["branches", "all"],
    queryFn: () => api.get<PaginatedResult<Branch>>("/api/v1/branches?pageSize=200"),
    staleTime: 5 * 60_000,
  });
}

export const WAREHOUSE_STATUS_LABELS: Record<WarehouseStatus, string> = {
  ACTIVE: "Hoạt động",
  INACTIVE: "Ngưng",
  CLOSED: "Đã đóng",
};
export const WAREHOUSE_STATUS_COLORS: Record<WarehouseStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  CLOSED: "bg-red-100 text-red-800",
};

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  RECEIVING: "Kho chẵn (nhập)",
  ISSUE: "Kho lẻ (xuất)",
};
export const WAREHOUSE_TYPE_COLORS: Record<WarehouseType, string> = {
  RECEIVING: "bg-blue-100 text-blue-800",
  ISSUE: "bg-amber-100 text-amber-800",
};
