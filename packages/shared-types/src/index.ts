// Common types shared between web, mobile và .NET API
// Dùng cho cả client và server. Auto-generate từ database sau (supabase gen types).

export type UUID = string;
export type ISODateString = string;

// =============================================================================
// Tenants & Branches
// =============================================================================
export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  tax_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  settings: Record<string, unknown>;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Branch {
  id: UUID;
  tenant_id: UUID;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Users & Roles
// =============================================================================
export interface User {
  id: UUID;
  tenant_id: UUID;
  full_name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  last_login_at?: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export type RoleCode = "ADMIN" | "MANAGER" | "STAFF";

export interface Role {
  id: UUID;
  tenant_id: UUID;
  name: string;
  code: RoleCode | string;
  description?: string | null;
  permissions: string[];
  role_type: "SYSTEM" | "CUSTOM";
  is_active: boolean;
}

export interface UserRole {
  id: UUID;
  user_id: UUID;
  role_id: UUID;
  branch_id: UUID;
  granted_by?: UUID | null;
  granted_at: ISODateString;
  expires_at?: ISODateString | null;
}

// =============================================================================
// API Response Wrappers
// =============================================================================
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// =============================================================================
// Common Enums
// =============================================================================
export const MovementType = {
  IN: "IN",
  OUT: "OUT",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  ADJUST_IN: "ADJUST_IN",
  ADJUST_OUT: "ADJUST_OUT",
} as const;
export type MovementTypeValue = (typeof MovementType)[keyof typeof MovementType];

export const DocumentStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type DocumentStatusValue = (typeof DocumentStatus)[keyof typeof DocumentStatus];

// =============================================================================
// Products master data (migration 0002)
// =============================================================================
export type ProductType = "GOODS" | "SERVICE" | "RAW_MATERIAL" | "FINISHED_GOOD" | "CONSUMABLE";
export type ProductStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type UnitType = "COUNT" | "WEIGHT" | "VOLUME" | "LENGTH" | "AREA" | "TIME";

export interface Category {
  id: UUID;
  tenant_id: UUID;
  parent_id?: UUID | null;
  name: string;
  code: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface UnitOfMeasure {
  id: UUID;
  tenant_id: UUID;
  code: string;
  name: string;
  unit_type: UnitType;
  is_active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Product {
  id: UUID;
  tenant_id: UUID;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category_id?: UUID | null;
  base_unit_id: UUID;
  product_type: ProductType;
  cost_price: number;
  sell_price: number;
  min_stock: number;
  max_stock?: number | null;
  is_batch_tracked: boolean;
  is_serial_tracked: boolean;
  is_expiry_tracked: boolean;
  weight?: number | null;
  volume?: number | null;
  attributes: Record<string, unknown>;
  image_url?: string | null;
  status: ProductStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
  // Khoa XN — Module 1
  product_group?: "HOA_CHAT_SINH_PHAM" | "VAT_TU_Y_TE" | null;
  product_subtype?: ProductSubtype | null;
  open_vial_stability_days?: number | null;
  storage_condition?: string | null;
  is_active?: boolean;
  created_by?: UUID | null;
}

export interface ProductUnit {
  id: UUID;
  tenant_id: UUID;
  product_id: UUID;
  unit_id: UUID;
  factor: number;            // 1 unit này = factor base unit
  is_purchase: boolean;
  is_sale: boolean;
  barcode?: string | null;
  sort_order: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Warehouses + Locations (migration 0003)
// =============================================================================
export type WarehouseStatus = "ACTIVE" | "INACTIVE" | "CLOSED";
export type LocationStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";
export type LocationType =
  | "RECEIVING"
  | "STORAGE"
  | "PICKING"
  | "PACKING"
  | "SHIPPING"
  | "QUARANTINE"
  | "TRANSIT"
  | "RETURN";

// =============================================================================
// Khoa XN — Shared types (Module 1: Warehouse Role + Product Group)
// =============================================================================

/** Khoa XN: 4 kho vật lý (BULK/DAILY × HC-SP/VTYT) */
export type WarehouseRole =
  | "BULK_HC_SP"     // Kho chẵn Hóa chất - Sinh phẩm
  | "DAILY_HC_SP"    // Kho lẻ Hóa chất - Sinh phẩm
  | "BULK_VTYT"      // Kho chẵn Vật tư y tế
  | "DAILY_VTYT";    // Kho lẻ Vật tư y tế

/** Khoa XN: 2 mảng nghiệp vụ */
export type ProductGroup = "HOA_CHAT_SINH_PHAM" | "VAT_TU_Y_TE";

/** Subtype chi tiết cho từng mảng */
export type ProductSubtype =
  // HC-SP
  | "REAGENT"
  | "CALIBRATOR"
  | "CONTROL"
  | "BUFFER"
  | "WASH"
  | "CUVETTE"
  | "CONSUMABLE"
  // VTYT
  | "CONSUMABLE_MEDICAL"
  | "REAGENT_STRIP"
  | "OTHER";

/** Điều kiện bảo quản (free-form, dùng để gợi ý + cảnh báo) */
export type StorageCondition =
  | "ROOM_TEMP"
  | "REFRIGERATED"
  | "FROZEN"
  | "PROTECTED_FROM_LIGHT"
  | "DRY_PLACE";

/** Khoa XN role codes (dùng cho JWT claim) */
export type KhoaXnRoleCode =
  | "ADMIN"
  | "DEPT_HEAD"
  | "QC_OFFICER"
  | "KEEPER_BULK_HC_SP"
  | "KEEPER_DAILY_HC_SP"
  | "KEEPER_BULK_VTYT"
  | "KEEPER_DAILY_VTYT";

/** Helper: map warehouse_role → product_group */
export const WAREHOUSE_ROLE_TO_PRODUCT_GROUP: Record<WarehouseRole, ProductGroup> = {
  BULK_HC_SP: "HOA_CHAT_SINH_PHAM",
  DAILY_HC_SP: "HOA_CHAT_SINH_PHAM",
  BULK_VTYT: "VAT_TU_Y_TE",
  DAILY_VTYT: "VAT_TU_Y_TE",
};

/** Helper: gợi ý product_subtype theo product_group */
export const PRODUCT_SUBTYPES_BY_GROUP: Record<ProductGroup, ProductSubtype[]> = {
  HOA_CHAT_SINH_PHAM: [
    "REAGENT",
    "CALIBRATOR",
    "CONTROL",
    "BUFFER",
    "WASH",
    "CUVETTE",
    "CONSUMABLE",
  ],
  VAT_TU_Y_TE: ["CONSUMABLE_MEDICAL", "REAGENT_STRIP", "OTHER"],
};

export interface Warehouse {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  manager_id?: UUID | null;
  is_default: boolean;
  allow_negative: boolean;
  status: WarehouseStatus;
  attributes: Record<string, unknown>;
  // Khoa XN — Module 1
  role?: WarehouseRole | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Location {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  warehouse_id: UUID;
  parent_id?: UUID | null;
  name: string;
  code: string;
  barcode?: string | null;
  location_type: LocationType;
  capacity_volume?: number | null;
  capacity_weight?: number | null;
  max_qty_hint?: number | null;
  pick_sequence: number;
  is_pickable: boolean;
  is_active: boolean;
  status: LocationStatus;
  attributes: Record<string, unknown>;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Stock + Stock movements (migration 0004 - event-sourcing per ADR-0002)
// =============================================================================
export type StockMovementType =
  | "IN"
  | "OUT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "ADJUST_IN"
  | "ADJUST_OUT"
  | "RETURN_IN"
  | "RETURN_OUT";

export type StockMovementStatus = "PENDING" | "POSTED" | "REVERSED" | "CANCELLED";

export type StockReferenceType =
  | "MANUAL"
  | "GRN"
  | "ISSUE"
  | "TRANSFER"
  | "STOCKTAKE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN";

export interface StockMovement {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  warehouse_id: UUID;
  location_id: UUID;
  product_id: UUID;
  unit_id: UUID;
  movement_type: StockMovementType;
  status: StockMovementStatus;
  quantity: number;
  unit_cost?: number | null;
  ref_type: StockReferenceType;
  ref_id?: UUID | null;
  ref_line_id?: UUID | null;
  notes?: string | null;
  batch_no?: string | null;
  serial_no?: string | null;
  expiry_date?: string | null;       // ISODate
  idempotency_key: UUID;
  created_by?: UUID | null;
  posted_at: ISODateString;
  created_at: ISODateString;
  metadata: Record<string, unknown>;
}

export interface Stock {
  tenant_id: UUID;
  branch_id: UUID;
  warehouse_id: UUID;
  location_id: UUID;
  product_id: UUID;
  batch_no?: string | null;
  serial_no?: string | null;
  quantity: number;
  reserved_qty: number;
  avg_cost: number;
  last_movement_at?: ISODateString | null;
  version: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Parties (NCC + Khách hàng) - migration 0005
// =============================================================================
export type PartyType = "SUPPLIER" | "CUSTOMER" | "BOTH";
export type PartyStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Party {
  id: UUID;
  tenant_id: UUID;
  party_type: PartyType;
  code: string;
  name: string;
  tax_code?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  city?: string | null;
  country: string;
  payment_terms: number;
  credit_limit: number;
  bank_account?: string | null;
  bank_name?: string | null;
  notes?: string | null;
  status: PartyStatus;
  attributes: Record<string, unknown>;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface SupplierProduct {
  id: UUID;
  tenant_id: UUID;
  party_id: UUID;
  product_id: UUID;
  supplier_sku?: string | null;
  cost_price: number;
  min_order_qty: number;
  lead_time_days: number;
  is_preferred: boolean;
  notes?: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Purchase Orders (migration 0006)
// =============================================================================
export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "POSTED" | "COMPLETED" | "CANCELLED";
export type PurchaseOrderLineStatus = "OPEN" | "PARTIAL" | "RECEIVED" | "CANCELLED";

export interface PurchaseOrderLine {
  id: UUID;
  tenant_id: UUID;
  purchase_order_id: UUID;
  line_no: number;
  product_id: UUID;
  product_sku?: string | null;
  product_name: string;
  unit_id: UUID;
  unit_code: string;
  quantity: number;
  received_qty: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  status: PurchaseOrderLineStatus;
  notes?: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface PurchaseOrder {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  po_number: string;
  party_id: UUID;
  party_name?: string | null;
  party_code?: string | null;
  order_date: ISODateString;
  expected_date?: ISODateString | null;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  shipping_amount: number;
  total: number;
  paid_amount: number;
  status: PurchaseOrderStatus;
  payment_terms: number;
  shipping_address?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  approved_by?: UUID | null;
  approved_at?: ISODateString | null;
  posted_by?: UUID | null;
  posted_at?: ISODateString | null;
  completed_at?: ISODateString | null;
  cancelled_at?: ISODateString | null;
  cancel_reason?: string | null;
  line_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Goods Receipts (migration 0007)
// =============================================================================
export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type GoodsReceiptLineStatus = "OPEN" | "POSTED" | "CANCELLED";

export interface GoodsReceiptLine {
  id: UUID;
  tenant_id: UUID;
  goods_receipt_id: UUID;
  po_line_id?: UUID | null;
  line_no: number;
  product_id: UUID;
  product_sku?: string | null;
  product_name: string;
  unit_id: UUID;
  unit_code: string;
  location_id: UUID;
  location_code?: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
  batch_no?: string | null;
  serial_no?: string | null;
  expiry_date?: ISODateString | null;
  notes?: string | null;
  movement_id?: UUID | null;
  status: GoodsReceiptLineStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface GoodsReceipt {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  grn_number: string;
  purchase_order_id?: UUID | null;
  po_number?: string | null;
  party_id: UUID;
  party_name?: string | null;
  party_code?: string | null;
  warehouse_id: UUID;
  warehouse_code?: string | null;
  receipt_date: ISODateString;
  supplier_invoice_no?: string | null;
  supplier_invoice_date?: ISODateString | null;
  notes?: string | null;
  status: GoodsReceiptStatus;
  posted_by?: UUID | null;
  posted_at?: ISODateString | null;
  line_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// =============================================================================
// Stock Issues (migration 0008)
// =============================================================================
export type StockIssueStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type StockIssuePurpose = "SALE" | "INTERNAL_USE" | "SCRAP" | "SAMPLE" | "GIFT" | "TRANSFER_OUT" | "ADJUSTMENT";
export type StockIssueLineStatus = "OPEN" | "POSTED" | "CANCELLED";

export interface StockIssueLine {
  id: UUID;
  tenant_id: UUID;
  stock_issue_id: UUID;
  line_no: number;
  product_id: UUID;
  product_sku?: string | null;
  product_name: string;
  unit_id: UUID;
  unit_code: string;
  location_id: UUID;
  location_code?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  batch_no?: string | null;
  serial_no?: string | null;
  expiry_date?: ISODateString | null;
  notes?: string | null;
  movement_id?: UUID | null;
  status: StockIssueLineStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface StockIssue {
  id: UUID;
  tenant_id: UUID;
  branch_id: UUID;
  issue_number: string;
  party_id?: UUID | null;
  party_name?: string | null;
  warehouse_id: UUID;
  warehouse_code?: string | null;
  purpose: StockIssuePurpose;
  issue_date: ISODateString;
  reference_no?: string | null;
  notes?: string | null;
  status: StockIssueStatus;
  posted_by?: UUID | null;
  posted_at?: ISODateString | null;
  line_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}
// =============================================================================
// Khoa XN — Module 2: Lot Lifecycle
// =============================================================================

/** Lot status (10 trạng thái) */
export type LotStatus =
  | "QUARANTINE"
  | "PENDING_QC"
  | "IN_QC"
  | "APPROVED"
  | "IN_USE"
  | "DEPLETED"
  | "EXPIRED"
  | "DESTROYED"
  | "QC_FAILED"
  | "BLOCKED";

/** QC result */
export type LotQCResult = "PASS" | "FAIL" | "PENDING";

/** QC type */
export type LotQCType = "INITIAL" | "OPEN_VIAL_RETEST" | "PERIODIC";

/** Lot (master) */
export interface Lot {
  id: UUID;
  tenant_id: UUID;
  product_id: UUID;
  warehouse_id: UUID;
  lot_number: string;
  manufacturer_date: ISODateString | null;
  expiration_date: ISODateString;
  quantity: number;
  package_volume: number | null;
  storage_condition: StorageCondition | null;
  status: LotStatus;
  qc_required: boolean;
  qc_required_at: ISODateString | null;
  qc_completed_at: ISODateString | null;
  open_vial_opened_at: ISODateString | null;
  open_vial_opened_by: UUID | null;
  open_vial_quantity_remaining: number | null;
  open_vial_expiration_date: ISODateString | null;
  open_vial_stability_days: number | null;
  open_vial_count: number;
  last_qc_retest_at: ISODateString | null;
  last_qc_retest_result: LotQCResult | null;
  qc_retest_valid_until: ISODateString | null;
  recall_notice_id: UUID | null;
  recall_blocked_at: ISODateString | null;
  certificate_of_analysis_url: string | null;
  attachments: Record<string, unknown>[];
  notes: string | null;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Lot QC Record */
export interface LotQCRecord {
  id: UUID;
  tenant_id: UUID;
  lot_id: UUID;
  qc_type: LotQCType;
  qc_method: string | null;
  qc_result: LotQCResult;
  qc_notes: string | null;
  qc_date: ISODateString;
  qc_started_at: ISODateString | null;
  qc_completed_at: ISODateString | null;
  valid_until: ISODateString | null;
  decision_notes: string | null;
  control_normal_lot_id: UUID | null;
  control_pathological_lot_id: UUID | null;
  attachments: Record<string, unknown>[];
  qc_officer_id: UUID;
  created_at: ISODateString;
}

/** Open-vial history (mỗi lần mở 1 record) */
export interface OpenVialHistory {
  id: UUID;
  tenant_id: UUID;
  lot_id: UUID;
  opened_at: ISODateString;
  opened_by: UUID;
  quantity_before: number;
  quantity_taken: number;
  quantity_after: number;
  open_vial_stability_days: number;
  open_vial_expiration_date: ISODateString;
  label_printed: boolean;
  label_printed_at: ISODateString | null;
  notes: string | null;
  created_at: ISODateString;
}

/** Recall notice */
export type RecallSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RecallStatus = "ACTIVE" | "RESOLVED" | "CLOSED";
export type RecallActionType = "RETURN_TO_SUPPLIER" | "DESTROY" | "INVESTIGATE";

export interface RecallNotice {
  id: UUID;
  tenant_id: UUID;
  recall_number: string;
  supplier_name: string;
  product_names: string[];
  reason: string;
  severity: RecallSeverity;
  recall_date: ISODateString;
  action_taken_by_supplier: string | null;
  affected_lot_numbers: string[];
  status: RecallStatus;
  resolved_at: ISODateString | null;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface RecallLotAction {
  id: UUID;
  tenant_id: UUID;
  recall_notice_id: UUID;
  lot_id: UUID;
  still_in_stock: boolean | null;
  already_used: boolean | null;
  usage_notes: string | null;
  action: RecallActionType;
  action_notes: string | null;
  disposal_request_id: UUID | null;
  return_document_id: UUID | null;
  investigation_task_id: UUID | null;
  processed_by: UUID | null;
  processed_at: ISODateString | null;
  created_at: ISODateString;
}

/** Disposal */
export type DisposalStatus =
  | "PENDING"
  | "APPROVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface DisposalRequest {
  id: UUID;
  tenant_id: UUID;
  request_number: string;
  reason: string;
  status: DisposalStatus;
  total_estimated_value: number;
  requires_dept_head_approval: boolean;
  auto_generated: boolean;
  created_by: UUID | null;
  approved_by: UUID | null;
  rejected_by: UUID | null;
  rejection_reason: string | null;
  disposal_act_number: string | null;
  disposal_act_url: string | null;
  disposal_date: ISODateString | null;
  disposal_method: string | null;
  completed_at: ISODateString | null;
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface DisposalRequestLine {
  id: UUID;
  disposal_request_id: UUID;
  lot_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_price: number | null;
  estimated_value: number | null;
  expiration_date: ISODateString | null;
  reason: string | null;
  created_at: ISODateString;
}

/** Lot alerts */
export type LotAlertType =
  | "EXPIRING_SOON"
  | "OPEN_VIAL_EXPIRING"
  | "OUT_OF_STOCK"
  | "RECALL"
  | "QC_REQUIRED";
export type LotAlertLevel = "INFO" | "WARNING" | "CRITICAL";

export interface LotAlert {
  id: UUID;
  tenant_id: UUID;
  lot_id: UUID;
  alert_type: LotAlertType;
  alert_level: LotAlertLevel;
  message: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolved_at: ISODateString | null;
  resolved_by: UUID | null;
  created_at: ISODateString;
}

// =============================================================================
// Labels & Colors (dùng cho UI)
// =============================================================================

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  QUARANTINE: "Cách ly",
  PENDING_QC: "Chờ QC",
  IN_QC: "Đang QC",
  APPROVED: "Đạt chất lượng",
  IN_USE: "Đang sử dụng",
  DEPLETED: "Hết số lượng",
  EXPIRED: "Hết hạn",
  DESTROYED: "Đã hủy",
  QC_FAILED: "QC không đạt",
  BLOCKED: "Bị chặn (Recall)",
};

export const LOT_STATUS_COLORS: Record<LotStatus, string> = {
  QUARANTINE: "bg-gray-100 text-gray-800",
  PENDING_QC: "bg-yellow-100 text-yellow-800",
  IN_QC: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_USE: "bg-cyan-100 text-cyan-800",
  DEPLETED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-red-100 text-red-800",
  DESTROYED: "bg-stone-100 text-stone-600",
  QC_FAILED: "bg-rose-100 text-rose-800",
  BLOCKED: "bg-purple-100 text-purple-800",
};

export const RECALL_SEVERITY_LABELS: Record<RecallSeverity, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

export const RECALL_SEVERITY_COLORS: Record<RecallSeverity, string> = {
  LOW: "bg-blue-100 text-blue-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const RECALL_ACTION_LABELS: Record<RecallActionType, string> = {
  RETURN_TO_SUPPLIER: "Trả nhà cung cấp",
  DESTROY: "Tiêu hủy",
  INVESTIGATE: "Điều tra",
};

export const DISPOSAL_STATUS_LABELS: Record<DisposalStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  IN_PROGRESS: "Đang thực hiện",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export const DISPOSAL_STATUS_COLORS: Record<DisposalStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-cyan-100 text-cyan-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

export const ALERT_LEVEL_COLORS: Record<LotAlertLevel, string> = {
  INFO: "bg-blue-100 text-blue-800",
  WARNING: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-800",
};

// =============================================================================
// Database (sẽ được generate tự động bởi supabase gen types)
// =============================================================================
export type Database = {
  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Partial<Tenant> & { name: string; slug: string }; Update: Partial<Tenant> };
      branches: { Row: Branch; Insert: Omit<Branch, "id" | "created_at" | "updated_at">; Update: Partial<Branch> };
      users: { Row: User; Insert: Omit<User, "created_at" | "updated_at">; Update: Partial<User> };
      roles: { Row: Role; Insert: Omit<Role, "id" | "created_at" | "updated_at">; Update: Partial<Role> };
      user_roles: { Row: UserRole; Insert: Omit<UserRole, "id" | "granted_at">; Update: Partial<UserRole> };
      categories: { Row: Category; Insert: Omit<Category, "id" | "created_at" | "updated_at">; Update: Partial<Category> };
      units_of_measure: { Row: UnitOfMeasure; Insert: Omit<UnitOfMeasure, "id" | "created_at" | "updated_at">; Update: Partial<UnitOfMeasure> };
      products: { Row: Product; Insert: Omit<Product, "id" | "created_at" | "updated_at">; Update: Partial<Product> };
      product_units: { Row: ProductUnit; Insert: Omit<ProductUnit, "id" | "created_at" | "updated_at">; Update: Partial<ProductUnit> };
      warehouses: { Row: Warehouse; Insert: Omit<Warehouse, "id" | "created_at" | "updated_at">; Update: Partial<Warehouse> };
      locations: { Row: Location; Insert: Omit<Location, "id" | "created_at" | "updated_at">; Update: Partial<Location> };
      stock_movements: { Row: StockMovement; Insert: Omit<StockMovement, "id" | "posted_at" | "created_at">; Update: never };
      stock: { Row: Stock; Insert: never; Update: never };
      parties: { Row: Party; Insert: Omit<Party, "id" | "created_at" | "updated_at" | "attributes"> & { attributes?: Record<string, unknown> }; Update: Partial<Party> };
      supplier_products: { Row: SupplierProduct; Insert: Omit<SupplierProduct, "id" | "created_at" | "updated_at">; Update: Partial<SupplierProduct> };
      purchase_orders: { Row: PurchaseOrder; Insert: Omit<PurchaseOrder, "id" | "po_number" | "line_count" | "subtotal" | "tax_amount" | "total" | "paid_amount" | "created_at" | "updated_at" | "status">; Update: Partial<PurchaseOrder> };
      purchase_order_lines: { Row: PurchaseOrderLine; Insert: Omit<PurchaseOrderLine, "id" | "line_no" | "received_qty" | "line_total" | "status" | "product_sku" | "created_at" | "updated_at">; Update: Partial<PurchaseOrderLine> };
      goods_receipts: { Row: GoodsReceipt; Insert: Omit<GoodsReceipt, "id" | "grn_number" | "line_count" | "po_number" | "party_name" | "party_code" | "warehouse_code" | "status" | "posted_at" | "created_at" | "updated_at">; Update: Partial<GoodsReceipt> };
      goods_receipt_lines: { Row: GoodsReceiptLine; Insert: Omit<GoodsReceiptLine, "id" | "line_no" | "line_total" | "status" | "movement_id" | "product_sku" | "location_code" | "created_at" | "updated_at">; Update: Partial<GoodsReceiptLine> };
      stock_issues: { Row: StockIssue; Insert: Omit<StockIssue, "id" | "issue_number" | "line_count" | "party_name" | "warehouse_code" | "status" | "posted_at" | "created_at" | "updated_at">; Update: Partial<StockIssue> };
      stock_issue_lines: { Row: StockIssueLine; Insert: Omit<StockIssueLine, "id" | "line_no" | "line_total" | "status" | "movement_id" | "product_sku" | "location_code" | "created_at" | "updated_at">; Update: Partial<StockIssueLine> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
