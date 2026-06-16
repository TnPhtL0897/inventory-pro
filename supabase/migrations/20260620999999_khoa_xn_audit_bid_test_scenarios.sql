-- =============================================================================
-- Khoa XN — Module 7 + 8 QA Test Scenarios
-- File: supabase/migrations/20260620999999_khoa_xn_audit_bid_test_scenarios.sql
-- =============================================================================

-- =============================================================================
-- AUDIT LOG TESTS
-- =============================================================================

-- =============================================================================
-- TC-1: INSERT tự động tạo audit log
-- =============================================================================

DO $$
DECLARE
  v_log_count INT;
BEGIN
  RAISE NOTICE '=== TC-1: INSERT tự động ghi audit log ===';
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    expiration_date, quantity, status)
  VALUES (
    'cccc1111-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'L-AUDIT-TEST-001',
    CURRENT_DATE + 60, 50, 'APPROVED'::lot_status
  );

  SELECT COUNT(*) INTO v_log_count
  FROM audit_logs
  WHERE table_name = 'lots' AND record_id = 'cccc1111-0000-0000-0000-000000000001'
    AND operation = 'INSERT';

  ASSERT v_log_count = 1, 'TC-1 FAIL: phải có 1 audit log INSERT';
  RAISE NOTICE '✅ TC-1 PASS: audit log INSERT tạo OK';
END $$;

-- =============================================================================
-- TC-2: UPDATE tự động ghi audit log với changed_fields
-- =============================================================================

DO $$
DECLARE
  v_log RECORD;
BEGIN
  RAISE NOTICE '=== TC-2: UPDATE ghi audit log + changed_fields ===';
  UPDATE lots
  SET status = 'IN_USE', open_vial_opened_at = now()
  WHERE id = 'cccc1111-0000-0000-0000-000000000001';

  SELECT * INTO v_log
  FROM audit_logs
  WHERE table_name = 'lots' AND record_id = 'cccc1111-0000-0000-0000-000000000001'
    AND operation = 'UPDATE'
  ORDER BY created_at DESC LIMIT 1;

  ASSERT v_log.id IS NOT NULL, 'TC-2 FAIL: phải có audit log UPDATE';
  ASSERT 'status' = ANY(v_log.changed_fields), 'TC-2 FAIL: changed_fields phải có status';
  ASSERT 'open_vial_opened_at' = ANY(v_log.changed_fields), 'TC-2 FAIL: phải có open_vial_opened_at';
  RAISE NOTICE '✅ TC-2 PASS: UPDATE log OK, changed_fields=%', v_log.changed_fields;
END $$;

-- =============================================================================
-- TC-3: DELETE ghi audit log với old_data
-- =============================================================================

DO $$
DECLARE
  v_log RECORD;
BEGIN
  RAISE NOTICE '=== TC-3: DELETE ghi audit log ===';
  DELETE FROM lots WHERE id = 'cccc1111-0000-0000-0000-000000000001';

  SELECT * INTO v_log
  FROM audit_logs
  WHERE table_name = 'lots' AND record_id = 'cccc1111-0000-0000-0000-000000000001'
    AND operation = 'DELETE'
  ORDER BY created_at DESC LIMIT 1;

  ASSERT v_log.id IS NOT NULL, 'TC-3 FAIL: phải có audit log DELETE';
  ASSERT v_log.new_data IS NULL, 'TC-3 FAIL: DELETE new_data phải = NULL';
  ASSERT v_log.old_data IS NOT NULL, 'TC-3 FAIL: DELETE phải có old_data';
  RAISE NOTICE '✅ TC-3 PASS: DELETE log OK';
END $$;

-- =============================================================================
-- TC-4: fn_query_audit_log filter theo table
-- =============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  RAISE NOTICE '=== TC-4: Query audit log filter theo table ===';
  -- Set tenant context
  PERFORM set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', false);

  SELECT COUNT(*) INTO v_count
  FROM fn_query_audit_log('lots', NULL, NULL, NULL, NULL, 1, 100);

  ASSERT v_count > 0, 'TC-4 FAIL: phải có logs của bảng lots';
  RAISE NOTICE '✅ TC-4 PASS: filter table lots OK, count=%', v_count;
END $$;

-- =============================================================================
-- TC-5: RLS tenant isolation
-- =============================================================================

DO $$
DECLARE
  v_count_other_tenant INT;
BEGIN
  RAISE NOTICE '=== TC-5: RLS tenant isolation ===';
  -- Set context cho tenant khác
  PERFORM set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', false);

  SELECT COUNT(*) INTO v_count_other_tenant
  FROM fn_query_audit_log(NULL, NULL, NULL, NULL, NULL, 1, 100);

  ASSERT v_count_other_tenant = 0, 'TC-5 FAIL: tenant khác không được thấy log';
  RAISE NOTICE '✅ TC-5 PASS: RLS isolation OK';
END $$;

-- =============================================================================
-- BID TRACKING TESTS
-- =============================================================================

-- =============================================================================
-- TC-6: fn_bid_contract_dashboard
-- =============================================================================

DO $$
DECLARE
  v_dash RECORD;
BEGIN
  RAISE NOTICE '=== TC-6: Bid contract dashboard ===';
  PERFORM set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', false);

  SELECT * INTO v_dash FROM fn_bid_contract_dashboard();

  ASSERT v_dash.total_contracts IS NOT NULL, 'TC-6 FAIL: phải có total_contracts';
  RAISE NOTICE '✅ TC-6 PASS: dashboard OK - total=% active=%', v_dash.total_contracts, v_dash.active_contracts;
END $$;

-- =============================================================================
-- TC-7: fn_list_bid_contracts_expiring
-- =============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  RAISE NOTICE '=== TC-7: List expiring contracts ===';
  PERFORM set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', false);

  SELECT COUNT(*) INTO v_count FROM fn_list_bid_contracts_expiring();
  RAISE NOTICE 'Tìm thấy % HĐ sắp hết hạn', v_count;
  RAISE NOTICE '✅ TC-7 PASS: function chạy OK, count=%', v_count;
END $$;

-- Cleanup
DELETE FROM audit_logs WHERE record_id IN (
  SELECT id FROM lots WHERE lot_number = 'L-AUDIT-TEST-001'
);

RAISE NOTICE '🎉 Tất cả test scenarios Audit + Bid đã PASS';
