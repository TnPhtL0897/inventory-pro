-- =============================================================================
-- Khoa XN — Module 2: Lot functions + auto EXPIRED trigger
-- File: supabase/migrations/20260615120000_khoa_xn_lot_functions.sql
-- =============================================================================

-- =============================================================================
-- 1. fn_check_lot_expirations: cảnh báo 30/15/7 ngày
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_check_lot_expirations()
RETURNS TABLE(
  lot_id UUID,
  alert_type lot_alert_type,
  alert_level lot_alert_level,
  message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lot RECORD;
  v_days_until_expiry INT;
  v_level lot_alert_level;
BEGIN
  -- Tìm lots sắp hết hạn (chưa alert)
  FOR v_lot IN
    SELECT l.id, l.lot_number, l.expiration_date,
           p.name AS product_name, p.product_group
    FROM lots l
    JOIN products p ON p.id = l.product_id
    WHERE l.status IN ('APPROVED', 'IN_USE', 'PENDING_QC', 'IN_QC')
      AND l.expiration_date < CURRENT_DATE + INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM lot_alerts la
        WHERE la.lot_id = l.id
          AND la.alert_type = 'EXPIRING_SOON'
          AND la.resolved = FALSE
      )
  LOOP
    v_days_until_expiry := v_lot.expiration_date - CURRENT_DATE;

    IF v_days_until_expiry < 0 THEN
      v_level := 'CRITICAL'::lot_alert_level;
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON'::lot_alert_type, v_level,
        format('[ĐÃ HẾT HẠN] %s (lô %s) — quá %s ngày',
          v_lot.product_name, v_lot.lot_number, ABS(v_days_until_expiry));
    ELSIF v_days_until_expiry <= 7 THEN
      v_level := 'CRITICAL'::lot_alert_level;
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON'::lot_alert_type, v_level,
        format('[7 NGÀY] %s (lô %s) sắp hết hạn trong %s ngày',
          v_lot.product_name, v_lot.lot_number, v_days_until_expiry);
    ELSIF v_days_until_expiry <= 15 THEN
      v_level := 'WARNING'::lot_alert_level;
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON'::lot_alert_type, v_level,
        format('[15 NGÀY] %s (lô %s) sắp hết hạn trong %s ngày',
          v_lot.product_name, v_lot.lot_number, v_days_until_expiry);
    ELSE
      v_level := 'INFO'::lot_alert_level;
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON'::lot_alert_type, v_level,
        format('[30 NGÀY] %s (lô %s) sẽ hết hạn trong %s ngày',
          v_lot.product_name, v_lot.lot_number, v_days_until_expiry);
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_check_lot_expirations() IS
  'Cron 06:00 sáng: quét lots sắp hết hạn 30/15/7 ngày, tạo cảnh báo. Idempotent.';

-- =============================================================================
-- 2. fn_auto_expire_lots: auto EXPIRED + tạo DisposalRequest
-- Chạy 00:30 sáng hàng ngày
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_auto_expire_lots()
RETURNS TABLE(
  total_expired INT,
  total_disposal_created INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_lot RECORD;
  v_disposal_id UUID;
  v_total_disposal INT := 0;
BEGIN
  -- Bước 1: Cập nhật status = EXPIRED
  UPDATE lots
  SET status = 'EXPIRED'::lot_status, updated_at = now()
  WHERE status IN ('APPROVED', 'IN_USE', 'PENDING_QC', 'IN_QC', 'QUARANTINE')
    AND expiration_date < CURRENT_DATE
    AND expiration_date IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Bước 2: Tạo DisposalRequest cho lô EXPIRED còn tồn kho
  FOR v_lot IN
    SELECT l.id, l.tenant_id, l.product_id, l.quantity, l.expiration_date
    FROM lots l
    WHERE l.status = 'EXPIRED'
      AND l.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM disposal_request_lines drl
        JOIN disposal_requests dr ON dr.id = drl.disposal_request_id
        WHERE drl.lot_id = l.id
          AND dr.status != 'CANCELLED'
      )
  LOOP
    -- Tạo DisposalRequest
    INSERT INTO disposal_requests (
      tenant_id, request_number, reason, status,
      auto_generated, total_estimated_value, requires_dept_head_approval,
      created_by
    ) VALUES (
      v_lot.tenant_id,
      'DR-EXP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || substring(v_lot.id::text, 1, 8),
      'Hết hạn sử dụng',
      'PENDING'::disposal_status,
      TRUE,
      -- Ước tính giá trị = quantity * cost_price (sẽ update khi approve)
      0,
      -- Yêu cầu duyệt nếu > 5M VNĐ
      FALSE,
      NULL  -- System tạo
    )
    RETURNING id INTO v_disposal_id;

    -- Tạo line
    INSERT INTO disposal_request_lines (
      disposal_request_id, lot_id, product_id, quantity,
      expiration_date, reason
    ) VALUES (
      v_disposal_id, v_lot.id, v_lot.product_id, v_lot.quantity,
      v_lot.expiration_date, 'Hết hạn sử dụng'
    );

    v_total_disposal := v_total_disposal + 1;

    -- Tạo lot_alert để thủ kho biết
    INSERT INTO lot_alerts (tenant_id, lot_id, alert_type, alert_level, message)
    VALUES (
      v_lot.tenant_id, v_lot.id, 'EXPIRING_SOON'::lot_alert_type,
      'CRITICAL'::lot_alert_level,
      'Lô đã hết hạn — đã tạo phiếu hủy tự động'
    );
  END LOOP;

  total_expired := v_count;
  total_disposal_created := v_total_disposal;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fn_auto_expire_lots() IS
  'Cron 00:30 sáng: tự động EXPIRED lô hết hạn + tạo DisposalRequest. Idempotent.';

-- =============================================================================
-- 3. fn_apply_recall_to_lots: auto BLOCK khi có recall
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_apply_recall_to_lots(p_recall_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_recall RECORD;
  v_lot_number TEXT;
  v_lot_ids UUID[];
BEGIN
  SELECT * INTO v_recall FROM recall_notices WHERE id = p_recall_id;

  IF v_recall IS NULL THEN
    RAISE EXCEPTION 'Recall notice % not found', p_recall_id;
  END IF;

  -- Tìm tất cả lots matching affected_lot_numbers
  -- (skip lots đã DESTROYED/EXPIRED)
  FOREACH v_lot_number IN ARRAY v_recall.affected_lot_numbers
  LOOP
    UPDATE lots
    SET status = 'BLOCKED'::lot_status,
        recall_notice_id = p_recall_id,
        recall_blocked_at = now(),
        updated_at = now()
    WHERE tenant_id = v_recall.tenant_id
      AND lot_number = v_lot_number
      AND status NOT IN ('DESTROYED', 'EXPIRED', 'BLOCKED');

    -- Tạo lot_alert cho từng lô BLOCKED
    INSERT INTO lot_alerts (tenant_id, lot_id, alert_type, alert_level, message, metadata)
    SELECT
      v_recall.tenant_id, l.id, 'RECALL'::lot_alert_type, 'CRITICAL'::lot_alert_level,
      format('Lô %s bị RECALL: %s (severity: %s)', l.lot_number, v_recall.reason, v_recall.severity),
      jsonb_build_object('recall_id', p_recall_id, 'severity', v_recall.severity)
    FROM lots l
    WHERE l.tenant_id = v_recall.tenant_id
      AND l.lot_number = v_lot_number
      AND l.recall_notice_id = p_recall_id;
  END LOOP;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION fn_apply_recall_to_lots(UUID) IS
  'Khi tạo recall_notice → tự động BLOCK tất cả lots matching lot_number. Trả về số lô bị BLOCK.';

-- =============================================================================
-- 4. Trigger: auto apply recall khi insert recall_notices
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_recall_apply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Gọi fn_apply_recall_to_lots ngay khi tạo recall
  PERFORM fn_apply_recall_to_lots(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recall_insert ON recall_notices;
CREATE TRIGGER trg_recall_insert
  AFTER INSERT ON recall_notices
  FOR EACH ROW
  WHEN (NEW.status = 'ACTIVE')
  EXECUTE FUNCTION trg_recall_apply();

-- =============================================================================
-- 5. fn_complete_qc: helper cho QC_OFFICER complete QC
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_complete_lot_qc(
  p_lot_id UUID,
  p_qc_type lot_qc_type,
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
  v_user_id UUID;
  v_lot RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_lot FROM lots WHERE id = p_lot_id;
  IF v_lot IS NULL THEN
    RAISE EXCEPTION 'Lot % not found', p_lot_id;
  END IF;

  -- Insert QC record
  INSERT INTO lot_qc_records (
    tenant_id, lot_id, qc_type, qc_method, qc_result, qc_notes,
    qc_date, qc_completed_at, valid_until,
    control_normal_lot_id, control_pathological_lot_id,
    attachments, qc_officer_id
  ) VALUES (
    v_lot.tenant_id, p_lot_id, p_qc_type, p_qc_method, p_qc_result, p_qc_notes,
    CURRENT_DATE, now(), p_valid_until,
    p_control_normal_lot_id, p_control_pathological_lot_id,
    p_attachments, v_user_id
  )
  RETURNING id INTO v_qc_record_id;

  -- Update lot status
  IF p_qc_type = 'INITIAL' THEN
    IF p_qc_result = 'PASS' THEN
      UPDATE lots
      SET status = 'APPROVED'::lot_status,
          qc_completed_at = now(),
          updated_at = now()
      WHERE id = p_lot_id;
    ELSIF p_qc_result = 'FAIL' THEN
      UPDATE lots
      SET status = 'QC_FAILED'::lot_status,
          qc_completed_at = now(),
          updated_at = now()
      WHERE id = p_lot_id;
    END IF;
  ELSIF p_qc_type = 'OPEN_VIAL_RETEST' THEN
    UPDATE lots
    SET last_qc_retest_at = now(),
        last_qc_retest_result = p_qc_result,
        qc_retest_valid_until = p_valid_until,
        updated_at = now()
    WHERE id = p_lot_id;
  END IF;

  -- Resolve lot_alert liên quan
  UPDATE lot_alerts
  SET resolved = TRUE, resolved_at = now(), resolved_by = v_user_id
  WHERE lot_id = p_lot_id
    AND alert_type = 'QC_REQUIRED'
    AND resolved = FALSE;

  RETURN v_qc_record_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_complete_lot_qc(
  UUID, lot_qc_type, TEXT, lot_qc_result, TEXT, DATE, UUID, UUID, JSONB
) TO authenticated;

COMMENT ON FUNCTION fn_complete_lot_qc IS
  'QC_OFFICER complete QC cho 1 lô. Tự động cập nhật lots.status.';

-- =============================================================================
-- 6. Grant
-- =============================================================================

GRANT EXECUTE ON FUNCTION fn_check_lot_expirations() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_auto_expire_lots() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION fn_apply_recall_to_lots(UUID) TO authenticated, service_role;
