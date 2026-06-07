// =============================================================================
// Products feature - hooks + types
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@inventorypro/validation/product";
import { toast } from "sonner";

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

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: string;
}

function buildQuery(p: ProductListParams): string {
  const qs = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useProducts(params: ProductListParams = {}) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => api.get<PaginatedResult<Product>>(`/api/v1/products${buildQuery(params)}`),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => api.get<Product>(`/api/v1/products/${id}`),
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
    mutationFn: (input: CreateProductInput) => api.post<Product>("/api/v1/products", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã tạo vật tư");
    },
    onError: (e: ApiError) => toast.error("Lỗi tạo vật tư", { description: e.message }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      api.put<Product>(`/api/v1/products/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã cập nhật vật tư");
    },
    onError: (e: ApiError) => toast.error("Lỗi cập nhật", { description: e.message }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã xóa/ngưng vật tư");
    },
    onError: (e: ApiError) => toast.error("Lỗi xóa", { description: e.message }),
  });
}

// Categories dropdown
export interface Category {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export function useCategoriesAll() {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api.get<PaginatedResult<Category>>("/api/v1/categories?pageSize=200"),
    staleTime: 5 * 60_000,
  });
}

// Units dropdown
export interface Unit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function useUnitsAll() {
  return useQuery({
    queryKey: ["units", "all"],
    queryFn: () => api.get<PaginatedResult<Unit>>("/api/v1/units?pageSize=200"),
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
