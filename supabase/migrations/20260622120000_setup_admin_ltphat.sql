-- =============================================================================
-- Setup Admin User: ltphat.bv@ctump.edu.vn
-- File: supabase/migrations/20260622120000_setup_admin_ltphat.sql
--
-- User đã được tạo qua Edge Function invite-user. File SQL này dùng để:
-- 1. Verify user + roles đã tồn tại
-- 2. Gán thêm warehouse_roles (4 kho Khoa XN) nếu cần
-- 3. Gán thêm QC_OFFICER role
--
-- Sau khi apply, user cần:
-- - Login lần đầu với password 'Welcome@2026'
-- - Logout/login để JWT claim cập nhật (Auth Hook sẽ tự inject roles)
--
-- NOTE: User đã được tạo qua Edge Function (đã có auth_user_id:
-- 4e9d3ca1-f61f-469a-8216-9efc00ed3bf7). Nếu Edge Function fail, có thể
-- tạo user qua Dashboard Authentication → Users → Add user.
-- =============================================================================

-- =============================================================================
-- 1. Verify user đã tồn tại
-- =============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  SELECT id, email INTO v_user_id, v_email
  FROM auth.users
  WHERE email = 'ltphat.bv@ctump.edu.vn';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User ltphat.bv@ctump.edu.vn chưa tồn tại! Tạo qua Dashboard Authentication trước.';
  END IF;

  RAISE NOTICE '✅ Tìm thấy user: % (id=%)', v_email, v_user_id;
END $$;

-- =============================================================================
-- 2. Verify global roles (ADMIN + DEPT_HEAD đã được gán qua Edge Function)
-- =============================================================================

SELECT
  u.email,
  array_agg(r.code ORDER BY r.code) AS global_roles,
  COUNT(*) AS role_count
FROM auth.users u
JOIN user_global_roles ugr ON ugr.user_id = u.id
JOIN roles r ON r.id = ugr.role_id
WHERE u.email = 'ltphat.bv@ctump.edu.vn'
GROUP BY u.email;

-- =============================================================================
-- 3. (Optional) Gán thêm QC_OFFICER role nếu muốn
-- =============================================================================

INSERT INTO user_global_roles (user_id, role_id, tenant_id, granted_at, granted_by)
SELECT
  u.id,
  r.id,
  (SELECT id FROM tenants LIMIT 1),
  now(),
  u.id  -- self-grant
FROM auth.users u
CROSS JOIN roles r
WHERE u.email = 'ltphat.bv@ctump.edu.vn'
  AND r.code = 'QC_OFFICER'
ON CONFLICT (user_id, role_id, branch_id) DO NOTHING;

-- =============================================================================
-- 4. (Optional) Gán warehouse roles cho 4 kho Khoa XN
-- =============================================================================
-- Branch ID mặc định: '00000000-0000-0000-0000-000000000002' (CTUMP main)

DO $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_branch_id UUID;
  v_count INT := 0;
  v_role RECORD;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'ltphat.bv@ctump.edu.vn';
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  SELECT id INTO v_branch_id FROM branches WHERE tenant_id = v_tenant_id LIMIT 1;

  IF v_user_id IS NULL OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'User hoặc branch chưa tồn tại';
  END IF;

  -- Gán 4 warehouse roles
  FOR v_role IN
    SELECT id, code FROM roles
    WHERE code IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP',
                   'KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT')
  LOOP
    INSERT INTO user_warehouse_roles (user_id, role_id, branch_id, tenant_id, granted_at, granted_by)
    VALUES (v_user_id, v_role.id, v_branch_id, v_tenant_id, now(), v_user_id)
    ON CONFLICT (user_id, role_id, branch_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '✅ Đã gán % warehouse roles cho user', v_count;
END $$;

-- =============================================================================
-- 5. Verify final state
-- =============================================================================

SELECT
  u.email,
  u.raw_user_meta_data->>'full_name' AS full_name,
  u.created_at,
  u.last_sign_in_at,
  (
    SELECT array_agg(r.code ORDER BY r.code)
    FROM user_global_roles ugr
    JOIN roles r ON r.id = ugr.role_id
    WHERE ugr.user_id = u.id
  ) AS global_roles,
  (
    SELECT array_agg(r.code ORDER BY r.code)
    FROM user_warehouse_roles uwr
    JOIN roles r ON r.id = uwr.role_id
    WHERE uwr.user_id = u.id
  ) AS warehouse_roles
FROM auth.users u
WHERE u.email = 'ltphat.bv@ctump.edu.vn';

-- =============================================================================
-- 6. Verify Auth Hook claim sẽ trả về (sau khi user login)
-- =============================================================================
-- Auth Hook sẽ tự động inject role_codes vào JWT. Verify bằng cách:
-- 1. User login tại https://quankho.pages.dev/login
-- 2. Click "Profile" → xem JWT
-- 3. Decode JWT → kiểm tra claim "role_codes" có chứa: ADMIN, DEPT_HEAD,
--    QC_OFFICER, KEEPER_BULK_HC_SP, KEEPER_DAILY_HC_SP, KEEPER_BULK_VTYT,
--    KEEPER_DAILY_VTYT

-- =============================================================================
-- Setup complete!
-- =============================================================================
-- User: ltphat.bv@ctump.edu.vn
-- Password tạm: Welcome@2026 (phải đổi khi login lần đầu)
-- Roles:
--   - Global: ADMIN, DEPT_HEAD, QC_OFFICER
--   - Warehouse: KEEPER_BULK_HC_SP, KEEPER_DAILY_HC_SP, KEEPER_BULK_VTYT, KEEPER_DAILY_VTYT
-- Hướng dẫn:
--   1. Login tại https://quankho.pages.dev/login
--   2. Click "Quên mật khẩu" hoặc dùng password tạm Welcome@2026
--   3. Sau khi login thành công, JWT sẽ có đầy đủ role_codes
-- =============================================================================
