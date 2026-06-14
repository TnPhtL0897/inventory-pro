-- =============================================================================
-- Khoa XN — Module 1: Helper functions cho phân quyền theo product_group
-- File: supabase/migrations/20260614140000_khoa_xn_helper_functions.sql
--
-- Dựa trên JWT claim `role_codes` (đã inject bởi Auth Hook ở
-- 20260613160000_auth_hook_tenant_claim.sql), cung cấp:
--   - fn_user_product_groups(): TEXT[] - danh sách product_group user được thấy
--   - fn_user_has_role(p_role): boolean - check role cụ thể
--   - fn_user_is_admin_or_head(): boolean - check ADMIN hoặc DEPT_HEAD
--   - fn_user_warehouse_role(p_warehouse_id): warehouse_role - role user tại 1 kho
--
-- Performance: đọc từ JWT (current_setting) nên RLS không phải JOIN bảng mỗi query.
-- =============================================================================

-- 1. Helper: đọc role_codes từ JWT (an toàn khi JWT không có claim)
CREATE OR REPLACE FUNCTION fn_auth_role_codes()
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(
          (auth.jwt() -> 'app_metadata' -> 'role_codes'),
          (auth.jwt() -> 'role_codes'),
          '[]'::jsonb
        )
      )
    ),
    ARRAY[]::TEXT[]
  );
$$;

-- 2. Helper: đọc branch_ids từ JWT
CREATE OR REPLACE FUNCTION fn_auth_branch_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(
          (auth.jwt() -> 'app_metadata' -> 'branch_ids'),
          (auth.jwt() -> 'branch_ids'),
          '[]'::jsonb
        )
      )::uuid
    ),
    ARRAY[]::UUID[]
  );
$$;

-- 3. fn_user_product_groups: trả về product_groups user được phép thấy
-- Logic:
--   - ADMIN / DEPT_HEAD / QC_OFFICER: xem cả 2 ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')
--   - KEEPER_BULK_HC_SP / KEEPER_DAILY_HC_SP: 'HOA_CHAT_SINH_PHAM'
--   - KEEPER_BULK_VTYT / KEEPER_DAILY_VTYT: 'VAT_TU_Y_TE'
--   - Khác: rỗng (không thấy gì)
CREATE OR REPLACE FUNCTION fn_user_product_groups()
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
  WITH codes AS (SELECT unnest(fn_auth_role_codes()) AS code)
  SELECT ARRAY(
    SELECT DISTINCT g
    FROM codes c
    CROSS JOIN LATERAL (
      VALUES
        ('HOA_CHAT_SINH_PHAM'),
        ('VAT_TU_Y_TE')
      ) AS all_groups(g)
    WHERE
      -- Admin/Head/QC: tất cả
      c.code IN ('ADMIN', 'DEPT_HEAD', 'QC_OFFICER')
      -- HC-SP keeper
      OR (c.code IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP') AND g = 'HOA_CHAT_SINH_PHAM')
      -- VTYT keeper
      OR (c.code IN ('KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT') AND g = 'VAT_TU_Y_TE')
  );
$$;

-- 4. fn_user_has_role: check role cụ thể
CREATE OR REPLACE FUNCTION fn_user_has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT p_role = ANY(fn_auth_role_codes());
$$;

-- 5. fn_user_is_admin_or_head
CREATE OR REPLACE FUNCTION fn_user_is_admin_or_head()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT fn_user_has_role('ADMIN') OR fn_user_has_role('DEPT_HEAD');
$$;

-- 6. fn_user_warehouse_role: lấy role user tại 1 kho cụ thể
-- Trả về warehouse_role nếu user có quyền ở kho đó, NULL nếu không
CREATE OR REPLACE FUNCTION fn_user_warehouse_role(p_warehouse_id UUID)
RETURNS warehouse_role
LANGUAGE sql
STABLE
AS $$
  SELECT w.role
  FROM warehouses w
  WHERE w.id = p_warehouse_id
    AND (
      -- Admin/Head: tất cả
      fn_user_is_admin_or_head()
      -- HC-SP keeper: thấy warehouses có role BULK_HC_SP/DAILY_HC_SP
      OR (w.role IN ('BULK_HC_SP', 'DAILY_HC_SP')
          AND (fn_user_has_role('KEEPER_BULK_HC_SP') OR fn_user_has_role('KEEPER_DAILY_HC_SP')))
      -- VTYT keeper
      OR (w.role IN ('BULK_VTYT', 'DAILY_VTYT')
          AND (fn_user_has_role('KEEPER_BULK_VTYT') OR fn_user_has_role('KEEPER_DAILY_VTYT')))
      -- QC officer: thấy HC-SP warehouses
      OR (w.role IN ('BULK_HC_SP', 'DAILY_HC_SP') AND fn_user_has_role('QC_OFFICER'))
    )
  LIMIT 1;
$$;

-- 7. Helper cho insert products: tự động gán product_group từ role user
-- (Dùng trong API hook hoặc trigger nếu cần)
CREATE OR REPLACE FUNCTION fn_default_product_group()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  WITH groups AS (SELECT unnest(fn_user_product_groups()) AS g)
  SELECT g FROM groups
  WHERE g IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')
  ORDER BY g  -- ưu tiên HC-SP
  LIMIT 1;
$$;

-- 8. Grant
GRANT EXECUTE ON FUNCTION fn_auth_role_codes() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_auth_branch_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_user_product_groups() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_user_has_role(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_user_is_admin_or_head() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_user_warehouse_role(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_default_product_group() TO authenticated, anon;

-- 9. Comments
COMMENT ON FUNCTION fn_user_product_groups() IS
  'Trả về danh sách product_group user được phép thấy (dựa trên JWT role_codes).';
COMMENT ON FUNCTION fn_user_has_role(TEXT) IS
  'Check user có role cụ thể trong JWT claim role_codes.';
COMMENT ON FUNCTION fn_user_warehouse_role(UUID) IS
  'Trả về warehouse_role nếu user có quyền ở warehouse_id, NULL nếu không.';
