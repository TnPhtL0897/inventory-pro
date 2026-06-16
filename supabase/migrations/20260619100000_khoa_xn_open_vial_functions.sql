-- =============================================================================
-- Khoa XN — Module 2: Open-Vial Tracking Functions
-- File: supabase/migrations/20260619100000_khoa_xn_open_vial_functions.sql
--
-- Workflow mở nắp + QC lại sau quá hạn open-vial + cảnh báo hết hạn.
-- =============================================================================

-- =============================================================================
-- 1. fn_open_vial: Ghi nhận mở nắp + in nhãn
-- =============================================================================
-- Khi thủ kho mở lọ:
--   1. Tạo record open_vial_history
--   2. Cập nhật lots: open_vial_opened_at, open_vial_expiration_date,
--                     open_vial_quantity_remaining, status = IN_USE
--   3. Tạo open_vial_print_queue (hàng đợi in nhãn)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_open_vial(
  p_lot_id UUID,
  p_quantity_taken DECIMAL,
  p_quantity_remaining DECIMAL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  history_id UUID,
  lot_id UUID,
  open_vial_expiration_date DATE,
  print_queue_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_lot RECORD;
  v_product RECORD;
  v_history_id UUID;
  v_queue_id UUID;
  v_opened_at TIMESTAMPTZ := now();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lấy thông tin lô
  SELECT l.*, p.name AS product_name, p.sku AS product_sku,
         p.product_group, p.open_vial_stability_days AS product_stability
  INTO v_lot
  FROM lots l
  JOIN products p ON p.id = l.product_id
  WHERE l.id = p_lot_id;

  IF v_lot IS NULL THEN
    RAISE EXCEPTION 'Lot % not found', p_lot_id;
  END IF;

  -- Validate: lô phải APPROVED hoặc IN_USE
  IF v_lot.status NOT IN ('APPROVED', 'IN_USE') THEN
    RAISE EXCEPTION 'Cannot open vial: lot status = % (phải là APPROVED hoặc IN_USE)', v_lot.status;
  END IF;

  -- Validate: phải có open_vial_stability_days
  IF v_lot.product_stability IS NULL OR v_lot.product_stability <= 0 THEN
    RAISE EXCEPTION 'Product % chưa cấu hình open_vial_stability_days', v_lot.product_sku;
  END IF;

  -- Validate: quantity_remaining không vượt quá quantity hiện tại
  IF p_quantity_remaining < 0 THEN
    RAISE EXCEPTION 'quantity_remaining phải >= 0';
  END IF;

  IF p_quantity_taken < 0 THEN
    RAISE EXCEPTION 'quantity_taken phải >= 0';
  END IF;

  -- Insert open_vial_history
  INSERT INTO open_vial_history (
    tenant_id, lot_id, opened_at, opened_by,
    quantity_before, quantity_taken, quantity_after,
    open_vial_stability_days, open_vial_expiration_date,
    label_printed, notes
  ) VALUES (
    v_lot.tenant_id, p_lot_id, v_opened_at, v_user_id,
    COALESCE(v_lot.open_vial_quantity_remaining, v_lot.quantity),
    p_quantity_taken,
    p_quantity_remaining,
    v_lot.product_stability,
    (v_opened_at + (v_lot.product_stability || ' days')::INTERVAL)::DATE,
    FALSE, p_notes
  )
  RETURNING id INTO v_history_id;

  -- Cập nhật lots
  UPDATE lots
  SET
    status = 'IN_USE'::lot_status,
    open_vial_opened_at = v_opened_at,
    open_vial_opened_by = v_user_id,
    open_vial_quantity_remaining = p_quantity_remaining,
    open_vial_expiration_date = (v_opened_at + (v_lot.product_stability || ' days')::INTERVAL)::DATE,
    open_vial_stability_days = v_lot.product_stability,
    open_vial_count = COALESCE(open_vial_count, 0) + 1,
    updated_at = now()
  WHERE id = p_lot_id;

  -- Tạo print queue
  INSERT INTO open_vial_print_queue (
    tenant_id, open_vial_history_id, status
  ) VALUES (
    v_lot.tenant_id, v_history_id, 'PENDING'
  )
  RETURNING id INTO v_queue_id;

  -- Tạo lot_alert cho DEPT_HEAD
  INSERT INTO lot_alerts (tenant_id, lot_id, alert_type, alert_level, message, metadata)
  VALUES (
    v_lot.tenant_id, p_lot_id, 'OPEN_VIAL_EXPIRING'::lot_alert_type, 'INFO'::lot_alert_level,
    format('🧪 Mở nắp lô %s: open-vial hết hạn %s',
      v_lot.lot_number,
      (v_opened_at + (v_lot.product_stability || ' days')::INTERVAL)::DATE),
    jsonb_build_object(
      'open_vial_history_id', v_history_id,
      'opened_by', v_user_id,
      'stability_days', v_lot.product_stability
    )
  );

  history_id := v_history_id;
  lot_id := p_lot_id;
  open_vial_expiration_date := (v_opened_at + (v_lot.product_stability || ' days')::INTERVAL)::DATE;
  print_queue_id := v_queue_id;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_open_vial(UUID, DECIMAL, DECIMAL, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION fn_open_vial IS
  'Ghi nhận mở nắp lô HC-SP: insert open_vial_history + update lots + tạo print_queue + alert. Trả về history_id, open_vial_expiration_date, print_queue_id.';

-- =============================================================================
-- 2. fn_update_open_vial_volume: Cập nhật volume sau khi lấy thêm
-- =============================================================================
-- Khi KTV lấy thêm từ lọ đang mở (không tạo open_vial_history mới):
--   - Cập nhật open_vial_quantity_remaining trên lots
--   - KHÔNG tạo history (đây là lần lấy từ lọ đã mở)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_update_open_vial_volume(
  p_lot_id UUID,
  p_quantity_taken DECIMAL
)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lot RECORD;
  v_new_remaining DECIMAL;
BEGIN
  SELECT * INTO v_lot FROM lots WHERE id = p_lot_id;

  IF v_lot IS NULL THEN
    RAISE EXCEPTION 'Lot % not found', p_lot_id;
  END IF;

  IF v_lot.open_vial_opened_at IS NULL THEN
    RAISE EXCEPTION 'Lô chưa mở nắp, dùng fn_open_vial()';
  END IF;

  IF p_quantity_taken < 0 THEN
    RAISE EXCEPTION 'quantity_taken phải >= 0';
  END IF;

  v_new_remaining := COALESCE(v_lot.open_vial_quantity_remaining, 0) - p_quantity_taken;

  IF v_new_remaining < 0 THEN
    RAISE EXCEPTION 'Không đủ: còn %s, lấy %s', v_lot.open_vial_quantity_remaining, p_quantity_taken;
  END IF;

  UPDATE lots
  SET open_vial_quantity_remaining = v_new_remaining, updated_at = now()
  WHERE id = p_lot_id;

  RETURN v_new_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_update_open_vial_volume(UUID, DECIMAL) TO authenticated, service_role;

COMMENT ON FUNCTION fn_update_open_vial_volume IS
  'Cập nhật volume lọ open-vial khi lấy thêm (không tạo history mới). Trả về volume còn lại.';

-- =============================================================================
-- 3. fn_list_open_vial_expiring: Cron job - cảnh báo 7/3/1 ngày
-- =============================================================================
-- Tương tự fn_check_lot_expirations nhưng cho open-vial.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_list_open_vial_expiring()
RETURNS TABLE(
  lot_id UUID,
  lot_number TEXT,
  product_name TEXT,
  product_sku TEXT,
  open_vial_expiration_date DATE,
  days_until_expiry INT,
  alert_level lot_alert_level,
  message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lot RECORD;
  v_days INT;
  v_level lot_alert_level;
BEGIN
  FOR v_lot IN
    SELECT l.id, l.lot_number, l.open_vial_expiration_date,
           p.name AS product_name, p.sku AS product_sku
    FROM lots l
    JOIN products p ON p.id = l.product_id
    WHERE l.status = 'IN_USE'
      AND l.open_vial_expiration_date IS NOT NULL
      AND l.open_vial_expiration_date < CURRENT_DATE + INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM lot_alerts la
        WHERE la.lot_id = l.id
          AND la.alert_type = 'OPEN_VIAL_EXPIRING'
          AND la.resolved = FALSE
      )
  LOOP
    v_days := v_lot.open_vial_expiration_date - CURRENT_DATE;

    IF v_days < 0 THEN
      v_level := 'CRITICAL'::lot_alert_level;
    ELSIF v_days <= 1 THEN
      v_level := 'CRITICAL'::lot_alert_level;
    ELSIF v_days <= 3 THEN
      v_level := 'CRITICAL'::lot_alert_level;
    ELSE
      v_level := 'WARNING'::lot_alert_level;
    END IF;

    RETURN QUERY SELECT
      v_lot.id, v_lot.lot_number, v_lot.product_name, v_lot.product_sku,
      v_lot.open_vial_expiration_date, v_days, v_level,
      CASE
        WHEN v_days < 0 THEN format('🔴 [QUÁ HẠN %s ngày] %s (lô %s) — open-vial hết hạn %s',
          ABS(v_days), v_lot.product_name, v_lot.lot_number, v_lot.open_vial_expiration_date)
        WHEN v_days = 0 THEN format('🔴 [HẾT HẠN HÔM NAY] %s (lô %s) — open-vial',
          v_lot.product_name, v_lot.lot_number)
        ELSE format('🟡 [%s NGÀY] %s (lô %s) — open-vial hết hạn %s',
          v_days, v_lot.product_name, v_lot.lot_number, v_lot.open_vial_expiration_date)
      END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_list_open_vial_expiring() TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_list_open_vial_expiring IS
  'Cron 06:00 sáng: quét open-vial sắp hết hạn 7/3/1 ngày. Trả về danh sách lots + alert level.';

-- =============================================================================
-- 4. fn_get_open_vial_status: Trạng thái open-vial cho 1 lô
-- =============================================================================
-- Dùng cho UI hiển thị: có cần QC lại không, còn bao nhiêu ngày, còn bao nhiêu volume
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_get_open_vial_status(p_lot_id UUID)
RETURNS TABLE(
  is_open BOOLEAN,
  opened_at TIMESTAMPTZ,
  opened_by_user UUID,
  open_vial_expiration_date DATE,
  days_until_expiry INT,
  volume_remaining DECIMAL,
  needs_qc_retest BOOLEAN,
  qc_retest_reason TEXT,
  last_qc_retest_at TIMESTAMPTZ,
  last_qc_retest_result TEXT,
  qc_retest_valid_until DATE,
  open_vial_count INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lot RECORD;
  v_last_qc RECORD;
BEGIN
  SELECT l.*, p.open_vial_stability_days AS product_stability
  INTO v_lot
  FROM lots l
  JOIN products p ON p.id = l.product_id
  WHERE l.id = p_lot_id;

  IF v_lot IS NULL THEN
    RETURN;
  END IF;

  -- Last QC retest
  SELECT * INTO v_last_qc
  FROM lot_qc_records
  WHERE lot_id = p_lot_id
    AND qc_type = 'OPEN_VIAL_RETEST'
  ORDER BY qc_date DESC
  LIMIT 1;

  is_open := v_lot.open_vial_opened_at IS NOT NULL;
  opened_at := v_lot.open_vial_opened_at;
  opened_by_user := v_lot.open_vial_opened_by;
  open_vial_expiration_date := v_lot.open_vial_expiration_date;
  days_until_expiry := CASE
    WHEN v_lot.open_vial_expiration_date IS NULL THEN NULL
    ELSE v_lot.open_vial_expiration_date - CURRENT_DATE
  END;
  volume_remaining := v_lot.open_vial_quantity_remaining;
  open_vial_count := v_lot.open_vial_count;

  -- Cần QC lại?
  IF v_lot.open_vial_expiration_date IS NOT NULL
     AND CURRENT_DATE > v_lot.open_vial_expiration_date THEN
    -- Quá hạn
    IF v_last_qc IS NULL OR v_last_qc.qc_result != 'PASS' THEN
      needs_qc_retest := TRUE;
      qc_retest_reason := 'Đã quá hạn open-vial, chưa có QC lại PASS';
    ELSIF v_last_qc.valid_until IS NOT NULL AND v_last_qc.valid_until < CURRENT_DATE THEN
      needs_qc_retest := TRUE;
      qc_retest_reason := 'QC lại đã hết hiệu lực';
    ELSE
      needs_qc_retest := FALSE;
      qc_retest_reason := 'Đã có QC lại còn hiệu lực';
    END IF;
  ELSE
    needs_qc_retest := FALSE;
    qc_retest_reason := 'Còn hạn open-vial';
  END IF;

  last_qc_retest_at := v_last_qc.qc_completed_at;
  last_qc_retest_result := v_last_qc.qc_result::TEXT;
  qc_retest_valid_until := v_last_qc.valid_until;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_open_vial_status(UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_open_vial_status IS
  'Trả về trạng thái open-vial chi tiết cho 1 lô: opened, expiration, volume, cần QC lại?, lịch sử QC. Dùng cho UI.';

-- =============================================================================
-- 5. fn_complete_open_vial_qc: QC_OFFICER complete QC lại (wrapper)
-- =============================================================================
-- Gọi fn_complete_lot_qc với qc_type = OPEN_VIAL_RETEST
-- Validate: chỉ QC khi đã quá hạn open-vial
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_complete_open_vial_qc(
  p_lot_id UUID,
  p_qc_method TEXT,
  p_qc_result lot_qc_result,
  p_qc_notes TEXT,
  p_valid_until DATE DEFAULT NULL,
  p_control_normal_lot_id UUID DEFAULT NULL,
  p_control_pathological_lot_id UUID DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qc_record_id UUID;
  v_needs_qc BOOLEAN;
  v_reason TEXT;
BEGIN
  -- Lấy trạng thái
  SELECT needs_qc_retest, qc_retest_reason
  INTO v_needs_qc, v_reason
  FROM fn_get_open_vial_status(p_lot_id);

  IF NOT v_needs_qc THEN
    RAISE EXCEPTION 'Lô chưa quá hạn open-vial, không cần QC lại (reason: %)', v_reason;
  END IF;

  -- Gọi fn_complete_lot_qc (đã có sẵn từ module 2)
  v_qc_record_id := fn_complete_lot_qc(
    p_lot_id,
    'OPEN_VIAL_RETEST'::lot_qc_type,
    p_qc_method,
    p_qc_result,
    p_qc_notes,
    p_valid_until,
    p_control_normal_lot_id,
    p_control_pathological_lot_id,
    p_attachments
  );

  -- Nếu PASS → mở khóa lô (giữ status IN_USE, cập nhật last_qc_retest_*)
  -- Nếu FAIL → set status = QC_FAILED
  IF p_qc_result = 'PASS' THEN
    -- Lô vẫn dùng được, không cần đổi status
    NULL;  -- Đã được update bởi fn_complete_lot_qc
  ELSIF p_qc_result = 'FAIL' THEN
    UPDATE lots
    SET status = 'QC_FAILED'::lot_status, updated_at = now()
    WHERE id = p_lot_id;
  END IF;

  -- Resolve alert liên quan
  UPDATE lot_alerts
  SET resolved = TRUE, resolved_at = now()
  WHERE lot_id = p_lot_id
    AND alert_type = 'OPEN_VIAL_EXPIRING'
    AND resolved = FALSE;

  RETURN v_qc_record_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_complete_open_vial_qc(
  UUID, TEXT, lot_qc_result, TEXT, DATE, UUID, UUID, JSONB
) TO authenticated, service_role;

COMMENT ON FUNCTION fn_complete_open_vial_qc IS
  'QC_OFFICER complete QC lại cho lô open-vial quá hạn. Tự động validate + gọi fn_complete_lot_qc. Trả về qc_record_id.';
