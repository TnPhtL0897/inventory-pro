-- =============================================================================
-- Khoa XN — Module 1: Update RLS cho products + warehouses theo product_group
-- File: supabase/migrations/20260614150000_update_rls_for_khoa_xn.sql
--
-- Giữ nguyên 3 policy chuẩn hiện có (service_role, tenant_isolation, tenant_write).
-- Thêm các policy mới cho Khoa XN:
--   - products: thủ kho chỉ thấy product_group của mình (KEEP existing tenant policies intact)
--   - warehouses: thủ kho chỉ thấy warehouses có role phù hợp
--
-- Lưu ý: Dùng CREATE POLICY IF NOT EXISTS pattern bằng DO block
-- (PostgreSQL chưa hỗ trợ IF NOT EXISTS cho CREATE POLICY trực tiếp).
-- =============================================================================

-- =============================================================================
-- 1. PRODUCTS: thêm RLS filter theo product_group
-- =============================================================================

-- SELECT: thủ kho chỉ thấy product_group của mình
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products_keeper_product_group'
  ) THEN
    CREATE POLICY products_keeper_product_group
      ON products FOR SELECT
      USING (
        -- Admin/Head thấy tất cả (qua tenant_isolation policy)
        -- Thủ kho: thấy product_group trong product_groups của mình
        product_group = ANY(fn_user_product_groups())
        -- NULL product_group (sản phẩm cũ): vẫn thấy cho Admin/Head
        OR product_group IS NULL
      );
  END IF;
END $$;

-- INSERT: thủ kho chỉ insert được product_group của mình
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products_keeper_insert'
  ) THEN
    CREATE POLICY products_keeper_insert
      ON products FOR INSERT
      WITH CHECK (
        -- Admin/Head: tất cả (qua tenant_write policy)
        -- Thủ kho: chỉ insert product_group của mình
        product_group = ANY(fn_user_product_groups())
        OR product_group IS NULL  -- Cho phép insert NULL (sẽ update sau)
      );
  END IF;
END $$;

-- UPDATE: thủ kho chỉ update sản phẩm product_group của mình
-- VÀ không được đổi product_group sang group khác
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products_keeper_update'
  ) THEN
    CREATE POLICY products_keeper_update
      ON products FOR UPDATE
      USING (
        -- Có quyền xem (SELECT policy)
        product_group = ANY(fn_user_product_groups())
        OR product_group IS NULL
      )
      WITH CHECK (
        -- Không được đổi sang product_group ngoài quyền
        -- (new.product_group phải trong product_groups của user)
        product_group = ANY(fn_user_product_groups())
        OR product_group IS NULL
      );
  END IF;
END $$;

-- =============================================================================
-- 2. WAREHOUSES: thêm RLS filter theo role
-- =============================================================================

-- SELECT: thủ kho chỉ thấy warehouses có role phù hợp
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouses'
      AND policyname = 'warehouses_keeper_role'
  ) THEN
    CREATE POLICY warehouses_keeper_role
      ON warehouses FOR SELECT
      USING (
        -- Admin/Head thấy tất cả (qua tenant_isolation policy)
        -- Thủ kho: chỉ thấy warehouses có role phù hợp với product_groups của mình
        (
          (role IN ('BULK_HC_SP', 'DAILY_HC_SP') AND 'HOA_CHAT_SINH_PHAM' = ANY(fn_user_product_groups()))
          OR (role IN ('BULK_VTYT', 'DAILY_VTYT') AND 'VAT_TU_Y_TE' = ANY(fn_user_product_groups()))
        )
        -- NULL role (kho cũ không phải Khoa XN): tất cả thấy
        OR role IS NULL
        -- QC officer thấy HC-SP warehouses
        OR (role IN ('BULK_HC_SP', 'DAILY_HC_SP') AND fn_user_has_role('QC_OFFICER'))
      );
  END IF;
END $$;

-- INSERT: chỉ Admin/Head insert warehouses mới
-- (Policy tenant_write hiện tại đã cho phép UPDATE/INSERT, ta KHÔNG cần thêm.
-- Nếu muốn hạn chế chỉ Admin/Head INSERT warehouse mới, làm sau.)

-- =============================================================================
-- 3. USER_ROLES: cho phép user xem roles của chính mình + Admin/DEPT_HEAD xem tất cả
-- =============================================================================

-- Hiện tại đã có policy user_roles_isolation (SELECT) + user_roles_write (ALL)
-- Thêm policy: user thường xem được roles của mình
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'user_roles_self_view'
  ) THEN
    CREATE POLICY user_roles_self_view
      ON user_roles FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- 4. USERS: cho phép user xem thông tin user khác trong cùng tenant
-- (Hiện chỉ có users_self_update - thiếu SELECT policy)
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_tenant_view'
  ) THEN
    CREATE POLICY users_tenant_view
      ON users FOR SELECT
      USING (tenant_id = auth_tenant_id());
  END IF;
END $$;

-- =============================================================================
-- 5. ROLES: cho phép user xem roles trong tenant
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'roles'
      AND policyname = 'roles_tenant_view'
  ) THEN
    CREATE POLICY roles_tenant_view
      ON roles FOR SELECT
      USING (tenant_id = auth_tenant_id());
  END IF;
END $$;

-- =============================================================================
-- 6. Comments
-- =============================================================================

COMMENT ON POLICY products_keeper_product_group ON products IS
  'Khoa XN: thủ kho chỉ thấy sản phẩm trong product_group của mình.';
COMMENT ON POLICY products_keeper_insert ON products IS
  'Khoa XN: thủ kho chỉ insert được sản phẩm product_group của mình.';
COMMENT ON POLICY products_keeper_update ON products IS
  'Khoa XN: thủ kho không được đổi product_group sang mảng khác.';
COMMENT ON POLICY warehouses_keeper_role ON warehouses IS
  'Khoa XN: thủ kho chỉ thấy warehouses có role phù hợp với product_group của mình.';
COMMENT ON POLICY user_roles_self_view ON user_roles IS
  'User xem được roles của chính mình (ngoài Admin/DEPT_HEAD xem tất cả).';
COMMENT ON POLICY users_tenant_view ON users IS
  'User xem được thông tin user khác trong cùng tenant (cho admin user management).';
COMMENT ON POLICY roles_tenant_view ON roles IS
  'User xem được roles trong cùng tenant (cho admin user management).';
