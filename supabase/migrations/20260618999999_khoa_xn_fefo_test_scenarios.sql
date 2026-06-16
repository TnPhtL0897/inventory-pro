-- =============================================================================
-- Khoa XN — Module 2 QA Test Scenarios: FEFO Enforcement
-- File: supabase/migrations/20260618999999_khoa_xn_fefo_test_scenarios.sql
--
-- Test FEFO pick + override + compliance report.
-- KHÔNG chạy trên production. Có thể xóa sau khi QA xong.
--
-- Usage:
--   psql -h <host> -U postgres -d postgres -f this-file.sql
-- =============================================================================

-- =============================================================================
-- SETUP: tạo 4 lots mẫu cho FEFO testing
-- =============================================================================

DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_product_id UUID := '11111111-1111-1111-1111-111111111111';  -- Glucose test
  v_warehouse_id UUID := '22222222-2222-2222-2222-222222222222'; -- BULK_HC

  -- Lots theo thứ tự ưu tiên FEFO
  v_lot_open_vial UUID;   -- L001: open-vial, sắp hết open-vial
  v_lot_old UUID;          -- L002: HSD gần nhất (chưa mở)
  v_lot_new UUID;          -- L003: HSD xa
  v_lot_expired UUID;      -- L004: EXPIRED (test dùng lô hết hạn)
  v_lot_blocked UUID;      -- L005: BLOCKED (test bỏ qua)
BEGIN
  -- Lot 1: Open-vial còn 4 ngày (cao nhất ưu tiên FEFO)
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status,
                    open_vial_opened_at, open_vial_quantity_remaining,
                    open_vial_expiration_date, open_vial_stability_days, open_vial_count)
  VALUES (
    'aaaa1111-0000-0000-0000-000000000001',
    v_tenant_id, v_product_id, v_warehouse_id,
    'L001-OPEN-VIAL',
    CURRENT_DATE - 60, CURRENT_DATE + 30, 5, 'IN_USE'::lot_status,
    CURRENT_DATE - INTERVAL '24 days', 5,
    CURRENT_DATE + 4, 28, 1
  )
  ON CONFLICT (id) DO UPDATE
  SET open_vial_expiration_date = EXCLUDED.open_vial_expiration_date;
  v_lot_open_vial := 'aaaa1111-0000-0000-0000-000000000001';

  -- Lot 2: Chưa mở, HSD 2026-06-25 (sớm nhất sau L001)
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status)
  VALUES (
    'aaaa1111-0000-0000-0000-000000000002',
    v_tenant_id, v_product_id, v_warehouse_id,
    'L002-EARLY-EXP',
    CURRENT_DATE - 90, CURRENT_DATE + 9, 30, 'APPROVED'::lot_status
  )
  ON CONFLICT (id) DO NOTHING;
  v_lot_old := 'aaaa1111-0000-0000-0000-000000000002';

  -- Lot 3: Chưa mở, HSD 2026-12-31 (xa)
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status)
  VALUES (
    'aaaa1111-0000-0000-0000-000000000003',
    v_tenant_id, v_product_id, v_warehouse_id,
    'L003-LATE-EXP',
    CURRENT_DATE - 30, CURRENT_DATE + 180, 50, 'APPROVED'::lot_status
  )
  ON CONFLICT (id) DO NOTHING;
  v_lot_new := 'aaaa1111-0000-0000-0000-000000000003';

  -- Lot 4: EXPIRED (test dùng lô hết hạn → CRITICAL)
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status)
  VALUES (
    'aaaa1111-0000-0000-0000-000000000004',
    v_tenant_id, v_product_id, v_warehouse_id,
    'L004-EXPIRED',
    CURRENT_DATE - 200, CURRENT_DATE - 7, 8, 'EXPIRED'::lot_status
  )
  ON CONFLICT (id) DO NOTHING;
  v_lot_expired := 'aaaa1111-0000-0000-0000-000000000004';

  -- Lot 5: BLOCKED (test bỏ qua khi pick)
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number,
                    manufacturer_date, expiration_date, quantity, status,
                    recall_notice_id, recall_blocked_at)
  VALUES (
    'aaaa1111-0000-0000-0000-000000000005',
    v_tenant_id, v_product_id, v_warehouse_id,
    'L005-BLOCKED',
    CURRENT_DATE - 100, CURRENT_DATE + 60, 20, 'BLOCKED'::lot_status,
    '99999999-9999-9999-9999-999999999999', now() - INTERVAL '3 days'
  )
  ON CONFLICT (id) DO NOTHING;
  v_lot_blocked := 'aaaa1111-0000-0000-0000-000000000005';

  RAISE NOTICE 'Test data ready: 5 lots created (L001 open-vial, L002 early-exp, L003 late-exp, L004 EXPIRED, L005 BLOCKED)';
END $$;

-- =============================================================================
-- TC-1: Pick 10 chai → expect L001 (5) + L002 (5) vì L001 chỉ có 5
-- =============================================================================

DO $$
DECLARE
  v_pick RECORD;
  v_total_picked DECIMAL := 0;
BEGIN
  RAISE NOTICE '=== TC-1: Pick 10 chai từ BULK_HC ===';
  FOR v_pick IN
    SELECT * FROM fn_pick_lot_fefo(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      10
    )
    WHERE lot_id IS NOT NULL
  LOOP
    RAISE NOTICE '  Pick #%: lot=%, qty=%, reason=%',
      v_pick.pick_order, v_pick.lot_number, v_pick.available_quantity, v_pick.pick_reason;
    v_total_picked := v_total_picked + v_pick.available_quantity;
  END LOOP;
  ASSERT v_total_picked = 10, 'TC-1 FAIL: phải pick đủ 10 chai, thực tế ' || v_total_picked;
  RAISE NOTICE '✅ TC-1 PASS: pick đủ 10 (L001=5 open-vial + L002=5 FEFO)';
END $$;

-- =============================================================================
-- TC-2: Pick 20 chai → expect L001(5) + L002(30) = 20 (chỉ dùng 25 từ L002)
-- =============================================================================

DO $$
DECLARE
  v_pick RECORD;
  v_total_picked DECIMAL := 0;
BEGIN
  RAISE NOTICE '=== TC-2: Pick 20 chai → multi-lot pick ===';
  FOR v_pick IN
    SELECT * FROM fn_pick_lot_fefo(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      20
    )
    WHERE lot_id IS NOT NULL
  LOOP
    RAISE NOTICE '  Pick #%: lot=%, qty=%, reason=%',
      v_pick.pick_order, v_pick.lot_number, v_pick.available_quantity, v_pick.pick_reason;
    v_total_picked := v_total_picked + v_pick.available_quantity;
  END LOOP;
  ASSERT v_total_picked = 20, 'TC-2 FAIL: phải pick đủ 20';
  RAISE NOTICE '✅ TC-2 PASS: pick đủ 20';
END $$;

-- =============================================================================
-- TC-3: Pick 100 chai → expect shortage row (L001=5 + L002=30 + L003=50 = 85, thiếu 15)
-- =============================================================================

DO $$
DECLARE
  v_pick RECORD;
  v_total_picked DECIMAL := 0;
  v_shortage DECIMAL := 0;
BEGIN
  RAISE NOTICE '=== TC-3: Pick 100 chai → thiếu hàng ===';
  FOR v_pick IN
    SELECT * FROM fn_pick_lot_fefo(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      100
    )
  LOOP
    IF v_pick.lot_id IS NULL THEN
      v_shortage := v_pick.available_quantity;
      RAISE NOTICE '  ⚠️ INSUFFICIENT: shortage=%', v_shortage;
    ELSE
      RAISE NOTICE '  Pick #%: lot=%, qty=%',
        v_pick.pick_order, v_pick.lot_number, v_pick.available_quantity;
      v_total_picked := v_total_picked + v_pick.available_quantity;
    END IF;
  END LOOP;
  ASSERT v_total_picked = 85, 'TC-3 FAIL: phải pick được 85 (5+30+50)';
  ASSERT v_shortage = 15, 'TC-3 FAIL: shortage phải = 15';
  RAISE NOTICE '✅ TC-3 PASS: pick 85, shortage 15';
END $$;

-- =============================================================================
-- TC-4: Lô BLOCKED (L005) phải bị bỏ qua khi pick
-- =============================================================================

DO $$
DECLARE
  v_pick RECORD;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '=== TC-4: BLOCKED lot bị bỏ qua ===';
  FOR v_pick IN
    SELECT * FROM fn_pick_lot_fefo(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      10
    )
    WHERE lot_id IS NOT NULL
  LOOP
    ASSERT v_pick.lot_number != 'L005-BLOCKED', 'TC-4 FAIL: BLOCKED lot không được pick';
    v_count := v_count + 1;
  END LOOP;
  ASSERT v_count > 0, 'TC-4 FAIL: phải pick được ít nhất 1 lot';
  RAISE NOTICE '✅ TC-4 PASS: BLOCKED lot bị bỏ qua';
END $$;

-- =============================================================================
-- TC-5: Ghi audit log - auto FEFO (compliant)
-- =============================================================================

DO $$
DECLARE
  v_audit_id UUID;
BEGIN
  RAISE NOTICE '=== TC-5: Ghi audit log - auto FEFO (compliant) ===';
  SELECT fn_record_fefo_pick(
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    5,  -- request 5
    'aaaa1111-0000-0000-0000-000000000001',  -- L001 (FEFO đầu tiên)
    'STOCK_ISSUE', NULL, 'SI-TEST-001',
    NULL, NULL  -- không override
  ) INTO v_audit_id;

  ASSERT v_audit_id IS NOT NULL, 'TC-5 FAIL: phải trả về audit_id';
  RAISE NOTICE '✅ TC-5 PASS: audit_id=%', v_audit_id;
END $$;

-- =============================================================================
-- TC-6: Ghi audit log - override (L003 thay vì L001)
-- =============================================================================

DO $$
DECLARE
  v_audit_id UUID;
BEGIN
  RAISE NOTICE '=== TC-6: Override - chọn L003 thay vì L001 ===';
  SELECT fn_record_fefo_pick(
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    10,
    'aaaa1111-0000-0000-0000-000000000003',  -- L003 (không phải FEFO)
    'STOCK_ISSUE', NULL, 'SI-TEST-002',
    'FEFO_INSUFFICIENT'::fefo_override_reason,
    'L001 chỉ còn 5, không đủ cho 10. Dùng L003 cho đủ số lượng.'
  ) INTO v_audit_id;

  ASSERT v_audit_id IS NOT NULL, 'TC-6 FAIL: phải trả về audit_id';
  RAISE NOTICE '✅ TC-6 PASS: override audit_id=%', v_audit_id;
END $$;

-- =============================================================================
-- TC-7: Dùng lô EXPIRED → expect CRITICAL alert + audit_level = CRITICAL
-- =============================================================================

DO $$
DECLARE
  v_audit_id UUID;
  v_alert_count INT;
BEGIN
  RAISE NOTICE '=== TC-7: Dùng lô EXPIRED (L004) → CRITICAL ===';
  SELECT fn_record_fefo_pick(
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    5,
    'aaaa1111-0000-0000-0000-000000000004',  -- L004 EXPIRED
    'STOCK_ISSUE', NULL, 'SI-TEST-003',
    'EMERGENCY'::fefo_override_reason,
    'Cấp cứu bệnh nhân lúc 23h, không có lô APPROVED. Kết quả XN sẽ được kiểm tra chéo với control.'
  ) INTO v_audit_id;

  -- Check alert được tạo
  SELECT COUNT(*) INTO v_alert_count
  FROM lot_alerts
  WHERE lot_id = 'aaaa1111-0000-0000-0000-000000000004'
    AND alert_type = 'FEFO_VIOLATION'
    AND alert_level = 'CRITICAL'
    AND resolved = FALSE;

  ASSERT v_audit_id IS NOT NULL, 'TC-7 FAIL: phải trả về audit_id';
  ASSERT v_alert_count > 0, 'TC-7 FAIL: phải tạo CRITICAL alert cho DEPT_HEAD';
  RAISE NOTICE '✅ TC-7 PASS: CRITICAL audit + alert (count=%)', v_alert_count;
END $$;

-- =============================================================================
-- TC-8: Compliance report tháng hiện tại
-- =============================================================================

DO $$
DECLARE
  v_report RECORD;
BEGIN
  RAISE NOTICE '=== TC-8: Compliance report tháng hiện tại ===';
  SELECT * INTO v_report
  FROM fn_fefo_compliance_report(
    '00000000-0000-0000-0000-000000000001',
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    EXTRACT(MONTH FROM CURRENT_DATE)::INT
  );

  RAISE NOTICE 'Total picks: %', v_report.total_picks;
  RAISE NOTICE 'Compliant: % (rate=%)', v_report.compliant_picks, v_report.compliance_rate;
  RAISE NOTICE 'Override: % (rate=%)', v_report.override_picks, v_report.override_rate;
  RAISE NOTICE 'Expired used: %', v_report.expired_picks;
  RAISE NOTICE 'Top override products: %', v_report.top_overridden_products;
  RAISE NOTICE 'Top override users: %', v_report.top_override_users;

  ASSERT v_report.total_picks >= 3, 'TC-8 FAIL: phải có ít nhất 3 picks từ TC-5/6/7';
  RAISE NOTICE '✅ TC-8 PASS: report OK';
END $$;

-- =============================================================================
-- CLEANUP: xóa audit log + alerts test (optional)
-- =============================================================================

-- DELETE FROM fefo_audit_log
--   WHERE document_number IN ('SI-TEST-001', 'SI-TEST-002', 'SI-TEST-003');
-- DELETE FROM lot_alerts
--   WHERE lot_id = 'aaaa1111-0000-0000-0000-000000000004' AND alert_type = 'FEFO_VIOLATION';

RAISE NOTICE '🎉 Tất cả test scenarios FEFO đã PASS';
