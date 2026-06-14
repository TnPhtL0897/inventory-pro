// =============================================================================
// Admin — User management + role assignment (Supabase PostgREST version)
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  sb,
  listTable,
  deepMap,
  deepMapRows,
  type PaginatedResult,
} from "@/lib/data-access";
import type { WarehouseRole, ProductGroup } from "@inventorypro/shared-types";

// =============================================================================
// Types (DB rows -> camelCase via deepMap)
// =============================================================================

export interface DbUser {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbRole {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string | null;
  roleType: string;
  isActive: boolean;
}

export interface DbUserRole {
  id: string;
  userId: string;
  roleId: string;
  branchId: string;
  grantedAt: string;
  grantedBy: string | null;
  expiresAt: string | null;
}

/** User với đầy đủ thông tin roles + branches (dùng cho UI) */
export interface UserWithRoles {
  id: string;
  fullName: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  globalRoles: GlobalRoleWithCode[];
  warehouseRoles: WarehouseRoleAssignment[];
}

export interface GlobalRoleWithCode {
  roleId: string;
  roleCode: string;
  roleName: string;
}

export interface WarehouseRoleAssignment {
  userRoleId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  branchId: string;
  branchName: string | null;
  grantedAt: string;
  expiresAt: string | null;
}

// =============================================================================
// Queries
// =============================================================================

export function useUsers(params: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: async () => {
      const result = await listTable<DbUser>("users", {
        page: 1,
        pageSize: 200,
        search: params.search,
        searchColumns: ["full_name", "email"],
        orderBy: "full_name",
        filters: { status: params.status },
      });
      return result;
    },
  });
}

export function useAllRoles() {
  return useQuery({
    queryKey: ["admin", "roles", "all"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("roles")
        .select("id, tenant_id, name, code, description, role_type, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return deepMapRows<DbRole>(data ?? []);
    },
    staleTime: 60_000,
  });
}

export function useAllBranches() {
  return useQuery({
    queryKey: ["admin", "branches", "all"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("branches")
        .select("id, name, code")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/** Lấy user_roles của 1 user (kèm thông tin role + branch) */
export function useUserRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "user-roles", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await sb()
        .from("user_roles")
        .select(
          "id, user_id, role_id, branch_id, granted_at, granted_by, expires_at, role:roles(id, name, code, role_type), branch:branches(id, name, code)"
        )
        .eq("user_id", userId)
        .order("granted_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        userRoleId: row.id,
        roleId: row.role_id,
        roleCode: row.role?.code ?? "",
        roleName: row.role?.name ?? "",
        roleType: row.role?.role_type ?? "",
        branchId: row.branch_id,
        branchName: row.branch?.name ?? null,
        grantedAt: row.granted_at,
        expiresAt: row.expires_at,
      }));
    },
    enabled: !!userId,
  });
}

// =============================================================================
// Mutations
// =============================================================================

export interface AssignUserRoleInput {
  userId: string;
  roleId: string;
  branchId: string;
  expiresAt?: string | null;
}

/** Gán role cho user tại 1 branch */
export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignUserRoleInput) => {
      const { data, error } = await sb()
        .from("user_roles")
        .insert({
          user_id: input.userId,
          role_id: input.roleId,
          branch_id: input.branchId,
          expires_at: input.expiresAt ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return deepMap(data);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "user-roles", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Đã gán role cho user");
    },
    onError: (e: Error) =>
      toast.error("Lỗi gán role", { description: e.message }),
  });
}

/** Xóa role khỏi user (hard delete vì user_roles không có is_active) */
export function useRemoveUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userRoleId: string; userId: string }) => {
      const { error } = await sb()
        .from("user_roles")
        .delete()
        .eq("id", input.userRoleId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "user-roles", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Đã xóa role");
    },
    onError: (e: Error) =>
      toast.error("Lỗi xóa role", { description: e.message }),
  });
}

// =============================================================================
// Role code constants (matching Khoa XN roles)
// =============================================================================

export const KHOA_XN_ROLE_CODES = {
  ADMIN: "ADMIN",
  DEPT_HEAD: "DEPT_HEAD",
  QC_OFFICER: "QC_OFFICER",
  KEEPER_BULK_HC_SP: "KEEPER_BULK_HC_SP",
  KEEPER_DAILY_HC_SP: "KEEPER_DAILY_HC_SP",
  KEEPER_BULK_VTYT: "KEEPER_BULK_VTYT",
  KEEPER_DAILY_VTYT: "KEEPER_DAILY_VTYT",
} as const;

export const ROLE_CODE_LABELS: Record<string, string> = {
  ADMIN: "Admin hệ thống",
  DEPT_HEAD: "Trưởng khoa",
  QC_OFFICER: "KTV xét nghiệm (QC)",
  KEEPER_BULK_HC_SP: "Thủ kho chẵn HC-SP",
  KEEPER_DAILY_HC_SP: "Thủ kho lẻ HC-SP",
  KEEPER_BULK_VTYT: "Thủ kho chẵn VTYT",
  KEEPER_DAILY_VTYT: "Thủ kho lẻ VTYT",
};

export const ROLE_CODE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-800",
  DEPT_HEAD: "bg-blue-100 text-blue-800",
  QC_OFFICER: "bg-cyan-100 text-cyan-800",
  KEEPER_BULK_HC_SP: "bg-purple-100 text-purple-800",
  KEEPER_DAILY_HC_SP: "bg-pink-100 text-pink-800",
  KEEPER_BULK_VTYT: "bg-indigo-100 text-indigo-800",
  KEEPER_DAILY_VTYT: "bg-orange-100 text-orange-800",
};

/** Helper: map role_code → product_group (dùng cho UI filter/display) */
export function roleCodeToProductGroup(code: string): ProductGroup | null {
  if (code.includes("HC_SP")) return "HOA_CHAT_SINH_PHAM";
  if (code.includes("VTYT")) return "VAT_TU_Y_TE";
  if (code === "QC_OFFICER") return "HOA_CHAT_SINH_PHAM"; // QC chỉ cho HC-SP
  return null;
}
