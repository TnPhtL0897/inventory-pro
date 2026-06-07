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
