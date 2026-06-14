# SPEC #5: Warehouse Role + Product Group + Permission — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: N1 + N2 + N3 (gộp 3 module nền tảng P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 3.1, 3.2, 3.3
> **Đây là module NỀN TẢNG** — tất cả modules khác phụ thuộc vào đây

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Xây dựng **hệ thống phân quyền linh hoạt** cho Khoa XN, cho phép:
- Mỗi kho có **role riêng** (BULK/DAILY × HC-SP/VTYT) — 4 role cơ bản
- Mỗi user có thể được gán **nhiều role + nhiều kho** (linh hoạt)
- Thủ kho có quyền **tự tạo master data** (sản phẩm, danh mục) trong phạm vi mảng mình phụ trách
- Trưởng khoa xem được **tất cả** 4 kho + toàn bộ audit log
- RLS bảo đảm **mỗi user chỉ thấy dữ liệu trong phạm vi quyền**

### 1.2. Phạm vi
- **Trong scope**:
  - Migration: thêm `role` enum vào `warehouses`, thêm `product_group` + `product_subtype` vào `products`
  - Bảng `user_warehouse_roles` (quan hệ nhiều-nhiều user × warehouse × role)
  - Bảng `role_permissions` (matrix quyền theo role)
  - UI: Admin/Trưởng khoa quản lý user + gán role
  - UI: Thủ kho tạo/sửa sản phẩm trong mảng mình
  - Middleware: kiểm tra quyền trước mỗi API call
- **Ngoài scope**:
  - SSO với bệnh viện (sử dụng Supabase Auth)
  - Phân quyền chi tiết theo từng field (chỉ phân quyền theo record)

### 1.3. Tuân thủ
- **TT 54/2017/BYT** Điều 14: Phân quyền truy cập, mỗi user chỉ thấy dữ liệu cần thiết
- **ISO 15189:2022** Điều 5.5: Phân công trách nhiệm rõ ràng

---

## 2. ACTORS & ROLES

### 2.1. Warehouse Role (4 role cơ bản + 1 admin + 1 dept head)

| Role Code | Mô tả | Người dùng mặc định |
|---|---|---|
| `ADMIN` | Admin hệ thống (toàn quyền) | IT/admin BV |
| `DEPT_HEAD` | Trưởng khoa (xem tất cả + duyệt) | 1 người |
| `KEEPER_BULK_HC_SP` | Thủ kho kho chẵn HC-SP | 1+ người |
| `KEEPER_DAILY_HC_SP` | Thủ kho kho lẻ HC-SP | 2+ người (chia ca/tuần) |
| `KEEPER_BULK_VTYT` | Thủ kho kho chẵn VTYT | 1+ người |
| `KEEPER_DAILY_VTYT` | Thủ kho kho lẻ VTYT | 1+ người |
| `QC_OFFICER` | KTV xét nghiệm (duyệt QC HC-SP) | 1+ người (từ SPEC #3) |

### 2.2. Quan hệ nhiều-nhiều user × warehouse × role

Vì bác chọn "phân quyền linh hoạt theo user", 1 user có thể có nhiều role ở nhiều kho:

```
user_warehouse_roles:
  user_id:  UUID
  warehouse_id: UUID
  role: ENUM (KEEPER_BULK_HC_SP, ...)
  is_primary: BOOLEAN  -- role chính (mặc định)
  is_active: BOOLEAN
  assigned_at, assigned_by

  UNIQUE (user_id, warehouse_id, role)
```

**Ví dụ**:
- User A: `KEEPER_BULK_HC_SP` @ BULK_HC_SP (primary) + `KEEPER_DAILY_HC_SP` @ DAILY_HC_SP (khi cover ca)
- User B: `KEEPER_DAILY_HC_SP` @ DAILY_HC_SP
- User C: `KEEPER_BULK_VTYT` @ BULK_VTYT + `KEEPER_DAILY_VTYT` @ DAILY_VTYT

### 2.3. Product Group & Subtype

```sql
-- Thêm vào products
ALTER TABLE products ADD COLUMN product_group TEXT
  CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE'));

ALTER TABLE products ADD COLUMN product_subtype TEXT;
-- Cho HC-SP: REAGENT, CALIBRATOR, CONTROL, BUFFER, WASH, CUVETTE, CONSUMABLE
-- Cho VTYT: CONSUMABLE_MEDICAL, REAGENT_STRIP, ...

ALTER TABLE products ADD COLUMN open_vial_stability_days INT;  -- Cho HC-SP
ALTER TABLE products ADD COLUMN min_stock INT DEFAULT 0;
ALTER TABLE products ADD COLUMN max_stock INT DEFAULT 0;
ALTER TABLE products ADD COLUMN storage_condition TEXT;
ALTER TABLE products ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

---

## 3. WORKFLOW

### 3.1. Workflow gán role cho user (Admin/DEPT_HEAD)

```
[Admin/Trưởng khoa] Mở app → /admin/users
        ↓
Chọn user (tìm theo email) hoặc tạo user mới
        ↓
Gán role + warehouse:
  - Chọn role: KEEPER_BULK_HC_SP / DAILY / VTYT / ...
  - Chọn warehouse tương ứng
  - Đánh dấu primary (nếu user có nhiều role)
        ↓
Hệ thống:
  - Insert vào user_warehouse_roles
  - Gửi email cho user với link kích hoạt (nếu user mới)
  - Log audit
        ↓
User nhận email → đăng nhập → đã có quyền trong kho tương ứng
```

### 3.2. Workflow thủ kho tạo sản phẩm mới

```
[Thủ kho] Mở app → /products
        ↓
Nhấn "Tạo sản phẩm mới"
        ↓
Nhập thông tin:
  - Mã sản phẩm, tên, đơn vị
  - product_group: TỰ ĐỘNG = product_group của warehouse user đang ở
    (VD: user ở BULK_HC_SP → product_group = HOA_CHAT_SINH_PHAM)
  - product_subtype, storage_condition, open_vial_stability_days (HC-SP)
  - min_stock, max_stock
        ↓
Lưu → status = ACTIVE, sẵn sàng sử dụng
        ↓
Audit log: "user X tạo sản phẩm Y"
```

### 3.3. Workflow thủ kho sửa sản phẩm

- Được sửa nếu `product_group` = mảng user phụ trách
- Không được sửa `product_group` (chỉ Admin)
- Không được xóa sản phẩm đã có lịch sử giao dịch (chỉ `is_active = false`)

---

## 4. LOGIC & RULES

### 4.1. RLS Policy tổng quát (áp dụng cho tất cả bảng)

```sql
-- Helper function: lấy product_groups user được phép thấy
CREATE OR REPLACE FUNCTION fn_user_product_groups()
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY_AGG(DISTINCT
    CASE w.role
      WHEN 'BULK_HC_SP' THEN 'HOA_CHAT_SINH_PHAM'
      WHEN 'DAILY_HC_SP' THEN 'HOA_CHAT_SINH_PHAM'
      WHEN 'BULK_VTYT' THEN 'VAT_TU_Y_TE'
      WHEN 'DAILY_VTYT' THEN 'VAT_TU_Y_TE'
    END
  )
  FROM user_warehouse_roles uwr
  JOIN warehouses w ON w.id = uwr.warehouse_id
  WHERE uwr.user_id = auth.uid()
    AND uwr.is_active = TRUE
    AND uwr.role IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP',
                     'KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT');
$$;

-- Helper function: check user có quyền trên warehouse không
CREATE OR REPLACE FUNCTION fn_user_has_warehouse_access(p_warehouse_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_warehouse_roles
    WHERE user_id = auth.uid()
      AND warehouse_id = p_warehouse_id
      AND is_active = TRUE
  )
$$;

-- Helper function: check user có role cụ thể không
CREATE OR REPLACE FUNCTION fn_user_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_warehouse_roles
    WHERE user_id = auth.uid()
      AND role = p_role
      AND is_active = TRUE
  )
  OR (auth.jwt() ->> 'role') = p_role  -- Fallback cho role global (ADMIN, DEPT_HEAD)
$$;
```

### 4.2. RLS cho `products`

```sql
-- Thủ kho thấy sản phẩm trong product_group của mình
CREATE POLICY "rls_products_keeper" ON products
  FOR ALL USING (
    product_group = ANY(fn_user_product_groups())
    OR (auth.jwt() ->> 'role') IN ('ADMIN', 'DEPT_HEAD')
  );

-- Insert: product_group tự động = group của warehouse user
CREATE POLICY "rls_products_insert" ON products
  FOR INSERT WITH CHECK (
    product_group = ANY(fn_user_product_groups())
    OR (auth.jwt() ->> 'role') = 'ADMIN'
  );
```

### 4.3. RLS cho `lots`

```sql
CREATE POLICY "rls_lots_product_group" ON lots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = lots.product_id
        AND p.product_group = ANY(fn_user_product_groups())
    )
    OR (auth.jwt() ->> 'role') IN ('ADMIN', 'DEPT_HEAD')
  );
```

### 4.4. Permission Matrix

| Resource | ADMIN | DEPT_HEAD | KEEPER (mảng của mình) | QC_OFFICER (HC-SP) |
|---|---|---|---|---|
| Products: SELECT | All | All | Mảng của mình | HC-SP |
| Products: INSERT/UPDATE | All | All | Mảng của mình (chỉ thông tin cơ bản, không đổi product_group) | - |
| Products: DELETE | Soft delete | Soft delete | - | - |
| Lots: SELECT | All | All | Mảng của mình | HC-SP |
| Lots: INSERT (GoodsReceipt) | All | All | Mảng của mình | - |
| Lots: QC duyệt | All | All | - | HC-SP |
| Lots: Open-vial | All | All | Mảng của mình | - |
| Stocktakes: SELECT | All | All | Mảng của mình (assigned) | - |
| Stocktakes: CREATE | All | All | Mảng của mình | - |
| Stocktakes: APPROVE | All | All | - | - |
| Weekly Replenishment: SELECT | All | All | Mảng của mình | - |
| Weekly Replenishment: APPROVE (>5M) | All | All | - | - |
| Monthly Replenishment: APPROVE | All | All | - | - |
| Recall: CREATE | All | All | - | - |
| Disposal: APPROVE (>5M) | All | All | - | - |
| User Management | All | All | Read-only (xem ai trong kho mình) | - |
| Audit Log | All | All | Mảng của mình | Mảng của mình |

### 4.5. Edge cases

| Tình huống | Xử lý |
|---|---|
| User có 2 role (BULK_HC_SP + DAILY_HC_SP) | Dùng `is_primary` để xác định role mặc định khi login |
| User bị xóa khỏi `user_warehouse_roles` (is_active = false) | Tự động mất quyền, nhưng giữ lịch sử audit log |
| Admin thay đổi role của user | User phải logout/login để có quyền mới (JWT refresh) |
| Thủ kho cố INSERT sản phẩm VTYT khi đang ở BULK_HC_SP | RLS reject: product_group không hợp lệ |
| Sản phẩm đã có lịch sử giao dịch không cho xóa cứng | Soft delete (is_active = false) |
| Thủ kho sửa `min_stock`/`max_stock` ảnh hưởng đề xuất tuần | Cảnh báo + audit log |
| User không có role nào | Vẫn login được nhưng chỉ thấy trang "Liên hệ Admin để được cấp quyền" |
| DEPT_HEAD mở app khi chưa có role trong user_warehouse_roles | Vẫn có quyền (vì role global trong JWT) |

---

---

## 5. SCHEMA CHI TIẾT

```sql
-- ============================================================
-- MODULES N1 + N2 + N3: WAREHOUSE ROLE + PRODUCT GROUP + PERMISSION
-- File: supabase/migrations/20260614_warehouse_role_product_group.sql
-- ============================================================

-- 5.1. Warehouse Role Enum
CREATE TYPE warehouse_role AS ENUM (
  'BULK_HC_SP',
  'DAILY_HC_SP',
  'BULK_VTYT',
  'DAILY_VTYT'
);

-- 5.2. User Role Enum (global roles)
CREATE TYPE user_global_role AS ENUM (
  'ADMIN',
  'DEPT_HEAD',
  'KEEPER_BULK_HC_SP',
  'KEEPER_DAILY_HC_SP',
  'KEEPER_BULK_VTYT',
  'KEEPER_DAILY_VTYT',
  'QC_OFFICER'
);

-- 5.3. Product Subtype Enum
CREATE TYPE product_subtype AS ENUM (
  -- HC-SP
  'REAGENT', 'CALIBRATOR', 'CONTROL', 'BUFFER', 'WASH', 'CUVETTE', 'CONSUMABLE',
  -- VTYT
  'CONSUMABLE_MEDICAL', 'REAGENT_STRIP', 'OTHER'
);

-- 5.4. Bảng warehouses (mở rộng)
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS role warehouse_role;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_tenant_role
  ON warehouses(tenant_id, role) WHERE role IS NOT NULL;

-- 5.5. Bảng products (mở rộng)
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_group TEXT
  CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_subtype product_subtype;
ALTER TABLE products ADD COLUMN IF NOT EXISTS open_vial_stability_days INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS storage_condition TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_products_group ON products(tenant_id, product_group) WHERE is_active = TRUE;

-- 5.6. Bảng user_warehouse_roles (nhiều-nhiều)
CREATE TABLE user_warehouse_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  role user_global_role NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Chỉ cho phép 1 primary role / user
  EXCLUDE USING btree (user_id WITH =, is_primary WITH =) WHERE (is_primary = TRUE),
  UNIQUE (user_id, warehouse_id, role)
);

CREATE INDEX idx_uwr_user ON user_warehouse_roles(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_uwr_warehouse ON user_warehouse_roles(warehouse_id) WHERE is_active = TRUE;
CREATE INDEX idx_uwr_role ON user_warehouse_roles(role) WHERE is_active = TRUE;

-- 5.7. Bảng user_global_roles (cho ADMIN, DEPT_HEAD, QC_OFFICER)
-- Những role này không gắn với warehouse cụ thể
CREATE TABLE user_global_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_global_role NOT NULL CHECK (role IN ('ADMIN', 'DEPT_HEAD', 'QC_OFFICER')),
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, role)
);

CREATE INDEX idx_ugr_user ON user_global_roles(user_id) WHERE is_active = TRUE;

-- 5.8. RLS
ALTER TABLE user_warehouse_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_global_roles ENABLE ROW LEVEL SECURITY;

-- Admin + DEPT_HEAD xem tất cả
CREATE POLICY "rls_uwr_admin" ON user_warehouse_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_global_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'DEPT_HEAD') AND is_active = TRUE)
  );

-- User xem role của chính mình
CREATE POLICY "rls_uwr_self" ON user_warehouse_roles
  FOR SELECT USING (user_id = auth.uid());

-- 5.9. Helper functions
CREATE OR REPLACE FUNCTION fn_user_product_groups()
RETURNS TEXT[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY_AGG(DISTINCT
    CASE w.role
      WHEN 'BULK_HC_SP' THEN 'HOA_CHAT_SINH_PHAM'
      WHEN 'DAILY_HC_SP' THEN 'HOA_CHAT_SINH_PHAM'
      WHEN 'BULK_VTYT' THEN 'VAT_TU_Y_TE'
      WHEN 'DAILY_VTYT' THEN 'VAT_TU_Y_TE'
    END
  )
  FROM user_warehouse_roles uwr
  JOIN warehouses w ON w.id = uwr.warehouse_id
  WHERE uwr.user_id = auth.uid()
    AND uwr.is_active = TRUE
    AND uwr.role IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP',
                     'KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT');
$$;

CREATE OR REPLACE FUNCTION fn_user_has_warehouse_access(p_warehouse_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_warehouse_roles
    WHERE user_id = auth.uid() AND warehouse_id = p_warehouse_id AND is_active = TRUE
  ) OR EXISTS (
    SELECT 1 FROM user_global_roles
    WHERE user_id = auth.uid() AND role IN ('ADMIN', 'DEPT_HEAD') AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION fn_user_has_role(p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_warehouse_roles
    WHERE user_id = auth.uid() AND role = p_role::user_global_role AND is_active = TRUE
  ) OR EXISTS (
    SELECT 1 FROM user_global_roles
    WHERE user_id = auth.uid() AND role = p_role::user_global_role AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION fn_user_is_admin_or_head()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_global_roles
    WHERE user_id = auth.uid() AND role IN ('ADMIN', 'DEPT_HEAD') AND is_active = TRUE
  );
$$;

-- 5.10. Trigger: tự động set is_primary = FALSE nếu user đã có primary khác
CREATE OR REPLACE FUNCTION trg_uwr_check_primary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_primary = TRUE THEN
    UPDATE user_warehouse_roles
    SET is_primary = FALSE
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_uwr_primary
  BEFORE INSERT OR UPDATE ON user_warehouse_roles
  FOR EACH ROW WHEN (NEW.is_primary = TRUE)
  EXECUTE FUNCTION trg_uwr_check_primary();

-- 5.11. View: danh sách user với roles
CREATE OR REPLACE VIEW v_user_roles AS
SELECT
  u.id AS user_id,
  u.email,
  u.raw_user_meta_data->>'full_name' AS full_name,
  COALESCE(
    (SELECT array_agg(role::TEXT) FROM user_global_roles WHERE user_id = u.id AND is_active = TRUE),
    ARRAY[]::TEXT[]
  ) AS global_roles,
  COALESCE(
    (SELECT json_agg(json_build_object(
      'role', uwr.role,
      'warehouse_id', uwr.warehouse_id,
      'warehouse_name', w.name,
      'warehouse_role', w.role,
      'is_primary', uwr.is_primary
    ))
    FROM user_warehouse_roles uwr
    JOIN warehouses w ON w.id = uwr.warehouse_id
    WHERE uwr.user_id = u.id AND uwr.is_active = TRUE),
    '[]'::json
  ) AS warehouse_roles,
  fn_user_product_groups() FILTER (WHERE u.id = auth.uid()) AS accessible_product_groups
FROM auth.users u;

-- 5.12. RLS cho warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_warehouses_all" ON warehouses;
CREATE POLICY "rls_warehouses" ON warehouses
  FOR ALL USING (
    fn_user_has_warehouse_access(id)
    OR fn_user_is_admin_or_head()
  );

-- 5.13. RLS cho products (đã có ở trên, bổ sung UPDATE)
DROP POLICY IF EXISTS "rls_products_keeper" ON products;
CREATE POLICY "rls_products_select" ON products
  FOR SELECT USING (
    product_group = ANY(fn_user_product_groups())
    OR fn_user_is_admin_or_head()
  );

CREATE POLICY "rls_products_insert" ON products
  FOR INSERT WITH CHECK (
    (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_BULK_HC_SP'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_DAILY_HC_SP'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_BULK_VTYT'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_DAILY_VTYT'))
    OR (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "rls_products_update" ON products
  FOR UPDATE USING (
    (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_BULK_HC_SP'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_DAILY_HC_SP'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_BULK_VTYT'))
    OR (product_group = ANY(fn_user_product_groups()) AND fn_user_has_role('KEEPER_DAILY_VTYT'))
    OR (auth.jwt() ->> 'role') = 'ADMIN'
  ) WITH CHECK (
    -- Không cho đổi product_group
    product_group = ANY(fn_user_product_groups())
    OR (auth.jwt() ->> 'role') = 'ADMIN'
  );

COMMENT ON TABLE user_warehouse_roles IS 'Quan hệ nhiều-nhiều user × warehouse × role (1 user có thể có nhiều role ở nhiều kho)';
COMMENT ON TABLE user_global_roles IS 'Global role không gắn với warehouse (ADMIN, DEPT_HEAD, QC_OFFICER)';
```

---

## 6. API HOOKS

```typescript
// src/lib/hooks/useRoles.ts

// QUERIES
export function useUserRoles(userId: string) { /* Lấy tất cả role của user */ }
export function useWarehouseUsers(warehouseId: string) { /* User trong 1 kho */ }
export function useAllUsers(tenantId: string) { /* Admin: tất cả user */ }
export function useCurrentUserPermissions() { /* Quyền của user hiện tại */ }

// MUTATIONS
export function useAssignUserRole() { /* Admin/DEPT_HEAD: gán role cho user */ }
export function useRemoveUserRole() { /* Xóa role (is_active = false) */ }
export function useSetPrimaryRole() { /* Đổi primary role */ }
export function useCreateUser() { /* Tạo user mới + gán role */ }

// PRODUCTS (thủ kho tự quản lý)
export function useProducts(params) { /* List */ }
export function useCreateProduct() { /* Thủ kho tạo mới (product_group auto) */ }
export function useUpdateProduct() { /* Thủ kho sửa (không đổi product_group) */ }
export function useDeactivateProduct() { /* Soft delete */ }

// EDGE FUNCTION: refresh-user-roles
// Cập nhật JWT claims khi admin thay đổi role của user
```

---

---

## 7. UI WIREFRAMES

### 7.1. Trang quản lý user `/admin/users` (Admin/DEPT_HEAD)

```
┌──────────────────────────────────────────────────────────────────┐
│  👥 Quản lý người dùng                                           │
│  Tìm kiếm: [_______]   Kho: [Tất cả ▼]   Role: [Tất cả ▼]        │
│  [+ Tạo user mới]                                                │
│                                                                  │
│  ┌─── Bảng user ────────────────────────────────────────────┐    │
│  │ Email           │ Tên        │ Global Roles │ Warehouse Roles │ │
│  │─────────────────┼────────────┼──────────────┼─────────────────│ │
│  │ nguyenvana@bv   │ Nguyễn A   │ -            │ KEEPER_BULK_HC_SP│ │
│  │                 │            │              │ @BULK_HC_SP (★) │ │
│  │                 │            │              │ KEEPER_DAILY_HC_SP│
│  │                 │            │              │ @DAILY_HC_SP    │ │
│  │ tranthib@bv     │ Trần B     │ QC_OFFICER   │ -               │ │
│  │ lanptt@bv       │ Lân PTT    │ DEPT_HEAD    │ -               │ │
│  │ admin@bv        │ Admin IT   │ ADMIN        │ -               │ │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2. Modal gán role

```
┌─────────────────────────────────────────────────┐
│  👤 Gán role cho Nguyễn Văn A                    │
│  ─────────────────────────────────────────────  │
│  Email: nguyenvana@bv                            │
│  Tên: Nguyễn Văn A                               │
│                                                  │
│  Global Role: [Không ▼]                          │
│                                                  │
│  Warehouse Roles:                                │
│  ┌────────────────────────────────────────────┐ │
│  │ Role                │ Warehouse    │ Primary│ │
│  │ KEEPER_BULK_HC_SP   │ BULK_HC_SP   │ ☑      │ │
│  │ KEEPER_DAILY_HC_SP  │ DAILY_HC_SP  │ ☐      │ │
│  │ [+ Thêm role]                              │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Ghi chú (optional):                             │
│  [Cover ca cho thủ kho lẻ vào cuối tuần______]  │
│                                                  │
│  ⓘ User sẽ nhận email kích hoạt (nếu chưa có)   │
│                                                  │
│              [Hủy]  [💾 Lưu]                    │
└─────────────────────────────────────────────────┘
```

### 7.3. Trang sản phẩm `/products` (Thủ kho tự quản lý)

```
┌──────────────────────────────────────────────────────────────────┐
│  📦 Sản phẩm                                                     │
│  Lọc: [HC-SP] [VTYT] [Tất cả]   Tìm: [_____]                    │
│  [+ Tạo sản phẩm] (chỉ tạo được trong mảng mình)                │
│                                                                  │
│  ┌─── Bảng sản phẩm ────────────────────────────────────────┐  │
│  │ Mã      │ Tên        │ Subtype │ Đơn vị │ Min/Max │ Active│  │
│  │─────────┼────────────┼─────────┼────────┼─────────┼───────│  │
│  │ HO-001  │ Glucose    │ REAGENT │ chai   │ 10/20   │ ✓     │  │
│  │ HO-002  │ Urea       │ REAGENT │ chai   │ 12/20   │ ✓     │  │
│  │ HO-003  │ HBsAg Test │ REAGENT │ test   │ 15/30   │ ✓     │  │
│  │ HO-004  │ Control L1 │ CONTROL │ chai   │ 5/10    │ ✓     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⓘ Bạn chỉ thấy sản phẩm trong mảng mình phụ trách             │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4. Modal tạo/sửa sản phẩm

```
┌─────────────────────────────────────────────────┐
│  📦 Tạo sản phẩm mới                              │
│  ─────────────────────────────────────────────  │
│  Product Group: HOA_CHAT_SINH_PHAM (auto, không sửa)│
│                                                  │
│  Mã sản phẩm *: [HO-005____________]            │
│  Tên sản phẩm *: [HbA1c Test Kit_____]         │
│  Subtype: [REAGENT ▼]                           │
│  Đơn vị: [test]                                  │
│                                                  │
│  Min stock: [____5____]   Max stock: [____20____]│
│  Storage: [REFRIGERATED ▼]                       │
│  Open-vial stability (ngày): [___30___]          │
│                                                  │
│  ☑ Active                                        │
│                                                  │
│  ⓘ Subtype và Open-vial stability có thể sửa sau│
│                                                  │
│              [Hủy]  [💾 Lưu]                    │
└─────────────────────────────────────────────────┘
```

---

## 8. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| 2 admin cùng gán role cho 1 user | Optimistic lock + check `updated_at` |
| User bị xóa khỏi `user_warehouse_roles` nhưng JWT cũ vẫn còn | Refresh token (tự động) hoặc logout/login |
| Thủ kho BULK_HC_SP cố tạo sản phẩm VTYT | RLS reject |
| User ở 2 kho (BULK + DAILY cùng mảng) tạo 2 sản phẩm cùng mã | UNIQUE constraint trên (tenant_id, code) |
| Sản phẩm đã có giao dịch bị deactivate | Soft delete OK, nhưng không thể reactivate (tránh lịch sử giả) |
| Thủ kho sửa min/max stock làm ảnh hưởng đề xuất tuần đang chạy | Cron sẽ pick up giá trị mới ở lần chạy sau |
| Admin thay đổi primary role của user đang login | User phải logout/login để thấy thay đổi |
| User mới tạo chưa có role | Vẫn login được, thấy trang "Liên hệ Admin" |
| Đổi từ KEEPER sang DEPT_HEAD | Auto remove khỏi user_warehouse_roles + add vào user_global_roles |
| Sản phẩm có product_group không khớp warehouse | Validation fail khi tạo |

---

## 9. ACCEPTANCE CRITERIA

### 9.1. Functional
- [ ] **AC-1**: Admin/DEPT_HEAD tạo user + gán role thành công
- [ ] **AC-2**: 1 user có thể có nhiều role ở nhiều warehouse
- [ ] **AC-3**: Primary role hoạt động đúng (chỉ 1 primary / user)
- [ ] **AC-4**: Thủ kho tạo sản phẩm mới trong mảng mình
- [ ] **AC-5**: Thủ kho không thể tạo sản phẩm ngoài mảng (RLS chặn)
- [ ] **AC-6**: Thủ kho không thể đổi product_group
- [ ] **AC-7**: DEPT_HEAD xem được tất cả 4 kho + audit log
- [ ] **AC-8**: RLS chặn đúng: HC-SP thủ kho không thấy VTYT data
- [ ] **AC-9**: Soft delete sản phẩm (không xóa cứng nếu đã có lịch sử)
- [ ] **AC-10**: Audit log cho mọi thay đổi role + master data

### 9.2. Non-functional
- [ ] **AC-11**: Performance: RLS overhead < 50ms
- [ ] **AC-12**: UI load < 2 giây
- [ ] **AC-13**: Mobile responsive

### 9.3. Test cases
| # | Test case | Expected |
|---|---|---|
| TC-1 | Admin tạo user A + gán KEEPER_BULK_HC_SP | User A nhận email, login thấy dashboard BULK_HC_SP |
| TC-2 | Gán thêm KEEPER_DAILY_HC_SP cho user A | User A thấy thêm menu DAILY_HC_SP |
| TC-3 | Set is_primary = DAILY | Menu mặc định chuyển sang DAILY |
| TC-4 | Thủ kho BULK_HC_SP tạo sản phẩm VTYT | RLS reject |
| TC-5 | Thủ kho sửa product_group từ HC-SP → VTYT | WITH CHECK fail |
| TC-6 | Thủ kho VTYT query products WHERE product_group='HC-SP' | Trả về 0 rows |
| TC-7 | DEPT_HEAD login, mở dashboard | Thấy cả 4 kho + 2 mảng |
| TC-8 | User không có role login | Thấy trang "Liên hệ Admin" |
| TC-9 | Admin deactivate sản phẩm đã có lịch sử | is_active=false, lịch sử giữ nguyên |
| TC-10 | Admin reactivate sản phẩm đã deactivate | is_active=true, sản phẩm xuất hiện lại |
| TC-11 | 2 admin cùng sửa role của 1 user | Optimistic lock, người thứ 2 nhận conflict |
| TC-12 | User A bị xóa khỏi warehouse, JWT cũ vẫn còn | Sau khi refresh token, mất quyền |

---

## PHỤ LỤC

### A. Effort estimate
- Schema + RLS + helper functions: 1 tuần
- Auth Hook update JWT claims: 0.5 tuần
- API hooks: 0.5 tuần
- UI (admin user management + product CRUD): 1 tuần
- Testing RLS: 0.5 tuần
- **Tổng: 3.5 tuần** (cao vì ảnh hưởng tất cả modules khác)

### B. Phụ thuộc (rất quan trọng - là module NỀN TẢNG)
- Tất cả modules khác phụ thuộc: SPEC #1, #2, #3, #4, #6, #7, #8
- Phải làm ĐẦU TIÊN trong P0
- Sau khi xong, cần update RLS của tất cả bảng hiện có

### C. Câu hỏi mở
- Có cần hỗ trợ "Acting role" (user tạm thời đảm nhận role khác khi cover)?
- Số lượng user tối đa / tenant (để tối ưu performance)?
- Có cần audit log chi tiết cho việc đổi role (vd: thay đổi primary)?
- Tích hợp với LDAP/Active Directory của BV (dùng SSO)?

---

**Người viết**: Claude
**Ngày**: 2026-06-14
**Trạng thái**: ⏸️ CHỜ USER REVIEW


