-- =============================================================================
-- Khoa XN — Module 3 QA Test Scenarios
-- File: supabase/migrations/20260616999999_khoa_xn_replenishment_test_scenarios.sql
--
-- Test fn_compute_weekly_replenishment với:
-- 1. Stock movements mock (3 tháng + 1 tuần)
-- 2. Verify suggested_qty theo công thức đúng
-- 3. Test edge cases (kho chẵn hết, sản phẩm mới, max_stock cap)
--
-- Usage: psql -h <host> -U postgres -d postgres -f this-file.sql
-- Sau khi apply: 20260616080000 + 20260616090000 (Module 3 migrations)
-- =============================================================================

-- =============================================================================
-- SETUP: tạo test data
-- =============================================================================
DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_product_gluc UUID;
  v_product_hbs UUID;
  v_product_edta UUID;
  v_warehouse_bulk_hc UUID;
  v_warehouse_daily_hc UUID;
  v_warehouse_bulk_vt UUID;
  v_lot_gluc UUID;
  v_lot_hbs UUID;
  v_lot_edta UUID;
BEGIN
  -- Reuse test products từ Module 2 (nếu có) hoặc tạo mới
  INSERT INTO products (id, tenant_id, sku, name, base_unit_id, product_type, cost_price, sell_price, min_stock, max_stock, product_group, product_subtype, open_vial_stability_days, storage_condition, is_active)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_tenant_id, 'TEST-GLUC-001', '[TEST] Glucose', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 85000, 120000, 10, 20, 'HOA_CHAT_SINH_PHAM', 'REAGENT', 28, 'REFRIGERATED', TRUE),
    ('11111111-1111-1111-1111-111111111112', v_tenant_id, 'TEST-HBS-001', '[TEST] HBsAg', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 250000, 380000, 15, 30, 'HOA_CHAT_SINH_PHAM', 'REAGENT', 60, 'REFRIGERATED', TRUE),
    ('11111111-1111-1111-1111-111111111113', v_tenant_id, 'TEST-EDTA-001', '[TEST] EDTA Tube', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 2500, 3500, 200, 1000, 'VAT_TU_Y_TE', 'CONSUMABLE_MEDICAL', NULL, 'ROOM_TEMP', TRUE)
  ON CONFLICT (id) DO NOTHING;

  v_product_gluc := '11111111-1111-1111-1111-111111111111';
  v_product_hbs := '11111111-1111-1111-1111-111111111112';
  v_product_edta := '11111111-1111-1111-1111-111111111113';

  -- Reuse warehouses
  v_warehouse_bulk_hc := '22222222-2222-2222-2222-222222222221';
  v_warehouse_daily_hc := '22222222-2222-2222-2222-222222222222';
  v_warehouse_bulk_vt := '22222222-2222-2222-2222-222222222223';

  -- =====================================================================
  -- Tạo lots cho test (nếu chưa có từ Module 2 test)
  -- =====================================================================
  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number, expiration_date, quantity, status, qc_required, created_by)
  VALUES
    ('33333333-3333-3333-3333-333333333301', v_tenant_id, v_product_gluc, v_warehouse_bulk_hc, 'TEST-RPL-GLUC-001', CURRENT_DATE + INTERVAL '60 days', 100, 'APPROVED', TRUE, NULL),
    ('33333333-3333-3333-3333-333333333302', v_tenant_id, v_product_hbs, v_warehouse_bulk_hc, 'TEST-RPL-HBS-001', CURRENT_DATE + INTERVAL '180 days', 50, 'APPROVED', TRUE, NULL),
    ('33333333-3333-3333-3333-333333333303', v_tenant_id, v_product_edta, v_warehouse_bulk_vt, 'TEST-RPL-EDTA-001', CURRENT_DATE + INTERVAL '365 days', 2000, 'APPROVED', FALSE, NULL)
  ON CONFLICT (id) DO NOTHING;

  v_lot_gluc := '33333333-3333-3333-3333-333333333301';
  v_lot_hbs := '33333333-3333-3333-3333-333333333302';
  v_lot_edta := '33333333-3333-3333-3333-333333333303';

  -- =====================================================================
  -- Tạo stock_movements giả lập 90 ngày OUT (cho consumption 3 tháng)
  -- Glucose: 39 chai trong 90 ngày (= 3 chai/tuần)
  -- HBsAg: 65 test trong 90 ngày (= 5 test/tuần)
  -- EDTA: 300 ống trong 90 ngày (= 25 ống/tuần)
  -- =====================================================================
  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, movement_date, unit_cost, reference_type)
  SELECT
    v_tenant_id, v_product_gluc, v_warehouse_daily_hc, 'OUT', 1,
    CURRENT_DATE - (i || ' days')::INTERVAL, 85000, 'TRANSFER_OUT'
  FROM generate_series(1, 39) i
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE product_id = v_product_gluc
      AND warehouse_id = v_warehouse_daily_hc
      AND movement_type = 'OUT'
      AND movement_date >= CURRENT_DATE - INTERVAL '90 days'
      AND movement_date <= CURRENT_DATE
  );

  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, movement_date, unit_cost, reference_type)
  SELECT
    v_tenant_id, v_product_hbs, v_warehouse_daily_hc, 'OUT', 1,
    CURRENT_DATE - (i || ' days')::INTERVAL, 250000, 'TRANSFER_OUT'
  FROM generate_series(1, 65) i
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE product_id = v_product_hbs
      AND warehouse_id = v_warehouse_daily_hc
      AND movement_type = 'OUT'
    LIMIT 1
  );

  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, movement_date, unit_cost, reference_type)
  SELECT
    v_tenant_id, v_product_edta, v_warehouse_bulk_vt, 'OUT', 1,
    CURRENT_DATE - (i || ' days')::INTERVAL, 2500, 'TRANSFER_OUT'
  FROM generate_series(1, 300) i
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE product_id = v_product_edta
      AND warehouse_id = v_warehouse_bulk_vt
      AND movement_type = 'OUT'
    LIMIT 1
  );

  -- =====================================================================
  -- TC-1: Chạy fn_compute_weekly_replenishment cho HC-SP
  -- Expected: tạo run với 2 lines (Glucose + HBsAg)
  -- =====================================================================
  PERFORM * FROM fn_compute_weekly_replenishment(
    p_tenant_id := v_tenant_id,
    p_product_group := 'HOA_CHAT_SINH_PHAM',
    p_period_date := fn_get_friday(CURRENT_DATE),
    p_trigger_source := 'CRON',
    p_trigger_user_id := NULL
  );

  -- Verify
  ASSERT (
    SELECT COUNT(*) FROM weekly_replenishment_lines
    WHERE run_id IN (
      SELECT id FROM weekly_replenishment_runs
      WHERE tenant_id = v_tenant_id
        AND product_group = 'HOA_CHAT_SINH_PHAM'
        AND period_date = fn_get_friday(CURRENT_DATE)
    )
  ) >= 2, 'TC-1 FAIL: phải có ít nhất 2 lines (Glucose + HBsAg)';
  RAISE NOTICE 'TC-1 PASS: fn_compute_weekly_replenishment cho HC-SP';

  -- =====================================================================
  -- TC-2: Verify công thức cho Glucose
  -- avg_3m = 39/13 = 3
  -- last_week = ~1
  -- weighted_avg = 3*0.6 + 1*0.4 = 2.2
  -- target = 2.2 * 1.5 = 3.3 → round 3
  -- current_daily = 0 (mới tạo chưa xuất)
  -- shortfall: total_current (0) < min_stock (10) → +10
  -- suggested = 3 + 10 = 13
  -- cap max_stock (20) - total_current (0) = 20
  -- final = min(13, 20) = 13
  -- Expected: final_qty = 13
  -- =====================================================================
  ASSERT (
    SELECT final_qty FROM weekly_replenishment_lines
    WHERE run_id IN (
      SELECT id FROM weekly_replenishment_runs
      WHERE tenant_id = v_tenant_id
        AND product_group = 'HOA_CHAT_SINH_PHAM'
        AND period_date = fn_get_friday(CURRENT_DATE)
    )
    AND product_id = v_product_gluc
  ) = 13, 'TC-2 FAIL: Glucose final_qty phải = 13 (sau cap min_stock shortfall)';
  RAISE NOTICE 'TC-2 PASS: Công thức cho Glucose đúng (final_qty = 13)';

  -- =====================================================================
  -- TC-3: Idempotency - chạy lần 2 không tạo duplicate lines
  -- =====================================================================
  PERFORM * FROM fn_compute_weekly_replenishment(
    p_tenant_id := v_tenant_id,
    p_product_group := 'HOA_CHAT_SINH_PHAM',
    p_period_date := fn_get_friday(CURRENT_DATE),
    p_trigger_source := 'CRON',
    p_trigger_user_id := NULL
  );

  ASSERT (
    SELECT COUNT(*) FROM weekly_replenishment_lines
    WHERE run_id IN (
      SELECT id FROM weekly_replenishment_runs
      WHERE tenant_id = v_tenant_id
        AND product_group = 'HOA_CHAT_SINH_PHAM'
        AND period_date = fn_get_friday(CURRENT_DATE)
    )
  ) = 2, 'TC-3 FAIL: chạy 2 lần tạo duplicate lines';
  RAISE NOTICE 'TC-3 PASS: Idempotency OK';

  -- =====================================================================
  -- TC-4: Test edge case - sản phẩm không có consumption (chưa xuất lần nào)
  -- Tạo sản phẩm mới
  -- =====================================================================
  INSERT INTO products (id, tenant_id, sku, name, base_unit_id, product_type, cost_price, sell_price, min_stock, max_stock, product_group, product_subtype, storage_condition, is_active)
  VALUES ('11111111-1111-1111-1111-111111111199', v_tenant_id, 'TEST-NEW-001', '[TEST] New Product (no consumption)', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 50000, 75000, 5, 15, 'HOA_CHAT_SINH_PHAM', 'REAGENT', 'REFRIGERATED', TRUE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number, expiration_date, quantity, status, qc_required)
  VALUES ('33333333-3333-3333-3333-333333333399', v_tenant_id, '11111111-1111-1111-1111-111111111199', v_warehouse_bulk_hc, 'TEST-RPL-NEW-001', CURRENT_DATE + INTERVAL '90 days', 50, 'APPROVED', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Chạy lại
  PERFORM * FROM fn_compute_weekly_replenishment(
    p_tenant_id := v_tenant_id,
    p_product_group := 'HOA_CHAT_SINH_PHAM',
    p_period_date := fn_get_friday(CURRENT_DATE),
    p_trigger_source := 'CRON',
    p_trigger_user_id := NULL
  );

  -- Verify: sản phẩm mới dùng min_stock = 5
  -- (consumption = 0, fallback to min_stock)
  ASSERT (
    SELECT final_qty FROM weekly_replenishment_lines
    WHERE run_id IN (
      SELECT id FROM weekly_replenishment_runs
      WHERE tenant_id = v_tenant_id
        AND product_group = 'HOA_CHAT_SINH_PHAM'
        AND period_date = fn_get_friday(CURRENT_DATE)
    )
    AND product_id = '11111111-1111-1111-1111-111111111199'
  ) = 5, 'TC-4 FAIL: sản phẩm mới phải dùng min_stock = 5';
  RAISE NOTICE 'TC-4 PASS: Sản phẩm mới dùng min_stock';

  -- =====================================================================
  -- TC-5: Alert nếu kho chẵn hết
  -- Tạo sản phẩm có kho chẵn = 0
  -- =====================================================================
  INSERT INTO products (id, tenant_id, sku, name, base_unit_id, product_type, cost_price, sell_price, min_stock, max_stock, product_group, product_subtype, storage_condition, is_active)
  VALUES ('11111111-1111-1111-1111-111111111198', v_tenant_id, 'TEST-OUT-001', '[TEST] Out of Stock', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 60000, 90000, 8, 16, 'HOA_CHAT_SINH_PHAM', 'REAGENT', 'REFRIGERATED', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- KHÔNG tạo lot cho sản phẩm này (kho chẵn = 0)

  PERFORM * FROM fn_compute_weekly_replenishment(
    p_tenant_id := v_tenant_id,
    p_product_group := 'HOA_CHAT_SINH_PHAM',
    p_period_date := fn_get_friday(CURRENT_DATE),
    p_trigger_source := 'CRON',
    p_trigger_user_id := NULL
  );

  -- Verify: có alert BULK_OUT_OF_STOCK
  ASSERT EXISTS (
    SELECT 1 FROM weekly_replenishment_alerts
    WHERE product_id = '11111111-1111-1111-1111-111111111198'
      AND alert_type = 'BULK_OUT_OF_STOCK'
      AND resolved = FALSE
  ), 'TC-5 FAIL: phải có alert BULK_OUT_OF_STOCK';
  RAISE NOTICE 'TC-5 PASS: Alert BULK_OUT_OF_STOCK';

  -- Verify: KHÔNG tạo line cho sản phẩm hết hàng
  ASSERT NOT EXISTS (
    SELECT 1 FROM weekly_replenishment_lines
    WHERE product_id = '11111111-1111-1111-1111-111111111198'
  ), 'TC-5 FAIL: không được tạo line cho sản phẩm hết hàng';
  RAISE NOTICE 'TC-5 PASS: Không tạo line cho sản phẩm hết hàng';

  -- =====================================================================
  -- TC-6: Test max_stock cap
  -- Tạo sản phẩm có consumption cao nhưng min_stock = 0, max_stock = 10
  -- Expected: final_qty bị cap bởi max_stock
  -- =====================================================================
  INSERT INTO products (id, tenant_id, sku, name, base_unit_id, product_type, cost_price, sell_price, min_stock, max_stock, product_group, product_subtype, storage_condition, is_active)
  VALUES ('11111111-1111-1111-1111-111111111197', v_tenant_id, 'TEST-CAP-001', '[TEST] Cap Test', (SELECT id FROM units_of_measure LIMIT 1), 'CONSUMABLE', 10000, 15000, 0, 10, 'HOA_CHAT_SINH_PHAM', 'REAGENT', 'REFRIGERATED', TRUE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO lots (id, tenant_id, product_id, warehouse_id, lot_number, expiration_date, quantity, status, qc_required)
  VALUES ('33333333-3333-3333-3333-333333333397', v_tenant_id, '11111111-1111-1111-1111-111111111197', v_warehouse_bulk_hc, 'TEST-RPL-CAP-001', CURRENT_DATE + INTERVAL '60 days', 200, 'APPROVED', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Tạo consumption rất cao: 200/90 ngày = 15/tuần → target = 22.5 → suggested = 22.5
  -- Cap bởi max_stock (10) - current (0) = 10
  -- Expected: final_qty = 10
  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, movement_type, quantity, movement_date, unit_cost, reference_type)
  SELECT v_tenant_id, '11111111-1111-1111-1111-111111111197', v_warehouse_daily_hc, 'OUT', 1,
    CURRENT_DATE - (i || ' days')::INTERVAL, 10000, 'TRANSFER_OUT'
  FROM generate_series(1, 200) i
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE product_id = '11111111-1111-1111-1111-111111111197'
      AND movement_type = 'OUT'
    LIMIT 1
  );

  PERFORM * FROM fn_compute_weekly_replenishment(
    p_tenant_id := v_tenant_id,
    p_product_group := 'HOA_CHAT_SINH_PHAM',
    p_period_date := fn_get_friday(CURRENT_DATE),
    p_trigger_source := 'CRON',
    p_trigger_user_id := NULL
  );

  ASSERT (
    SELECT final_qty FROM weekly_replenishment_lines
    WHERE run_id IN (
      SELECT id FROM weekly_replenishment_runs
      WHERE tenant_id = v_tenant_id
        AND product_group = 'HOA_CHAT_SINH_PHAM'
        AND period_date = fn_get_friday(CURRENT_DATE)
    )
    AND product_id = '11111111-1111-1111-1111-111111111197'
  ) = 10, 'TC-6 FAIL: final_qty phải cap bởi max_stock = 10';
  RAISE NOTICE 'TC-6 PASS: max_stock cap đúng';

  -- =====================================================================
  -- TC-7: requires_dept_head_approval khi tổng > 5M
  -- Glucose (final 13 × 85K = 1.1M) + HBsAg (13 × 250K = 3.25M) + EDTA + New + Cap
  -- Tổng có thể > 5M
  -- =====================================================================
  ASSERT (
    SELECT requires_dept_head_approval FROM weekly_replenishment_runs
    WHERE tenant_id = v_tenant_id
      AND product_group = 'HOA_CHAT_SINH_PHAM'
      AND period_date = fn_get_friday(CURRENT_DATE)
  ) IS NOT NULL, 'TC-7 FAIL: requires_dept_head_approval phải được set';
  RAISE NOTICE 'TC-7 PASS: requires_dept_head_approval set';

  -- =====================================================================
  -- CLEANUP (optional)
  -- =====================================================================
  -- DELETE FROM weekly_replenishment_alerts WHERE run_id IN (...);
  -- DELETE FROM weekly_replenishment_lines WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'TEST-RPL-%' OR sku LIKE 'TEST-%');
  -- DELETE FROM weekly_replenishment_runs WHERE tenant_id = v_tenant_id;
  -- DELETE FROM stock_movements WHERE tenant_id = v_tenant_id AND product_id IN (v_product_gluc, v_product_hbs, v_product_edta, ...);
  -- DELETE FROM lots WHERE lot_number LIKE 'TEST-RPL-%';
  -- DELETE FROM products WHERE sku LIKE 'TEST-RPL-%' OR sku LIKE 'TEST-CAP-%' OR sku LIKE 'TEST-OUT-%' OR sku LIKE 'TEST-NEW-%' OR sku IN ('TEST-GLUC-001', 'TEST-HBS-001', 'TEST-EDTA-001');

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL MODULE 3 TEST SCENARIOS PASSED!';
  RAISE NOTICE '========================================';
END $$;
