// =============================================================================
// Warehouses feature - hooks + types (Supabase PostgREST version)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listTable,
  getById,
  insertRow,
  updateRow,
  deleteRow,
  sb,
  type PaginatedResult,
} from "@/lib/data-access";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "@inventorypro/validation/warehouse";
import type { WarehouseRole, ProductGroup } from "@inventorypro/shared-types";

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
  // Khoa XN — Module 1
  role?: WarehouseRole | null;
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

export interface WarehouseListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  status?: string;
  type?: WarehouseType | "";
  search?: string;
  // Khoa XN
  role?: WarehouseRole | "";
  productGroup?: ProductGroup | "";
}

export function useWarehouses(params: WarehouseListParams = {}) {
  return useQuery({
    queryKey: ["warehouses", params],
    queryFn: () =>
      listTable<Warehouse>("warehouses", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["name", "code"],
        orderBy: "name",
        filters: {
          branch_id: params.branchId,
          status: params.status,
          type: params.type,
          role: params.role || undefined,
        },
      }),
  });
}

/**
 * Khoa XN: lấy warehouses theo role cụ thể (BULK_HC_SP, DAILY_VTYT, ...)
 * Dùng cho dropdown chọn kho khi tạo phiếu chuyển kho nội bộ.
 */
export function useWarehousesByRole(role: WarehouseRole | undefined) {
  return useQuery({
    queryKey: ["warehouses", "by-role", role],
    queryFn: async () => {
      if (!role) return [];
      const { data, error } = await sb()
        .from("warehouses")
        .select("id, code, name, role, branch_id, status")
        .eq("role", role)
        .eq("status", "ACTIVE")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        role: r.role,
        branchId: r.branch_id,
        status: r.status,
      }));
    },
    enabled: !!role,
  });
}

export function useWarehouse(id: string | undefined) {
  return useQuery({
    queryKey: ["warehouses", id],
    queryFn: () => getById<Warehouse>("warehouses", id),
    enabled: !!id,
  });
}

export function useWarehouseLocations(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ["locations", "warehouse", warehouseId],
    queryFn: () =>
      listTable<Location>("locations", {
        pageSize: 200,
        filters: { warehouse_id: warehouseId },
      }),
    enabled: !!warehouseId,
  });
}

export type { CreateWarehouseInput, UpdateWarehouseInput } from "@inventorypro/validation/warehouse";

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => insertRow<Warehouse>("warehouses", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã tạo kho");
    },
    onError: (e: Error) => toast.error("Lỗi tạo kho", { description: e.message }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      updateRow<Warehouse>("warehouses", id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã cập nhật kho");
    },
    onError: (e: Error) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow("warehouses", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã đóng kho");
    },
    onError: (e: Error) => toast.error("Lỗi đóng kho", { description: e.message }),
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
    mutationFn: (input: CreateLocationInput) => insertRow<Location>("locations", input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["warehouses", vars.warehouseId] });
      toast.success("Đã tạo vị trí");
    },
    onError: (e: Error) => toast.error("Lỗi tạo vị trí", { description: e.message }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow("locations", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Đã xóa vị trí");
    },
    onError: (e: Error) => toast.error("Lỗi xóa vị trí", { description: e.message }),
  });
}

// Branches dropdown (now hits the real branches table)
export interface Branch {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

export function useBranchesAll() {
  return useQuery({
    queryKey: ["branches", "all"],
    queryFn: () => listTable<Branch>("branches", { pageSize: 200, orderBy: "name" }),
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

// =============================================================================
// Khoa XN — Warehouse Role labels + colors
// =============================================================================

export const WAREHOUSE_ROLE_LABELS: Record<WarehouseRole, string> = {
  BULK_HC_SP: "Kho chẵn HC-SP",
  DAILY_HC_SP: "Kho lẻ HC-SP",
  BULK_VTYT: "Kho chẵn VTYT",
  DAILY_VTYT: "Kho lẻ VTYT",
};

export const WAREHOUSE_ROLE_COLORS: Record<WarehouseRole, string> = {
  BULK_HC_SP: "bg-purple-100 text-purple-800",
  DAILY_HC_SP: "bg-pink-100 text-pink-800",
  BULK_VTYT: "bg-indigo-100 text-indigo-800",
  DAILY_VTYT: "bg-orange-100 text-orange-800",
};

export const WAREHOUSE_ROLES: WarehouseRole[] = [
  "BULK_HC_SP",
  "DAILY_HC_SP",
  "BULK_VTYT",
  "DAILY_VTYT",
];
