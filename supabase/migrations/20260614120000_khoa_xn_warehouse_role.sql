-- =============================================================================
-- Khoa XN — Module 1: Warehouse Role enum
-- File: supabase/migrations/20260614120000_khoa_xn_warehouse_role.sql
--
-- Thêm warehouse_role enum + cột `role` vào bảng warehouses.
-- Áp dụng cho Khoa Xét Nghiệm (4 kho: BULK/DAILY × HC-SP/VTYT).
-- Cột này NULL cho các kho không phải Khoa XN (backward compatible).
-- =============================================================================

-- 1. Tạo enum
DO $$ BEGIN
  CREATE TYPE warehouse_role AS ENUM (
    'BULK_HC_SP',     -- Kho chẵn Hóa chất - Sinh phẩm
    'DAILY_HC_SP',    -- Kho lẻ Hóa chất - Sinh phẩm
    'BULK_VTYT',      -- Kho chẵn Vật tư y tế
    'DAILY_VTYT'      -- Kho lẻ Vật tư y tế
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Thêm cột role (nullable để backward compatible với kho cũ)
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS role warehouse_role;

-- 3. Index cho query theo role (dùng trong RLS)
CREATE INDEX IF NOT EXISTS idx_warehouses_role
  ON warehouses(tenant_id, role)
  WHERE role IS NOT NULL;

-- 4. Unique constraint: 1 tenant chỉ có 1 kho cho mỗi role
-- (Đảm bảo khoa XN có đúng 4 kho chuẩn)
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_tenant_role
  ON warehouses(tenant_id, role)
  WHERE role IS NOT NULL;

-- 5. Cập nhật comment
COMMENT ON COLUMN warehouses.role IS
  'Khoa XN: BULK_HC_SP/DAILY_HC_SP/BULK_VTYT/DAILY_VTYT. NULL cho kho không phải Khoa XN.';

-- 6. Trigger: tự động set is_default = false khi warehouse có role mới được tạo
-- (Khoa XN chỉ cần 1 kho mặc định duy nhất, các kho còn lại phải để user chọn)
-- Không tự động - để user tự quyết định trong UI.

-- 7. Grant
GRANT USAGE ON TYPE warehouse_role TO authenticated, anon;
