-- =============================================================================
-- Khoa XN — Module 2: Lot Lifecycle Management
-- File: supabase/migrations/20260615090000_khoa_xn_lots.sql
--
-- Bảng `lots` — vòng đời lô sản phẩm (Quarantine → Approved → In Use → Expired).
-- Bảng `lot_qc_records` — lịch sử QC (chỉ áp dụng cho HC-SP).
-- =============================================================================

-- =============================================================================
-- 1. ENUMs
-- =============================================================================

-- Lot status (10 trạng thái)
DO $$ BEGIN
  CREATE TYPE lot_status AS ENUM (
    'QUARANTINE',     -- Vừa nhập, đang kiểm tra sơ bộ
    'PENDING_QC',     -- Chờ QC duyệt (HC-SP)
    'IN_QC',          -- QC đang kiểm tra
    'APPROVED',       -- Đạt chất lượng, sẵn sàng sử dụng
    'IN_USE',         -- Đang được sử dụng (đã mở nắp)
    'DEPLETED',       -- Hết số lượng (còn hạn nhưng không còn hàng)
    'EXPIRED',        -- Hết hạn sử dụng
    'DESTROYED',      -- Đã xuất hủy
    'QC_FAILED',      -- QC không đạt
    'BLOCKED'         -- Bị recall / vấn đề chất lượng
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- QC result
DO $$ BEGIN
  CREATE TYPE lot_qc_result AS ENUM ('PASS', 'FAIL', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- QC type (phân biệt QC ban đầu vs QC lại open-vial)
DO $$ BEGIN
  CREATE TYPE lot_qc_type AS ENUM (
    'INITIAL',          -- QC ban đầu khi nhập lô HC-SP
    'OPEN_VIAL_RETEST', -- QC lại sau khi lô open-vial quá hạn
    'PERIODIC'          -- QC định kỳ (optional, dành cho tương lai)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Bảng LOTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Reference
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Thông tin lô
  lot_number TEXT NOT NULL,
  manufacturer_date DATE,
  expiration_date DATE NOT NULL,
  quantity DECIMAL(15, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  package_volume DECIMAL(15, 3),                 -- Volume ban đầu của lọ (vd: 100ml)

  -- Bảo quản
  storage_condition TEXT,                          -- ROOM_TEMP/REFRIGERATED/FROZEN/PROTECTED_FROM_LIGHT/DRY_PLACE

  -- Trạng thái
  status lot_status NOT NULL DEFAULT 'QUARANTINE',

  -- QC (chỉ áp dụng HC-SP)
  qc_required BOOLEAN NOT NULL DEFAULT TRUE,
  qc_required_at TIMESTAMPTZ,                     -- Khi nào yêu cầu QC
  qc_completed_at TIMESTAMPTZ,

  -- Open-vial (sẽ populate bởi open_vial_history trigger)
  open_vial_opened_at TIMESTAMPTZ,
  open_vial_opened_by UUID REFERENCES auth.users(id),
  open_vial_quantity_remaining DECIMAL(15, 3),
  open_vial_expiration_date DATE,
  open_vial_stability_days INT,                   -- Snapshot từ product lúc mở
  open_vial_count INT NOT NULL DEFAULT 0,         -- Số lần đã mở nắp

  -- QC lại (cho open-vial quá hạn)
  last_qc_retest_at TIMESTAMPTZ,
  last_qc_retest_result lot_qc_result,
  qc_retest_valid_until DATE,

  -- Recall
  recall_notice_id UUID,                          -- FK sẽ tạo ở migration recall
  recall_blocked_at TIMESTAMPTZ,

  -- File đính kèm
  certificate_of_analysis_url TEXT,               -- CoA từ NCC
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mỗi lot_number là duy nhất trong (tenant, product, warehouse)
  -- Cho phép cùng lot_number ở 2 kho khác nhau (vd: BULK + DAILY)
  UNIQUE (tenant_id, product_id, warehouse_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_lots_tenant_product
  ON lots(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_lots_status
  ON lots(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_expiration
  ON lots(tenant_id, expiration_date)
  WHERE status NOT IN ('DESTROYED', 'EXPIRED');
CREATE INDEX IF NOT EXISTS idx_lots_open_vial_exp
  ON lots(tenant_id, open_vial_expiration_date)
  WHERE open_vial_expiration_date IS NOT NULL
    AND status IN ('APPROVED', 'IN_USE');
CREATE INDEX IF NOT EXISTS idx_lots_recall
  ON lots(tenant_id, recall_notice_id)
  WHERE recall_notice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lots_lot_number
  ON lots(tenant_id, lot_number);

-- Trigger: tự động set updated_at
DROP TRIGGER IF EXISTS trg_lots_updated_at ON lots;
CREATE TRIGGER trg_lots_updated_at
  BEFORE UPDATE ON lots
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

-- Comment
COMMENT ON TABLE lots IS 'Khoa XN: lô sản phẩm với vòng đời đầy đủ (10 trạng thái)';
COMMENT ON COLUMN lots.qc_required IS 'HC-SP: TRUE (QC bắt buộc). VTYT: FALSE (auto-approve)';
COMMENT ON COLUMN lots.open_vial_stability_days IS 'Snapshot từ product.open_vial_stability_days lúc mở nắp';

-- =============================================================================
-- 3. Bảng LOT_QC_RECORDS (lịch sử QC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lot_qc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  qc_type lot_qc_type NOT NULL DEFAULT 'INITIAL',
  qc_method TEXT,                                  -- "Visual + pH", "Chạy control", "Đo OD", ...
  qc_result lot_qc_result NOT NULL,
  qc_notes TEXT,
  qc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qc_started_at TIMESTAMPTZ,
  qc_completed_at TIMESTAMPTZ,

  -- QC quyết định
  valid_until DATE,                                -- Cho OPEN_VIAL_RETEST: QC có hiệu lực đến
  decision_notes TEXT,

  -- Control/calibrator lot sử dụng (nếu có)
  control_normal_lot_id UUID REFERENCES lots(id),
  control_pathological_lot_id UUID REFERENCES lots(id),

  -- File đính kèm
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Người thực hiện
  qc_officer_id UUID NOT NULL REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lot_qc_lot ON lot_qc_records(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_qc_officer ON lot_qc_records(qc_officer_id);
CREATE INDEX IF NOT EXISTS idx_lot_qc_date ON lot_qc_records(tenant_id, qc_date DESC);
CREATE INDEX IF NOT EXISTS idx_lot_qc_pass
  ON lot_qc_records(lot_id, qc_result)
  WHERE qc_result = 'PASS';

COMMENT ON TABLE lot_qc_records IS 'Khoa XN: lịch sử QC cho từng lô (INITIAL, OPEN_VIAL_RETEST, PERIODIC)';

-- =============================================================================
-- 4. RLS cho LOTS
-- =============================================================================

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_qc_records ENABLE ROW LEVEL SECURITY;

-- LOTS: SELECT theo product_group
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'lots_keeper_product_group'
  ) THEN
    CREATE POLICY lots_keeper_product_group ON lots FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.id = lots.product_id
            AND p.product_group = ANY(fn_user_product_groups())
        )
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- LOTS: INSERT — thủ kho BULK/DAILY đều tạo được
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'lots_keeper_insert'
  ) THEN
    CREATE POLICY lots_keeper_insert ON lots FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.id = lots.product_id
            AND p.product_group = ANY(fn_user_product_groups())
        )
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- LOTS: UPDATE — thủ kho + QC_OFFICER
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'lots_keeper_update'
  ) THEN
    CREATE POLICY lots_keeper_update ON lots FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.id = lots.product_id
            AND p.product_group = ANY(fn_user_product_groups())
        )
        OR fn_user_is_admin_or_head()
        OR (fn_user_has_role('QC_OFFICER')
            AND EXISTS (SELECT 1 FROM products p
              WHERE p.id = lots.product_id AND p.product_group = 'HOA_CHAT_SINH_PHAM'))
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.id = lots.product_id
            AND p.product_group = ANY(fn_user_product_groups())
        )
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- LOT_QC_RECORDS: SELECT (tất cả thủ kho + QC xem được)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lot_qc_records' AND policyname = 'lot_qc_select'
  ) THEN
    CREATE POLICY lot_qc_select ON lot_qc_records FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM lots l
          JOIN products p ON p.id = l.product_id
          WHERE l.id = lot_qc_records.lot_id
            AND (p.product_group = ANY(fn_user_product_groups()) OR fn_user_is_admin_or_head())
        )
      );
  END IF;
END $$;

-- LOT_QC_RECORDS: INSERT (chỉ QC_OFFICER + Admin)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lot_qc_records' AND policyname = 'lot_qc_insert'
  ) THEN
    CREATE POLICY lot_qc_insert ON lot_qc_records FOR INSERT
      WITH CHECK (
        fn_user_has_role('QC_OFFICER') OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

COMMENT ON POLICY lots_keeper_product_group ON lots IS 'Khoa XN: thủ kho chỉ thấy lots trong product_group của mình';
COMMENT ON POLICY lot_qc_select ON lot_qc_records IS 'Thủ kho + QC_OFFICER thấy QC records của lô trong mảng mình';

-- =============================================================================
-- 5. Helper function: check lô có cần QC lại (open-vial) không
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_check_lot_needs_qc_retest(p_lot_id UUID)
RETURNS TABLE(
  needs_qc BOOLEAN,
  reason TEXT,
  days_overdue INT
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

  -- Chưa mở nắp
  IF v_lot.open_vial_opened_at IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Chưa mở nắp', 0;
    RETURN;
  END IF;

  -- Chưa có open-vial expiration (chưa cấu hình stability)
  IF v_lot.open_vial_expiration_date IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Chưa cấu hình open-vial stability', 0;
    RETURN;
  END IF;

  -- Còn hạn open-vial
  IF CURRENT_DATE <= v_lot.open_vial_expiration_date THEN
    RETURN QUERY SELECT FALSE, 'Còn hạn open-vial', 0;
    RETURN;
  END IF;

  -- Đã quá hạn → check QC lại gần nhất
  SELECT * INTO v_last_qc
  FROM lot_qc_records
  WHERE lot_id = p_lot_id
    AND qc_type = 'OPEN_VIAL_RETEST'
    AND qc_result = 'PASS'
  ORDER BY qc_date DESC
  LIMIT 1;

  IF v_last_qc IS NULL THEN
    RETURN QUERY SELECT TRUE, 'Quá hạn open-vial, chưa QC lại',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT;
  ELSIF v_last_qc.valid_until IS NOT NULL AND v_last_qc.valid_until < CURRENT_DATE THEN
    RETURN QUERY SELECT TRUE, 'QC lại đã hết hiệu lực',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT;
  ELSE
    RETURN QUERY SELECT FALSE, 'Đã có QC lại còn hiệu lực',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_check_lot_needs_qc_retest(UUID) TO authenticated, anon;

COMMENT ON FUNCTION fn_check_lot_needs_qc_retest(UUID) IS
  'Check lô open-vial có cần QC lại không (dùng cho FEFO + UI)';
