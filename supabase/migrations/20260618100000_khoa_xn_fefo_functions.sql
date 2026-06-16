-- =============================================================================
-- Khoa XN — Module 2: FEFO Enforcement (First-Expire-First-Out)
-- File: supabase/migrations/20260618100000_khoa_xn_fefo_functions.sql
--
-- Auto-pick lô theo FEFO mở rộng (open-vial trước → expiration_date sớm nhất).
-- Override có lý do + audit log CRITICAL khi dùng lô hết hạn.
-- =============================================================================

-- =============================================================================
-- 1. ENUM: fefo_override_reason
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE fefo_override_reason AS ENUM (
    'FEFO_INSUFFICIENT',     -- Lô FEFO không đủ số lượng
    'FEFO_EXPIRED_SOON',     -- Lô FEFO sắp hết hạn, chờ nhập lô mới
    'FEFO_RECALLED',         -- Lô FEFO bị recall, không dùng được
    'EMERGENCY',             -- Cấp cứu
    'NO_OTHER_LOT',          -- Hết lô khác
    'OTHER'                  -- Khác (mô tả chi tiết)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. ENUM: fefo_audit_level
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE fefo_audit_level AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 3. Bảng FEFO_AUDIT_LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS fefo_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Reference
  document_type TEXT,                              -- 'STOCK_ISSUE' | 'STOCK_TRANSFER' | 'STOCK_TAKE'
  document_id UUID,                                -- ID phiếu liên quan
  document_number TEXT,

  -- Sản phẩm + kho
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  requested_quantity DECIMAL(15, 3) NOT NULL,

  -- Lot được FEFO khuyến nghị
  fefo_recommended_lot_ids UUID[] NOT NULL,        -- Top lots FEFO gợi ý
  fefo_first_lot_id UUID REFERENCES lots(id) ON DELETE SET NULL,
  fefo_first_lot_expiration DATE,

  -- Lot thực tế được dùng
  actual_lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  actual_lot_number TEXT NOT NULL,
  actual_lot_expiration DATE,
  actual_lot_status lot_status,

  -- Phân tích tuân thủ
  is_fefo_compliant BOOLEAN NOT NULL,              -- TRUE nếu dùng đúng FEFO
  is_expired_used BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE nếu dùng lô EXPIRED
  override_reason fefo_override_reason,
  override_description TEXT,                       -- Mô tả chi tiết (bắt buộc khi override)
  audit_level fefo_audit_level NOT NULL DEFAULT 'INFO',

  -- User
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_role_codes TEXT[],

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fefo_audit_tenant_date
  ON fefo_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fefo_audit_user
  ON fefo_audit_log(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fefo_audit_product
  ON fefo_audit_log(tenant_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fefo_audit_violations
  ON fefo_audit_log(tenant_id, is_fefo_compliant, created_at DESC)
  WHERE is_fefo_compliant = FALSE;

COMMENT ON TABLE fefo_audit_log IS
  'Khoa XN: audit log mọi lần pick lô (auto-FEFO + override + dùng lô hết hạn). Lưu 5 năm theo TT54.';

-- =============================================================================
-- 4. RLS cho fefo_audit_log
-- =============================================================================

ALTER TABLE fefo_audit_log ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: thấy audit log của tenant mình
DROP POLICY IF EXISTS fefo_audit_tenant_isolation ON fefo_audit_log;
CREATE POLICY fefo_audit_tenant_isolation ON fefo_audit_log
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

-- Service role bypass
DROP POLICY IF EXISTS fefo_audit_service_role ON fefo_audit_log;
CREATE POLICY fefo_audit_service_role ON fefo_audit_log
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON fefo_audit_log TO authenticated, service_role;

-- =============================================================================
-- 5. fn_pick_lot_fefo: Auto-pick lô theo FEFO mở rộng
-- =============================================================================
-- Thuật toán:
--   1. Lọc lots có status = APPROVED, quantity > 0
--   2. Nếu có lô open-vial (open_vial_opened_at IS NOT NULL)
--      → Ưu tiên open_vial_expiration_date sớm nhất
--   3. Nếu không có open-vial
--      → expiration_date sớm nhất
--   4. Nếu lô đầu không đủ → pick tiếp lô sau
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_pick_lot_fefo(
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity DECIMAL
)
RETURNS TABLE(
  lot_id UUID,
  lot_number TEXT,
  expiration_date DATE,
  open_vial_expiration_date DATE,
  is_open_vial BOOLEAN,
  available_quantity DECIMAL,
  pick_order INT,
  pick_reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_remaining DECIMAL := p_quantity;
  v_pick_order INT := 0;
  v_lot RECORD;
BEGIN
  -- Ưu tiên 1: Lots có open-vial (đã mở nắp), sắp xếp theo open_vial_expiration_date sớm nhất
  FOR v_lot IN
    SELECT
      l.id, l.lot_number, l.expiration_date,
      l.open_vial_expiration_date, l.open_vial_quantity_remaining,
      l.quantity, l.status,
      CASE
        WHEN l.open_vial_opened_at IS NOT NULL THEN 0  -- Open-vial ưu tiên 0
        ELSE 1                                         -- Chưa mở ưu tiên 1
      END AS priority_group
    FROM lots l
    WHERE l.product_id = p_product_id
      AND l.warehouse_id = p_warehouse_id
      AND l.status = 'APPROVED'::lot_status
      AND l.quantity > 0
      -- Bỏ qua lô EXPIRED/BLOCKED/QC_FAILED/DESTROYED (status filter đã loại trừ)
      -- Bỏ qua lô có open_vial_expiration_date < hôm nay (đã hết hạn open-vial, cần QC lại trước)
      AND (
        l.open_vial_opened_at IS NULL
        OR l.open_vial_expiration_date >= CURRENT_DATE
      )
    ORDER BY
      priority_group ASC,
      COALESCE(l.open_vial_expiration_date, l.expiration_date) ASC,
      l.expiration_date ASC,
      l.created_at ASC
  LOOP
    -- Tính quantity thực tế pick được từ lô này
    DECLARE
      v_pick_qty DECIMAL;
    BEGIN
      IF v_lot.open_vial_opened_at IS NOT NULL AND v_lot.open_vial_quantity_remaining IS NOT NULL THEN
        -- Open-vial: dùng open_vial_quantity_remaining thay vì quantity
        v_pick_qty := LEAST(v_lot.open_vial_quantity_remaining, v_remaining);
      ELSE
        v_pick_qty := LEAST(v_lot.quantity, v_remaining);
      END IF;

      IF v_pick_qty > 0 THEN
        v_pick_order := v_pick_order + 1;
        v_remaining := v_remaining - v_pick_qty;

        RETURN QUERY SELECT
          v_lot.id,
          v_lot.lot_number,
          v_lot.expiration_date,
          v_lot.open_vial_expiration_date,
          (v_lot.open_vial_opened_at IS NOT NULL),
          v_pick_qty,
          v_pick_order,
          CASE
            WHEN v_lot.open_vial_opened_at IS NOT NULL
            THEN format('Open-vial (còn %s ngày)', v_lot.open_vial_expiration_date - CURRENT_DATE)
            ELSE format('FEFO (còn %s ngày)', v_lot.expiration_date - CURRENT_DATE)
          END;
      END IF;

      -- Đã pick đủ → thoát
      EXIT WHEN v_remaining <= 0;
    END;
  END LOOP;

  -- Trả về thêm 1 row "INSUFFICIENT" indicator nếu không pick đủ
  IF v_remaining > 0 THEN
    RETURN QUERY SELECT
      NULL::UUID,
      '[INSUFFICIENT]'::TEXT,
      NULL::DATE,
      NULL::DATE,
      FALSE,
      v_remaining,  -- Số lượng còn thiếu
      v_pick_order + 1,
      format('Không đủ hàng: còn thiếu %s', v_remaining);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_pick_lot_fefo(UUID, UUID, DECIMAL) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_pick_lot_fefo IS
  'Auto-pick lô theo FEFO mở rộng (open-vial trước → expiration_date). Trả về list lots theo thứ tự ưu tiên + qty cần lấy từ mỗi lô. Nếu thiếu → trả thêm 1 row INSUFFICIENT.';

-- =============================================================================
-- 6. fn_record_fefo_pick: Ghi audit log khi pick (auto-FEFO hoặc override)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_record_fefo_pick(
  p_product_id UUID,
  p_warehouse_id UUID,
  p_requested_quantity DECIMAL,
  p_actual_lot_id UUID,
  p_document_type TEXT DEFAULT NULL,
  p_document_id UUID DEFAULT NULL,
  p_document_number TEXT DEFAULT NULL,
  p_override_reason fefo_override_reason DEFAULT NULL,
  p_override_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id UUID;
  v_user_id UUID;
  v_user_roles TEXT[];
  v_actual_lot RECORD;
  v_fefo_lot_id UUID;
  v_fefo_lot_expiration DATE;
  v_fefo_recommended UUID[];
  v_is_compliant BOOLEAN;
  v_is_expired BOOLEAN := FALSE;
  v_audit_level fefo_audit_level := 'INFO';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lấy thông tin user roles
  SELECT role_codes INTO v_user_roles
  FROM user_role_assignments
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Lấy thông tin lot thực tế dùng
  SELECT id, lot_number, expiration_date, status, quantity
  INTO v_actual_lot
  FROM lots
  WHERE id = p_actual_lot_id;

  IF v_actual_lot IS NULL THEN
    RAISE EXCEPTION 'Lot % not found', p_actual_lot_id;
  END IF;

  -- Lấy danh sách FEFO khuyến nghị (chỉ lấy top 3 để audit)
  SELECT ARRAY_AGG(lot_id ORDER BY pick_order)
  INTO v_fefo_recommended
  FROM fn_pick_lot_fefo(p_product_id, p_warehouse_id, p_requested_quantity)
  WHERE lot_id IS NOT NULL
  LIMIT 3;

  -- Lấy FEFO đầu tiên
  SELECT lot_id, expiration_date
  INTO v_fefo_lot_id, v_fefo_lot_expiration
  FROM fn_pick_lot_fefo(p_product_id, p_warehouse_id, p_requested_quantity)
  WHERE lot_id IS NOT NULL
  ORDER BY pick_order
  LIMIT 1;

  -- Xác định tuân thủ
  v_is_compliant := (v_fefo_lot_id = p_actual_lot_id);
  v_is_expired := (v_actual_lot.status = 'EXPIRED'::lot_status);

  -- Xác định audit level
  IF v_is_expired THEN
    v_audit_level := 'CRITICAL';
  ELSIF NOT v_is_compliant THEN
    v_audit_level := 'WARNING';
  ELSE
    v_audit_level := 'INFO';
  END IF;

  -- Ghi audit log
  INSERT INTO fefo_audit_log (
    tenant_id, document_type, document_id, document_number,
    product_id, warehouse_id, requested_quantity,
    fefo_recommended_lot_ids, fefo_first_lot_id, fefo_first_lot_expiration,
    actual_lot_id, actual_lot_number, actual_lot_expiration, actual_lot_status,
    is_fefo_compliant, is_expired_used,
    override_reason, override_description, audit_level,
    user_id, user_role_codes
  ) VALUES (
    (SELECT tenant_id FROM lots WHERE id = p_actual_lot_id),
    p_document_type, p_document_id, p_document_number,
    p_product_id, p_warehouse_id, p_requested_quantity,
    COALESCE(v_fefo_recommended, ARRAY[]::UUID[]),
    v_fefo_lot_id, v_fefo_lot_expiration,
    p_actual_lot_id, v_actual_lot.lot_number, v_actual_lot.expiration_date, v_actual_lot.status,
    v_is_compliant, v_is_expired,
    p_override_reason, p_override_description, v_audit_level,
    v_user_id, v_user_roles
  )
  RETURNING id INTO v_audit_id;

  -- Nếu CRITICAL (dùng lô hết hạn) → tạo notification cho DEPT_HEAD
  IF v_audit_level = 'CRITICAL' THEN
    INSERT INTO lot_alerts (tenant_id, lot_id, alert_type, alert_level, message, metadata)
    VALUES (
      (SELECT tenant_id FROM lots WHERE id = p_actual_lot_id),
      p_actual_lot_id,
      'FEFO_VIOLATION'::lot_alert_type,
      'CRITICAL'::lot_alert_level,
      format('🔴 Thủ kho %s dùng lô HẾT HẠN %s: %s. Lý do: %s',
        v_user_id, v_actual_lot.lot_number, v_actual_lot.expiration_date,
        COALESCE(p_override_description, 'N/A')),
      jsonb_build_object(
        'fefo_audit_id', v_audit_id,
        'user_id', v_user_id,
        'lot_id', p_actual_lot_id,
        'product_id', p_product_id,
        'reason', p_override_reason
      )
    );
  END IF;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_record_fefo_pick(
  UUID, UUID, DECIMAL, UUID,
  TEXT, UUID, TEXT,
  fefo_override_reason, TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION fn_record_fefo_pick IS
  'Ghi audit log khi pick lot (auto-FEFO hoặc override). Nếu dùng lô EXPIRED → tạo CRITICAL alert cho DEPT_HEAD.';

-- =============================================================================
-- 7. fn_fefo_compliance_report: Báo cáo compliance theo tháng
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_fefo_compliance_report(
  p_tenant_id UUID,
  p_year INT,
  p_month INT
)
RETURNS TABLE(
  total_picks INT,
  compliant_picks INT,
  override_picks INT,
  expired_picks INT,
  compliance_rate DECIMAL,
  override_rate DECIMAL,
  top_overridden_products JSONB,
  top_override_users JSONB,
  top_override_reasons JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_total INT;
  v_compliant INT;
  v_override INT;
  v_expired INT;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month')::DATE;

  -- Tổng picks
  SELECT COUNT(*) INTO v_total
  FROM fefo_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= v_start_date
    AND created_at < v_end_date;

  -- Tuân thủ
  SELECT COUNT(*) INTO v_compliant
  FROM fefo_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= v_start_date
    AND created_at < v_end_date
    AND is_fefo_compliant = TRUE;

  -- Override (không tuân thủ)
  SELECT COUNT(*) INTO v_override
  FROM fefo_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= v_start_date
    AND created_at < v_end_date
    AND is_fefo_compliant = FALSE
    AND is_expired_used = FALSE;

  -- Dùng lô hết hạn
  SELECT COUNT(*) INTO v_expired
  FROM fefo_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= v_start_date
    AND created_at < v_end_date
    AND is_expired_used = TRUE;

  -- Trả về kết quả
  total_picks := v_total;
  compliant_picks := v_compliant;
  override_picks := v_override;
  expired_picks := v_expired;
  compliance_rate := CASE WHEN v_total > 0 THEN ROUND(v_compliant::DECIMAL / v_total, 4) ELSE 0 END;
  override_rate := CASE WHEN v_total > 0 THEN ROUND(v_override::DECIMAL / v_total, 4) ELSE 0 END;

  -- Top 5 sản phẩm hay bị override
  SELECT jsonb_agg(row_to_json(t))
  INTO top_overridden_products
  FROM (
    SELECT
      p.id AS product_id,
      p.sku,
      p.name,
      COUNT(*) AS override_count
    FROM fefo_audit_log fal
    JOIN products p ON p.id = fal.product_id
    WHERE fal.tenant_id = p_tenant_id
      AND fal.created_at >= v_start_date
      AND fal.created_at < v_end_date
      AND fal.is_fefo_compliant = FALSE
    GROUP BY p.id, p.sku, p.name
    ORDER BY override_count DESC
    LIMIT 5
  ) t;

  -- Top 5 user hay override
  SELECT jsonb_agg(row_to_json(t))
  INTO top_override_users
  FROM (
    SELECT
      fal.user_id,
      u.email,
      COUNT(*) AS override_count
    FROM fefo_audit_log fal
    LEFT JOIN auth.users u ON u.id = fal.user_id
    WHERE fal.tenant_id = p_tenant_id
      AND fal.created_at >= v_start_date
      AND fal.created_at < v_end_date
      AND fal.is_fefo_compliant = FALSE
    GROUP BY fal.user_id, u.email
    ORDER BY override_count DESC
    LIMIT 5
  ) t;

  -- Top lý do override
  SELECT jsonb_agg(row_to_json(t))
  INTO top_override_reasons
  FROM (
    SELECT
      override_reason,
      COUNT(*) AS reason_count
    FROM fefo_audit_log
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_start_date
      AND created_at < v_end_date
      AND is_fefo_compliant = FALSE
      AND override_reason IS NOT NULL
    GROUP BY override_reason
    ORDER BY reason_count DESC
    LIMIT 5
  ) t;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_fefo_compliance_report(UUID, INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION fn_fefo_compliance_report IS
  'Báo cáo FEFO compliance theo tháng: tổng picks, tỷ lệ tuân thủ, top override products/users/reasons. Dành cho DEPT_HEAD.';

-- =============================================================================
-- 8. Grant cuối
-- =============================================================================

GRANT USAGE ON TYPE fefo_override_reason TO authenticated, service_role;
GRANT USAGE ON TYPE fefo_audit_level TO authenticated, service_role;
