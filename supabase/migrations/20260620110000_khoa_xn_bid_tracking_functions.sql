-- =============================================================================
-- Khoa XN — Module 8: Bid Tracking Full Workflow (improvements)
-- File: supabase/migrations/20260620110000_khoa_xn_bid_tracking_functions.sql
--
-- Cải tiến: cảnh báo 90/60/30 ngày hết HĐ + 80%/90% cơ số + dashboard
-- =============================================================================

-- =============================================================================
-- 1. fn_list_bid_contracts_expiring: cảnh báo 90/60/30 ngày
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_list_bid_contracts_expiring()
RETURNS TABLE(
  contract_id UUID,
  contract_number TEXT,
  supplier_name TEXT,
  end_date DATE,
  days_until_expiry INT,
  alert_level TEXT,
  total_contract_value NUMERIC,
  used_value NUMERIC,
  remaining_value NUMERIC,
  usage_percent DECIMAL,
  message TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_contract RECORD;
  v_days INT;
  v_level TEXT;
  v_usage_pct DECIMAL;
BEGIN
  FOR v_contract IN
    SELECT
      bc.id, bc.contract_number, bc.end_date, bc.contract_value,
      p.name AS supplier_name
    FROM bid_contracts bc
    JOIN parties p ON p.id = bc.winning_party_id
    WHERE bc.status = 'ACTIVE'
      AND bc.end_date < CURRENT_DATE + INTERVAL '90 days'
  LOOP
    v_days := v_contract.end_date - CURRENT_DATE;
    v_usage_pct := 0;  -- TODO: tính từ bid_contract_lines + goods_receipts

    IF v_days < 0 THEN
      v_level := 'EXPIRED';
    ELSIF v_days <= 30 THEN
      v_level := 'CRITICAL';
    ELSIF v_days <= 60 THEN
      v_level := 'WARNING';
    ELSE
      v_level := 'INFO';
    END IF;

    RETURN QUERY SELECT
      v_contract.id, v_contract.contract_number, v_contract.supplier_name,
      v_contract.end_date, v_days, v_level,
      v_contract.contract_value,
      0::NUMERIC,    -- used_value (sẽ tính ở bước 2)
      v_contract.contract_value,  -- remaining_value
      v_usage_pct,
      CASE
        WHEN v_days < 0 THEN format('🔴 [QUÁ HẠN %s ngày] HĐ %s - NCC %s',
          ABS(v_days), v_contract.contract_number, v_contract.supplier_name)
        WHEN v_days <= 30 THEN format('🔴 [30 NGÀY] HĐ %s - NCC %s hết hạn %s',
          v_contract.contract_number, v_contract.supplier_name, v_contract.end_date)
        WHEN v_days <= 60 THEN format('🟡 [60 NGÀY] HĐ %s - NCC %s hết hạn %s',
          v_contract.contract_number, v_contract.supplier_name, v_contract.end_date)
        ELSE format('ℹ️ [90 NGÀY] HĐ %s - NCC %s hết hạn %s',
          v_contract.contract_number, v_contract.supplier_name, v_contract.end_date)
      END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_list_bid_contracts_expiring() TO authenticated, service_role;

COMMENT ON FUNCTION fn_list_bid_contracts_expiring IS
  'Cron 06:00 sáng: quét HĐ thầu ACTIVE sắp hết hạn 90/60/30 ngày + cảnh báo.';

-- =============================================================================
-- 2. fn_bid_contract_dashboard: dashboard tổng quan HĐ
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_bid_contract_dashboard()
RETURNS TABLE(
  total_contracts INT,
  active_contracts INT,
  expiring_30_days INT,
  expiring_60_days INT,
  expiring_90_days INT,
  total_contract_value NUMERIC,
  total_used_value NUMERIC,
  total_remaining_value NUMERIC,
  avg_usage_percent DECIMAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  SELECT COUNT(*) INTO total_contracts FROM bid_contracts;
  SELECT COUNT(*) INTO active_contracts FROM bid_contracts WHERE status = 'ACTIVE';

  SELECT COUNT(*) INTO expiring_30_days
  FROM bid_contracts
  WHERE status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '30 days';

  SELECT COUNT(*) INTO expiring_60_days
  FROM bid_contracts
  WHERE status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '60 days';

  SELECT COUNT(*) INTO expiring_90_days
  FROM bid_contracts
  WHERE status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '90 days';

  SELECT COALESCE(SUM(contract_value), 0) INTO total_contract_value
  FROM bid_contracts WHERE status = 'ACTIVE';

  SELECT COALESCE(SUM(used_value), 0) INTO total_used_value
  FROM bid_contracts WHERE status = 'ACTIVE';

  total_remaining_value := total_contract_value - total_used_value;

  avg_usage_percent := CASE
    WHEN total_contract_value > 0
    THEN ROUND(total_used_value / total_contract_value, 4)
    ELSE 0
  END;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_bid_contract_dashboard() TO authenticated, service_role;

COMMENT ON FUNCTION fn_bid_contract_dashboard IS
  'Dashboard tổng quan HĐ: tổng/active/expiring, tổng giá trị + đã dùng + còn lại + % sử dụng TB. Dùng cho trang chủ.';
