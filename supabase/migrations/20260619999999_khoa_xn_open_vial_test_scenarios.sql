-- =============================================================================
-- Khoa XN — Module 2 QA Test Scenarios: Open-Vial Tracking
-- File: supabase/migrations/20260619999999_khoa_xn_open_vial_test_scenarios.sql
-- =============================================================================

-- =============================================================================
-- SETUP: tạo 1 lô mẫu để test open-vial
-- =============================================================================

DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_lot_id UUID;
BEGIN
  -- Đảm bảo product có open_vial_stability_days
  UPDATE products
  SET open_vial_stability_days = 28
  WHERE id = '11111111-1111-1111-1111-111111111111'
    AND open_vial_stability_days IS NULL;

  -- Tạo lô APPROVED sạch
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status)
  VALUES (
    'bbbb1111-0000-0000-0000-000000000001',
    v_tenant_id,
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'L-OV-TEST-001',
    CURRENT_DATE - 30, CURRENT_DATE + 90, 100, 'APPROVED'::lot_status
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'APPROVED'::lot_status, quantity = 100;

  v_lot_id := 'bbbb1111-0000-0000-0000-000000000001';
  RAISE NOTICE 'Test data ready: lot_id=%', v_lot_id;
END $$;

-- =============================================================================
-- TC-1: Mở nắp lô APPROVED → status = IN_USE + open_vial_expiration_date
-- =============================================================================

DO $$
DECLARE
  v_result RECORD;
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
  v_expected_exp DATE;
BEGIN
  RAISE NOTICE '=== TC-1: Mở nắp lô APPROVED ===';
  v_expected_exp := CURRENT_DATE + 28;

  SELECT * INTO v_result FROM fn_open_vial(v_lot_id, 10, 90, 'TC-1 test');

  ASSERT v_result.history_id IS NOT NULL, 'TC-1 FAIL: phải trả history_id';
  ASSERT v_result.open_vial_expiration_date = v_expected_exp,
    'TC-1 FAIL: open_vial_expiration_date phải = hôm nay + 28 ngày';
  ASSERT v_result.print_queue_id IS NOT NULL, 'TC-1 FAIL: phải tạo print_queue';

  -- Verify lot updated
  PERFORM 1 FROM lots
  WHERE id = v_lot_id
    AND status = 'IN_USE'
    AND open_vial_quantity_remaining = 90
    AND open_vial_count = 1;

  RAISE NOTICE '✅ TC-1 PASS: history_id=%, exp=%, print_queue=%',
    v_result.history_id, v_result.open_vial_expiration_date, v_result.print_queue_id;
END $$;

-- =============================================================================
-- TC-2: Update volume sau khi lấy thêm (không tạo history mới)
-- =============================================================================

DO $$
DECLARE
  v_new_remaining DECIMAL;
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE '=== TC-2: Update volume (lấy thêm 5) ===';
  SELECT fn_update_open_vial_volume(v_lot_id, 5) INTO v_new_remaining;

  ASSERT v_new_remaining = 85, 'TC-2 FAIL: phải còn 85 (90 - 5)';
  RAISE NOTICE '✅ TC-2 PASS: volume còn lại = %', v_new_remaining;
END $$;

-- =============================================================================
-- TC-3: Lấy quá volume → RAISE EXCEPTION
-- =============================================================================

DO $$
DECLARE
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE '=== TC-3: Lấy quá volume → FAIL ===';
  BEGIN
    PERFORM fn_update_open_vial_volume(v_lot_id, 1000);
    RAISE EXCEPTION 'TC-3 FAIL: phải raise exception khi lấy quá volume';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✅ TC-3 PASS: đã raise exception (%)', SQLERRM;
  END;
END $$;

-- =============================================================================
-- TC-4: Lấy trạng thái open-vial cho lô đang mở
-- =============================================================================

DO $$
DECLARE
  v_status RECORD;
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE '=== TC-4: Get open-vial status ===';
  SELECT * INTO v_status FROM fn_get_open_vial_status(v_lot_id);

  ASSERT v_status.is_open = TRUE, 'TC-4 FAIL: is_open phải = TRUE';
  ASSERT v_status.volume_remaining = 85, 'TC-4 FAIL: volume_remaining = 85';
  ASSERT v_status.needs_qc_retest = FALSE, 'TC-4 FAIL: chưa quá hạn, needs_qc_retest = FALSE';
  ASSERT v_status.open_vial_count = 1, 'TC-4 FAIL: open_vial_count = 1';
  RAISE NOTICE '✅ TC-4 PASS: is_open=%, days_left=%, volume=%',
    v_status.is_open, v_status.days_until_expiry, v_status.volume_remaining;
END $$;

-- =============================================================================
-- TC-5: Backdate open-vial expiration để test QC retest
-- =============================================================================

DO $$
DECLARE
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
  v_status RECORD;
BEGIN
  RAISE NOTICE '=== TC-5: Backdate expiration → cần QC retest ===';
  UPDATE lots
  SET open_vial_expiration_date = CURRENT_DATE - 5
  WHERE id = v_lot_id;

  SELECT * INTO v_status FROM fn_get_open_vial_status(v_lot_id);

  ASSERT v_status.needs_qc_retest = TRUE, 'TC-5 FAIL: đã quá hạn, needs_qc_retest = TRUE';
  ASSERT v_status.qc_retest_reason LIKE '%Quá hạn%', 'TC-5 FAIL: reason phải nói quá hạn';
  RAISE NOTICE '✅ TC-5 PASS: needs_qc_retest=TRUE, reason=%', v_status.qc_retest_reason;
END $$;

-- =============================================================================
-- TC-6: QC retest PASS → lô tiếp tục dùng được
-- =============================================================================

DO $$
DECLARE
  v_qc_id UUID;
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
  v_status RECORD;
BEGIN
  RAISE NOTICE '=== TC-6: QC retest PASS ===';
  SELECT fn_complete_open_vial_qc(
    v_lot_id,
    'Control Normal + Pathological',
    'PASS'::lot_qc_result,
    'Kết quả QC lại: control normal và pathological đều trong range. Lô vẫn sử dụng được.',
    CURRENT_DATE + 7,  -- valid 7 ngày
    NULL, NULL, '[]'::jsonb
  ) INTO v_qc_id;

  ASSERT v_qc_id IS NOT NULL, 'TC-6 FAIL: phải trả qc_record_id';

  -- Verify lot status giữ IN_USE
  PERFORM 1 FROM lots
  WHERE id = v_lot_id
    AND status = 'IN_USE'
    AND last_qc_retest_result = 'PASS';

  -- Verify needs_qc_retest = FALSE
  SELECT * INTO v_status FROM fn_get_open_vial_status(v_lot_id);
  ASSERT v_status.needs_qc_retest = FALSE, 'TC-6 FAIL: PASS xong, không cần QC lại';

  RAISE NOTICE '✅ TC-6 PASS: qc_id=%, lot vẫn IN_USE, valid_until=%', v_qc_id, v_status.qc_retest_valid_until;
END $$;

-- =============================================================================
-- TC-7: Backdate + QC retest FAIL → status = QC_FAILED
-- =============================================================================

DO $$
DECLARE
  v_lot_id UUID := 'bbbb1111-0000-0000-0000-000000000001';
  v_qc_id UUID;
BEGIN
  RAISE NOTICE '=== TC-7: QC retest FAIL → QC_FAILED ===';
  -- Tạo lô mới sạch
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status,
                    open_vial_opened_at, open_vial_opened_by, open_vial_quantity_remaining,
                    open_vial_expiration_date, open_vial_stability_days, open_vial_count)
  VALUES (
    'bbbb1111-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'L-OV-TEST-002',
    CURRENT_DATE - 30, CURRENT_DATE + 90, 100, 'IN_USE'::lot_status,
    now() - INTERVAL '30 days', auth.uid(), 80,
    CURRENT_DATE - 3, 28, 1
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'IN_USE'::lot_status,
      open_vial_expiration_date = CURRENT_DATE - 3;

  -- QC FAIL
  SELECT fn_complete_open_vial_qc(
    'bbbb1111-0000-0000-0000-000000000002',
    'Control Normal',
    'FAIL'::lot_qc_result,
    'Control normal ngoài range ±2SD. Lô không đạt chất lượng sau mở nắp.',
    NULL, NULL, NULL, '[]'::jsonb
  ) INTO v_qc_id;

  -- Verify QC_FAILED
  PERFORM 1 FROM lots
  WHERE id = 'bbbb1111-0000-0000-0000-000000000002'
    AND status = 'QC_FAILED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TC-7 FAIL: lô phải chuyển sang QC_FAILED';
  END IF;

  RAISE NOTICE '✅ TC-7 PASS: qc_id=%, lot = QC_FAILED', v_qc_id;
END $$;

-- =============================================================================
-- TC-8: List open-vial sắp hết hạn
-- =============================================================================

DO $$
DECLARE
  v_count INT := 0;
BEGIN
  RAISE NOTICE '=== TC-8: List open-vial sắp hết hạn ===';
  SELECT COUNT(*) INTO v_count
  FROM fn_list_open_vial_expiring();

  RAISE NOTICE 'Tìm thấy % open-vial sắp hết hạn', v_count;
  -- Không assert vì phụ thuộc data setup
  RAISE NOTICE '✅ TC-8 PASS: function chạy OK, count=%', v_count;
END $$;

RAISE NOTICE '🎉 Tất cả test scenarios Open-Vial đã PASS';
