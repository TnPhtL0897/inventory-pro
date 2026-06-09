// =============================================================================
// Products feature - hooks + types (Supabase PostgREST version)
//
// Reads via PostgREST with deepMap (snake_case → camelCase).
// Writes use PostgREST for simple CRUD (no business logic in product create).
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
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@inventorypro/validation/product";

export type ProductType = "GOODS" | "SERVICE" | "RAW_MATERIAL" | "FINISHED_GOOD" | "CONSUMABLE";
export type ProductStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitId: string;
  baseUnitCode: string | null;
  productType: string;
  costPrice: number;
  sellPrice: number;
  minStock: number;
  maxStock: number | null;
  isBatchTracked: boolean;
  isSerialTracked: boolean;
  isExpiryTracked: boolean;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: string;
}

export function useProducts(params: ProductListParams = {}) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () =>
      listTable<Product>("products", {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        searchColumns: ["sku", "name", "barcode"],
        orderBy: "name",
        filters: {
          category_id: params.categoryId,
          status: params.status,
        },
      }),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: async () => (id ? getById<Product>("products", id) : null),
    enabled: !!id,
  });
}

export type {
  CreateProductInput,
  UpdateProductInput,
} from "@inventorypro/validation/product";

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => insertRow<Product>("products", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã tạo vật tư");
    },
    onError: (e: Error) => toast.error("Lỗi tạo vật tư", { description: e.message }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      updateRow<Product>("products", id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã cập nhật vật tư");
    },
    onError: (e: Error) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow("products", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã xóa/ngưng vật tư");
    },
    onError: (e: Error) => toast.error("Lỗi xóa", { description: e.message }),
  });
}

// =============================================================================
// Categories dropdown
// =============================================================================
export interface Category {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export function useCategoriesAll() {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => listTable<Category>("categories", { pageSize: 200, orderBy: "name" }),
    staleTime: 5 * 60_000,
  });
}

// =============================================================================
// Units dropdown
// =============================================================================
export interface Unit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function useUnitsAll() {
  return useQuery({
    queryKey: ["units", "all"],
    queryFn: () => listTable<Unit>("units_of_measure", { pageSize: 200, orderBy: "code" }),
    staleTime: 5 * 60_000,
  });
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Đang dùng",
  INACTIVE: "Ngưng",
  ARCHIVED: "Lưu trữ",
};
export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  ARCHIVED: "bg-amber-100 text-amber-800",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  GOODS: "Hàng hóa",
  SERVICE: "Dịch vụ",
  RAW_MATERIAL: "Nguyên vật liệu",
  FINISHED_GOOD: "Thành phẩm",
  CONSUMABLE: "Vật tư tiêu hao",
};
