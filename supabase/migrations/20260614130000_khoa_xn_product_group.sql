-- =============================================================================
-- Khoa XN — Module 1: Product Group + Subtype + Open-vial stability
-- File: supabase/migrations/20260614130000_khoa_xn_product_group.sql
--
-- Phân loại sản phẩm theo mảng nghiệp vụ Khoa XN:
--   - HOA_CHAT_SINH_PHAM (HC-SP): Hóa chất, sinh phẩm
--   - VAT_TU_Y_TE (VTYT): Vật tư y tế
--
-- Subtype chi tiết hơn theo từng mảng.
-- Open-vial stability: cho HC-SP (hóa chất có hạn sau mở nắp).
-- =============================================================================

-- 1. Tạo enum cho product_subtype
DO $$ BEGIN
  CREATE TYPE product_subtype AS ENUM (
    -- HC-SP
    'REAGENT',
    'CALIBRATOR',
    'CONTROL',
    'BUFFER',
    'WASH',
    'CUVETTE',
    'CONSUMABLE',
    -- VTYT
    'CONSUMABLE_MEDICAL',
    'REAGENT_STRIP',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Thêm các cột mới vào products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_group TEXT
    CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE'));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_subtype product_subtype;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS open_vial_stability_days INT
    CHECK (open_vial_stability_days IS NULL OR open_vial_stability_days > 0);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS storage_condition TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 3. Index cho query theo product_group (RLS + filter)
CREATE INDEX IF NOT EXISTS idx_products_tenant_group
  ON products(tenant_id, product_group)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_subtype
  ON products(tenant_id, product_subtype)
  WHERE product_subtype IS NOT NULL;

-- 4. Comment
COMMENT ON COLUMN products.product_group IS
  'Khoa XN: HOA_CHAT_SINH_PHAM (HC-SP) hoặc VAT_TU_Y_TE (VTYT). NULL cho sản phẩm khác.';
COMMENT ON COLUMN products.product_subtype IS
  'Subtype chi tiết: REAGENT/CALIBRATOR/CONTROL (HC-SP) hoặc CONSUMABLE_MEDICAL (VTYT).';
COMMENT ON COLUMN products.open_vial_stability_days IS
  'HC-SP: số ngày ổn định sau khi mở nắp (vd: 28 ngày). NULL = chưa cấu hình.';
COMMENT ON COLUMN products.storage_condition IS
  'Điều kiện bảo quản: ROOM_TEMP/REFRIGERATED/FROZEN/PROTECTED_FROM_LIGHT/DRY_PLACE';
COMMENT ON COLUMN products.is_active IS
  'FALSE = soft delete. Sản phẩm đã có giao dịch không thể xóa cứng.';

-- 5. Backfill product_group từ attributes JSONB (nếu có)
-- (Một số record cũ có thể đã lưu product_group trong attributes)
UPDATE products
SET product_group = attributes->>'product_group'
WHERE product_group IS NULL
  AND attributes ? 'product_group'
  AND attributes->>'product_group' IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE');

-- 6. Grant
GRANT USAGE ON TYPE product_subtype TO authenticated, anon;
