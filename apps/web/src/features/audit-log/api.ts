// =============================================================================
// Audit Log feature - Viewer
// =============================================================================
import { useQuery } from "@tanstack/react-query";
import { callActionNoId } from "@/lib/data-access";

export type AuditOperation = "INSERT" | "UPDATE" | "DELETE";

export interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  operation: AuditOperation;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  changedFields: string[] | null;
  changedBy: string | null;
  changedByEmail: string | null;
  changedByRole: string | null;
  createdAt: string;
}

export interface AuditLogQueryParams {
  tableName?: string;
  operation?: AuditOperation;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

const AUDITED_TABLES = [
  "products",
  "lots",
  "stock_movements",
  "stocktakes",
  "bid_contracts",
  "bid_lots",
  "purchase_requests",
  "goods_receipts",
  "stock_issues",
  "stock_transfers",
  "fefo_audit_log",
  "user_warehouse_roles",
  "user_global_roles",
];

export function useAuditLog(params: AuditLogQueryParams = {}) {
  return useQuery({
    queryKey: ["audit-log", params],
    queryFn: () =>
      callActionNoId<{ items: AuditLogEntry[]; page: number; pageSize: number }>(
        "audit-log-query",
        "query",
        {
          table_name: params.tableName,
          operation: params.operation,
          user_id: params.userId,
          from_date: params.fromDate,
          to_date: params.toDate,
          page: params.page ?? 1,
          page_size: params.pageSize ?? 50,
        }
      ),
    staleTime: 30_000,
  });
}

export { AUDITED_TABLES };

export const OPERATION_COLORS: Record<AuditOperation, string> = {
  INSERT: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
};

export const OPERATION_LABELS: Record<AuditOperation, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Cập nhật",
  DELETE: "Xóa",
};
