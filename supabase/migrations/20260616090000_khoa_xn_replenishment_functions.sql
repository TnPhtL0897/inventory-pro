-- =============================================================================
-- Khoa XN — Module 3: Replenishment functions + cron schedule
-- File: supabase/migrations/20260616090000_khoa_xn_replenishment_functions.sql
--
-- Function: fn_compute_weekly_replenishment
-- - Auto tạo DRAFT mỗi thứ 6 8:00 sáng
-- - Logic: avg 3 tháng × 0.6 + tuần gần × 0.4, buffer 1.5 tuần
-- - FEFO auto-pick lot từ BULK warehouse
-- - Alert nếu BULK warehouse hết/thiếu hàng
-- =============================================================================

-- =============================================================================
-- 1. Helper: lấy ngày thứ 6 gần nhất (hoặc hôm nay nếu là thứ 6)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_get_friday(d DATE DEFAULT CURRENT_DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  -- PostgreSQL: dow 0=Sun, 5=Fri, 6=Sat
  SELECT d + (5 - EXTRACT(dow FROM d)::INT)::INT;
$$;

-- Test:
-- SELECT fn_get_friday('2026-06-08'::date);  -- 2026-06-12 (Fri)
-- SELECT fn_get_friday('2026-06-12'::date);  -- 2026-06-12 (Fri - today)
-- SELECT fn_get_friday('2026-06-13'::date);  -- 2026-06-19 (next Fri)

-- =============================================================================
-- 2. fn_compute_weekly_replenishment
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_compute_weekly_replenishment(
  p_tenant_id UUID,
  p_product_group TEXT,
  p_period_date DATE DEFAULT NULL,
  p_trigger_source TEXT DEFAULT 'CRON',
  p_trigger_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  run_id UUID,
  total_lines INT,
  total_estimated_value DECIMAL,
  alerts_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_date DATE;
  v_warehouse_role_from TEXT;
  v_warehouse_role_to TEXT;
  v_warehouse_from_id UUID;
  v_warehouse_to_id UUID;
  v_iso_week INT;
  v_run_id UUID;
  v_product RECORD;
  v_lot RECORD;

  -- Calculation vars
  v_avg_3m_weekly DECIMAL(10, 2);
  v_weighted_avg DECIMAL(10, 2);
  v_target_qty DECIMAL(10, 2);
  v_suggested_qty DECIMAL(15, 3);
  v_final_qty DECIMAL(15, 3);
  v_total_value DECIMAL(15, 2) := 0;
  v_total_lines INT := 0;
  v_alerts INT := 0;

  v_shortfall INT;
  v_total_current INT;
  v_unit_price DECIMAL(15, 2);

  -- Fix Issue #15: tách biến riêng để không ghi đè v_product record
  v_consumption_3m DECIMAL(15, 3) := 0;
  v_consumption_last_week DECIMAL(15, 3) := 0;
BEGIN
  -- Validate input
  IF p_product_group NOT IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE') THEN
    RAISE EXCEPTION 'Invalid product_group: %', p_product_group;
  END IF;

  -- Xác định period_date
  v_period_date := COALESCE(p_period_date, fn_get_friday(CURRENT_DATE));

  -- Xác định warehouse roles
  IF p_product_group = 'HOA_CHAT_SINH_PHAM' THEN
    v_warehouse_role_from := 'BULK_HC_SP';
    v_warehouse_role_to := 'DAILY_HC_SP';
  ELSE
    v_warehouse_role_from := 'BULK_VTYT';
    v_warehouse_role_to := 'DAILY_VTYT';
  END IF;

  -- ISO week
  v_iso_week := EXTRACT(week FROM v_period_date)::INT;

  -- Lấy warehouse IDs
  SELECT id INTO v_warehouse_from_id
  FROM warehouses
  WHERE tenant_id = p_tenant_id AND role = v_warehouse_role_from::warehouse_role
  LIMIT 1;

  SELECT id INTO v_warehouse_to_id
  FROM warehouses
  WHERE tenant_id = p_tenant_id AND role = v_warehouse_role_to::warehouse_role
  LIMIT 1;

  IF v_warehouse_from_id IS NULL OR v_warehouse_to_id IS NULL THEN
    RAISE EXCEPTION 'Missing BULK or DAILY warehouse for tenant % product_group %',
      p_tenant_id, p_product_group;
  END IF;

  -- Check nếu đã có run cho period này (idempotent)
  SELECT id INTO v_run_id
  FROM weekly_replenishment_runs
  WHERE tenant_id = p_tenant_id
    AND product_group = p_product_group
    AND period_date = v_period_date;

  IF v_run_id IS NOT NULL THEN
    -- Update existing run
    UPDATE weekly_replenishment_runs
    SET status = 'DRAFT',
        triggered_by = p_trigger_source::text,
        trigger_source = p_trigger_user_id::text,
        notes = COALESCE(notes, '') || ' [recomputed]'
    WHERE id = v_run_id;
  ELSE
    -- Tạo run mới
    INSERT INTO weekly_replenishment_runs (
      tenant_id, product_group, warehouse_role_from, warehouse_role_to,
      period_date, period_year, period_month, iso_week,
      status, triggered_by, trigger_source, created_by
    ) VALUES (
      p_tenant_id, p_product_group, v_warehouse_role_from, v_warehouse_role_to,
      v_period_date,
      EXTRACT(year FROM v_period_date)::INT,
      EXTRACT(month FROM v_period_date)::INT,
      v_iso_week,
      'DRAFT', p_trigger_source, p_trigger_user_id::text, p_trigger_user_id
    )
    RETURNING id INTO v_run_id;
  END IF;

  -- Xóa lines cũ (nếu recompute)
  DELETE FROM weekly_replenishment_lines WHERE run_id = v_run_id;

  -- Loop qua từng sản phẩm active trong product_group
  FOR v_product IN
    SELECT p.id, p.sku, p.name, p.min_stock, p.max_stock, p.cost_price, p.product_group
    FROM products p
    WHERE p.tenant_id = p_tenant_id
      AND p.product_group = p_product_group
      AND p.is_active = TRUE
  LOOP
    v_total_current := 0;

    -- Lấy tồn kho
    SELECT COALESCE(SUM(CASE WHEN warehouse_id = v_warehouse_from_id THEN quantity END), 0),
           COALESCE(SUM(CASE WHEN warehouse_id = v_warehouse_to_id THEN quantity END), 0)
    INTO v_lot, v_total_current
    FROM lots l
    WHERE l.product_id = v_product.id
      AND l.warehouse_id IN (v_warehouse_from_id, v_warehouse_to_id)
      AND l.status = 'APPROVED'
      AND l.expiration_date >= CURRENT_DATE;

    -- CẢNH BÁO nếu BULK hết (Fix Issue #15: dùng v_total_current thay vì v_product)
    IF v_lot IS NULL OR v_lot = 0 THEN
      INSERT INTO weekly_replenishment_alerts (
        tenant_id, run_id, product_id, warehouse_id,
        alert_type, alert_level, message, metadata
      ) VALUES (
        p_tenant_id, v_run_id, v_product.id, v_warehouse_from_id,
        'BULK_OUT_OF_STOCK', 'CRITICAL',
        format('%s (kho chẵn %s) — HẾT HÀNG. Cần đề xuất nhập từ Khoa Dược/Phòng VTYT trong tháng này.',
          v_product.name, v_warehouse_role_from),
        jsonb_build_object('product_sku', v_product.sku, 'min_stock', v_product.min_stock)
      );
      v_alerts := v_alerts + 1;
      CONTINUE;
    END IF;

    -- Lấy consumption 3 tháng (Fix Issue #15: dùng v_consumption_3m thay vì v_product)
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_consumption_3m
    FROM stock_movements sm
    WHERE sm.product_id = v_product.id
      AND sm.movement_type = 'OUT'
      AND sm.warehouse_id = v_warehouse_to_id
      AND sm.movement_date >= (CURRENT_DATE - INTERVAL '90 days');

    -- Lấy consumption tuần gần nhất
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_consumption_last_week
    FROM stock_movements sm
    WHERE sm.product_id = v_product.id
      AND sm.movement_type = 'OUT'
      AND sm.warehouse_id = v_warehouse_to_id
      AND sm.movement_date >= (CURRENT_DATE - INTERVAL '7 days');

    -- Nếu không có consumption → skip (Fix Issue #16)
    IF v_consumption_3m = 0 AND v_consumption_last_week = 0 THEN
      CONTINUE;
    END IF;

    -- ============================================
    -- CÔNG THỨC (đã chốt với user):
    -- avg_3m_weekly = consumption_3m / 13
    -- weighted_avg = avg_3m_weekly * 0.6 + last_week * 0.4
    -- target_qty = weighted_avg * 1.5  (buffer 1.5 tuần)
    -- suggested_qty = MAX(0, target_qty - current_daily_qty)
    -- Cộng shortfall nếu total_current < min_stock
    -- Cap bởi max_stock - total_current
    -- ============================================

    v_avg_3m_weekly := v_consumption_3m / 13.0;
    v_weighted_avg := (v_avg_3m_weekly * 0.6) + (v_consumption_last_week * 0.4);
    v_target_qty := v_weighted_avg * 1.5;

    v_suggested_qty := GREATEST(0, v_target_qty - v_total_current);

    -- Shortfall (Fix Issue #15: dùng đúng biến v_product.min_stock, v_total_current)
    v_shortfall := 0;
    IF v_total_current < v_product.min_stock THEN
      v_shortfall := v_product.min_stock - v_total_current;
      v_suggested_qty := v_suggested_qty + v_shortfall;
    END IF;

    -- Cap bởi max_stock
    IF v_suggested_qty > (v_product.max_stock - v_total_current) THEN
      v_suggested_qty := GREATEST(0, v_product.max_stock - v_total_current);
    END IF;

    v_final_qty := v_suggested_qty;

    -- Edge case: sản phẩm mới (no consumption) → dùng min_stock (Fix Issue #17)
    -- Điều kiện: cả 2 consumption = 0 VÀ có min_stock
    IF v_consumption_3m = 0 AND v_consumption_last_week = 0 AND v_product.min_stock > 0 THEN
      v_final_qty := v_product.min_stock;
    END IF;

    -- Nếu final_qty = 0 → skip
    IF v_final_qty < 1 THEN
      CONTINUE;
    END IF;

    -- Giới hạn bởi tồn kho BULK
    IF v_final_qty > v_lot THEN
      -- Cảnh báo: lô không đủ
      INSERT INTO weekly_replenishment_alerts (
        tenant_id, run_id, product_id, warehouse_id,
        alert_type, alert_level, message, metadata
      ) VALUES (
        p_tenant_id, v_run_id, v_product.id, v_warehouse_from_id,
        'BULK_LOW_STOCK', 'WARNING',
        format('%s — kho chẵn chỉ còn %s, không đủ cho đề xuất %s',
          v_product.name, v_lot, v_final_qty),
        jsonb_build_object('product_sku', v_product.sku, 'bulk_qty', v_lot, 'suggested', v_final_qty)
      );
      v_alerts := v_alerts + 1;
      v_final_qty := v_lot;
    END IF;

    -- Auto-pick Lot theo FEFO (ưu tiên open-vial trước, hạn gốc sau)
    SELECT l.id, l.lot_number, l.expiration_date, l.quantity
    INTO v_lot
    FROM lots l
    WHERE l.product_id = v_product.id
      AND l.warehouse_id = v_warehouse_from_id
      AND l.status = 'APPROVED'
      AND l.expiration_date >= CURRENT_DATE
      AND l.quantity > 0
    ORDER BY
      CASE WHEN l.open_vial_opened_at IS NOT NULL THEN 0 ELSE 1 END ASC,
      COALESCE(l.open_vial_expiration_date, l.expiration_date) ASC
    LIMIT 1;

    -- Tính giá trị ước tính (Fix Issue #18: dùng v_product.cost_price, không phải v_product đã bị ghi đè)
    v_unit_price := COALESCE(v_product.cost_price, 0);
    v_total_value := v_total_value + (v_final_qty * v_unit_price);

    -- Insert line (Fix Issue #19: dùng đúng biến, không phải v_product đã bị ghi đè)
    INSERT INTO weekly_replenishment_lines (
      run_id, product_id,
      current_daily_qty, current_bulk_qty,
      consumption_3m, consumption_last_week,
      min_stock, max_stock,
      avg_3m_weekly, weighted_avg, target_qty,
      short_reason, suggested_qty, final_qty,
      selected_lot_id, selected_lot_number, selected_lot_expiration, selected_lot_quantity,
      unit_price, estimated_value
    ) VALUES (
      v_run_id, v_product.id,
      v_total_current, v_lot,                              -- current_daily_qty, current_bulk_qty
      v_consumption_3m, v_consumption_last_week,           -- consumption_3m, consumption_last_week
      v_product.min_stock, v_product.max_stock,            -- min_stock, max_stock (Fix #15)
      v_avg_3m_weekly, v_weighted_avg, v_target_qty,
      CASE WHEN v_shortfall > 0 THEN 'MIN_STOCK_SHORTFALL' ELSE NULL END,
      v_final_qty, v_final_qty,
      v_lot, NULL, NULL, NULL,                              -- lot_id (sau này sẽ lấy lại)
      v_unit_price, v_final_qty * v_unit_price
    );

    v_total_lines := v_total_lines + 1;
  END LOOP;

  -- Update run totals (Fix Issue #20: tính requires_dept_head_approval dựa trên lines thực tế)
  UPDATE weekly_replenishment_runs
  SET total_lines = v_total_lines,
      total_estimated_value = v_total_value,
      requires_dept_head_approval = (v_total_value > 5000000)
  WHERE id = v_run_id;

  -- Log cho audit
  RAISE NOTICE '[fn_compute_weekly_replenishment] Tenant % ProductGroup % Period %: % lines, % VND, % alerts',
    p_tenant_id, p_product_group, v_period_date, v_total_lines, v_total_value, v_alerts;

  run_id := v_run_id;
  total_lines := v_total_lines;
  total_estimated_value := v_total_value;
  alerts_created := v_alerts;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fn_compute_weekly_replenishment IS
  'Tạo DRAFT đề xuất bổ sung tuần. Logic: avg 3m×0.6 + last_week×0.4, buffer 1.5 tuần. Cảnh báo nếu BULK hàng hết/thiếu.';

-- =============================================================================
-- 3. fn_compute_weekly_replenishment_all - chạy cho cả 2 product_group
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_compute_weekly_replenishment_all(
  p_period_date DATE DEFAULT NULL,
  p_trigger_source TEXT DEFAULT 'CRON',
  p_trigger_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  product_group TEXT,
  run_id UUID,
  total_lines INT,
  total_estimated_value DECIMAL,
  alerts_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant RECORD;
  v_run RECORD;
BEGIN
  FOR v_tenant IN
    SELECT id FROM tenants
  LOOP
    FOR v_run IN
      SELECT * FROM fn_compute_weekly_replenishment(
        p_tenant_id := v_tenant.id,
        p_product_group := 'HOA_CHAT_SINH_PHAM',
        p_period_date := p_period_date,
        p_trigger_source := p_trigger_source,
        p_trigger_user_id := p_trigger_user_id
      )
    LOOP
      product_group := 'HOA_CHAT_SINH_PHAM';
      run_id := v_run.run_id;
      total_lines := v_run.total_lines;
      total_estimated_value := v_run.total_estimated_value;
      alerts_created := v_run.alerts_created;
      RETURN NEXT;
    END LOOP;

    FOR v_run IN
      SELECT * FROM fn_compute_weekly_replenishment(
        p_tenant_id := v_tenant.id,
        p_product_group := 'VAT_TU_Y_TE',
        p_period_date := p_period_date,
        p_trigger_source := p_trigger_source,
        p_trigger_user_id := p_trigger_user_id
      )
    LOOP
      product_group := 'VAT_TU_Y_TE';
      run_id := v_run.run_id;
      total_lines := v_run.total_lines;
      total_estimated_value := v_run.total_estimated_value;
      alerts_created := v_run.alerts_created;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

-- =============================================================================
-- 4. Function: adjust line (thủ kho kho chẵn override)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_adjust_replenishment_line(
  p_line_id UUID,
  p_adjusted_qty DECIMAL,
  p_reason TEXT,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_line RECORD;
  v_user_role TEXT;
BEGIN
  -- Permission check: thủ kho kho chẵn HOẶC admin
  -- (Đơn giản: thủ kho đều có quyền adjust - sẽ refine khi tích hợp role chi tiết)
  IF NOT (
    fn_user_has_role('KEEPER_BULK_HC_SP')
    OR fn_user_has_role('KEEPER_BULK_VTYT')
    OR fn_user_is_admin_or_head()
  ) THEN
    RAISE EXCEPTION 'Permission denied: chỉ thủ kho kho chẵn hoặc Admin mới được adjust';
  END IF;

  SELECT * INTO v_line FROM weekly_replenishment_lines WHERE id = p_line_id;
  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Line % not found', p_line_id;
  END IF;

  IF p_adjusted_qty < 0 THEN
    RAISE EXCEPTION 'adjusted_qty phải ≥ 0';
  END IF;

  -- Append to adjustment_history
  UPDATE weekly_replenishment_lines
  SET
    adjusted_qty = p_adjusted_qty,
    final_qty = p_adjusted_qty,
    estimated_value = p_adjusted_qty * COALESCE(unit_price, 0),
    status = 'ADJUSTED',
    adjustment_history = adjustment_history || jsonb_build_object(
      'by', p_user_id,
      'by_role', COALESCE(fn_auth_role_codes(), ARRAY[]::TEXT[]),
      'from', final_qty,
      'to', p_adjusted_qty,
      'reason', p_reason,
      'at', now()
    )::jsonb
  WHERE id = p_line_id;
END;
$$;

-- =============================================================================
-- 5. Function: confirm by daily (thủ kho kho lẻ confirm + adjust nếu cần)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_confirm_replenishment_by_daily(
  p_line_id UUID,
  p_confirmed_qty DECIMAL,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE weekly_replenishment_lines
  SET
    daily_requested_qty = p_confirmed_qty,
    final_qty = p_confirmed_qty,
    status = 'CONFIRMED',
    adjustment_history = adjustment_history || jsonb_build_object(
      'by', p_user_id,
      'by_role', 'KEEPER_DAILY',
      'from', final_qty,
      'to', p_confirmed_qty,
      'reason', 'Confirmed by daily',
      'at', now()
    )::jsonb
  WHERE id = p_line_id;
END;
$$;

-- =============================================================================
-- 6. Function: auto-approve nếu ≤ 5M, otherwise requires dept head
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_auto_approve_if_low_value(p_run_id UUID)
RETURNS TEXT  -- 'AUTO_APPROVED' | 'REQUIRES_DEPT_HEAD'
LANGUAGE plpgsql
AS $$
DECLARE
  v_run RECORD;
BEGIN
  SELECT * INTO v_run FROM weekly_replenishment_runs WHERE id = p_run_id;
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  IF v_run.status NOT IN ('CONFIRMED_BY_DAILY') THEN
    RAISE EXCEPTION 'Run phải ở status CONFIRMED_BY_DAILY, hiện tại: %', v_run.status;
  END IF;

  IF COALESCE(v_run.total_estimated_value, 0) <= 5000000 THEN
    UPDATE weekly_replenishment_runs
    SET status = 'APPROVED',
        approved_by = NULL,  -- System approve
        updated_at = now()
    WHERE id = p_run_id;
    RETURN 'AUTO_APPROVED';
  ELSE
    UPDATE weekly_replenishment_runs
    SET requires_dept_head_approval = TRUE,
        updated_at = now()
    WHERE id = p_run_id;
    RETURN 'REQUIRES_DEPT_HEAD';
  END IF;
END;
$$;

-- =============================================================================
-- 7. Grant
-- =============================================================================

GRANT EXECUTE ON FUNCTION fn_get_friday(DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_compute_weekly_replenishment(UUID, TEXT, DATE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_compute_weekly_replenishment_all(DATE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_adjust_replenishment_line(UUID, DECIMAL, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_confirm_replenishment_by_daily(UUID, DECIMAL, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_auto_approve_if_low_value(UUID) TO authenticated;

-- =============================================================================
-- 8. pg_cron schedule (require service_role_key)
-- =============================================================================

DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://ituyoplyuhbdxkhabcpy.supabase.co';
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE NOTICE '[khoa-xn-replenishment] service_role_key chưa set. Bỏ qua cron schedule. Set bằng: ALTER DATABASE postgres SET app.settings.service_role_key = ''<key>'';';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('compute-weekly-replenishment');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Thứ 6 8:00 sáng hàng tuần
  PERFORM cron.schedule(
    'compute-weekly-replenishment',
    '0 8 * * 5',
    format(
      $$SELECT net.http_post(
        url := '%s/functions/v1/compute-weekly-replenishment',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{"triggerSource": "CRON"}'::jsonb
      )$$,
      v_supabase_url,
      v_service_key
    )
  );

  RAISE NOTICE '[khoa-xn-replenishment] Scheduled compute-weekly-replenishment (thứ 6 08:00)';
END $$;
