// =============================================================================
// Stock feature - hooks + types (Supabase PostgREST version)
// =============================================================================
// Stock levels & movements are VIEWS (read-only). Recording manual IN/OUT/ADJUST
// is done via Edge Function (writes to stock_movements + stock via trigger).
// =============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTable, insertRow } from "@/lib/data-access";

export type StockMovementType =
  | "IN" | "OUT" | "TRANSFER_IN" | "TRANSFER_OUT"
  | "ADJUST_IN" | "ADJUST_OUT" | "RETURN_IN" | "RETURN_OUT";

// View v_stock_levels: flat aggregate
// Columns: tenant_id, product_id, warehouse_id, location_id, unit_id,
//          batch_no, serial_no, expiry_date, on_hand_qty, weighted_avg_cost,
//          last_movement_date
export interface StockLevel {
  productId: string;
  warehouseId: string;
  locationId: string;
  unitId: string;
  batchNo: string | null;
  serialNo: string | null;
  expiryDate: string | null;
  quantity: number;
  reservedQty: number;       // always 0 - column not in view
  availableQty: number;      // = quantity
  avgCost: number;
  lastMovementAt: string | null;
  // Optional fields the original C# DTO exposed (not in view; null for now)
  productSku?: string | null;
  productName?: string | null;
  baseUnitCode?: string | null;
  branchId?: string | null;
  warehouseCode?: string | null;
  locationCode?: string | null;
}

// View v_stock_movements_history: unified timeline
// Columns: tenant_id, doc_id, doc_number, doc_type, movement_type,
//          product_id, warehouse_id, location_id, unit_id, batch_no, serial_no,
//          expiry_date, quantity, unit_cost, movement_date, posted_at, notes
export interface StockMovement {
  id: string;                 // = doc_id
  warehouseId: string;
  locationId: string;
  productId: string;
  unitId: string;
  movementType: string;      // IN/OUT/TRANSFER_IN/TRANSFER_OUT
  quantity: number;
  unitCost: number | null;
  refType: string;           // GOODS_RECEIPT/STOCK_ISSUE/STOCK_TRANSFER
  refId: string;             // = doc_id
  notes: string | null;
  batchNo: string | null;
  serialNo: string | null;
  expiryDate: string | null;
  postedAt: string | null;
  // Optional doc fields (not in view)
  branchId?: string | null;
  productSku?: string | null;
  productName?: string | null;
  idempotencyKey?: string;
}

// =============================================================================
// List stock levels (view)
// =============================================================================
export interface StockListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  warehouseId?: string;
  productId?: string;
  categoryId?: string;
  search?: string;
}

export function useStockLevels(params: StockListParams = {}) {
  return useQuery({
    queryKey: ["stock", "levels", params],
    queryFn: () =>
      listTable<StockLevel>("v_stock_levels", {
        page: params.page,
        pageSize: params.pageSize,
        orderBy: "last_movement_date",
        orderDesc: true,
        filters: {
          warehouse_id: params.warehouseId,
          product_id: params.productId,
        },
        // NB: branch_id & category_id not in this view - filtered client-side if needed
      }),
  });
}

// =============================================================================
// List stock movements (view)
// =============================================================================
export interface MovementListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  warehouseId?: string;
  productId?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useStockMovements(params: MovementListParams = {}) {
  return useQuery({
    queryKey: ["stock", "movements", params],
    queryFn: () =>
      listTable<StockMovement>("v_stock_movements_history", {
        page: params.page,
        pageSize: params.pageSize,
        orderBy: "movement_date",
        orderDesc: true,
        filters: {
          warehouse_id: params.warehouseId,
          product_id: params.productId,
          movement_type: params.movementType,
        },
        // NB: branch_id / date range not directly filterable on view columns
        // (movement_date is a date, not range; would need select+gte/lte raw query)
      }),
  });
}

// =============================================================================
// Record stock movement (manual IN/OUT/ADJUST...)
// =============================================================================
// TODO: cần Edge Function "stock-movements" để validate + update stock aggregate
//       (chưa có trong supabase/functions/). Tạm thời insertRow trực tiếp vào
//       stock_movements — bỏ qua trigger nếu có, cần sau khi deploy edge function.
// =============================================================================

export interface RecordMovementInput {
  branchId: string;
  warehouseId: string;
  locationId: string;
  productId: string;
  unitId: string;
  movementType: StockMovementType;
  quantity: number;
  unitCost?: number | null;
  notes?: string | null;
  batchNo?: string | null;
  serialNo?: string | null;
  expiryDate?: string | null;
}

function genUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useRecordMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordMovementInput) => {
      const idempotencyKey = genUuid();
      // TODO: replace with callFunction("stock-movements", { ...input, idempotency_key: idempotencyKey })
      //       once Edge Function is deployed.
      const row: any = {
        ...input,
        idempotencyKey,
        status: "POSTED",
        postedAt: new Date().toISOString(),
      };
      return await insertRow<StockMovement>("stock_movements", row);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock", "levels"] });
      qc.invalidateQueries({ queryKey: ["stock", "movements"] });
      const verb = vars.movementType === "IN" || vars.movementType === "TRANSFER_IN" || vars.movementType === "ADJUST_IN"
        ? "nhập" : "xuất";
      toast.success(`Đã ghi ${verb} kho`);
    },
    onError: (e: Error) => toast.error("Lỗi ghi movement", { description: e.message }),
  });
}

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  IN: "Nhập kho",
  OUT: "Xuất kho",
  TRANSFER_IN: "Nhận chuyển kho",
  TRANSFER_OUT: "Chuyển kho đi",
  ADJUST_IN: "Điều chỉnh tăng",
  ADJUST_OUT: "Điều chỉnh giảm",
  RETURN_IN: "Khách trả hàng",
  RETURN_OUT: "Trả nhà cung cấp",
};
export const MOVEMENT_COLORS: Record<StockMovementType, string> = {
  IN: "bg-green-100 text-green-800",
  OUT: "bg-orange-100 text-orange-800",
  TRANSFER_IN: "bg-blue-100 text-blue-800",
  TRANSFER_OUT: "bg-indigo-100 text-indigo-800",
  ADJUST_IN: "bg-emerald-100 text-emerald-800",
  ADJUST_OUT: "bg-amber-100 text-amber-800",
  RETURN_IN: "bg-cyan-100 text-cyan-800",
  RETURN_OUT: "bg-purple-100 text-purple-800",
};
