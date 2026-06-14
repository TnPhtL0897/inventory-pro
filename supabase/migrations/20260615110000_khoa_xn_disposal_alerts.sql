-- =============================================================================
-- Khoa XN — Module 2: Disposal + Lot Alerts
-- File: supabase/migrations/20260615110000_khoa_xn_disposal_alerts.sql
-- =============================================================================

-- =============================================================================
-- 1. ENUMs
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE disposal_status AS ENUM (
    'PENDING',          -- Vừa tạo (auto hoặc manual), chờ duyệt
    'APPROVED',         -- Đã duyệt
    'IN_PROGRESS',      -- Đang thực hiện hủy vật lý
    'COMPLETED',        -- Hoàn tất
    'CANCELLED'         -- Hủy bỏ
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lot_alert_type AS ENUM (
    'EXPIRING_SOON',        -- 30/15/7 ngày trước expiration_date
    'OPEN_VIAL_EXPIRING',   -- Open-vial sắp hết hạn
    'OUT_OF_STOCK',         -- Dưới min_stock
    'RECALL',               -- Bị recall
    'QC_REQUIRED'          -- Lô mới cần QC
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lot_alert_level AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Bảng DISPOSAL_REQUESTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS disposal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Mã phiếu
  request_number TEXT NOT NULL,
  reason TEXT NOT NULL,                            -- "Hết hạn", "QC_FAILED", "Recall", "Hỏng vật lý"

  -- Trạng thái
  status disposal_status NOT NULL DEFAULT 'PENDING',

  -- Thống kê
  total_estimated_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  requires_dept_head_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Auto-generated hay manual
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,

  -- Người tham gia
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  rejected_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,

  -- Biên bản hủy
  disposal_act_number TEXT,
  disposal_act_url TEXT,
  disposal_date DATE,
  disposal_method TEXT,                            -- "Đốt", "Chôn", "Trả NCC", "Tiêu hủy chất thải y tế"

  completed_at TIMESTAMPTZ,

  -- Audit
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_dr_tenant_status ON disposal_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dr_pending
  ON disposal_requests(tenant_id, created_at DESC)
  WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS trg_dr_updated_at ON disposal_requests;
CREATE TRIGGER trg_dr_updated_at
  BEFORE UPDATE ON disposal_requests
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

COMMENT ON TABLE disposal_requests IS 'Khoa XN: phiếu đề nghị xuất hủy (auto-gen khi hết hạn hoặc manual)';
COMMENT ON COLUMN disposal_requests.auto_generated IS 'TRUE nếu do cron fn_auto_expire_lots tạo';

-- =============================================================================
-- 3. Bảng DISPOSAL_REQUEST_LINES
-- =============================================================================

CREATE TABLE IF NOT EXISTS disposal_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposal_request_id UUID NOT NULL REFERENCES disposal_requests(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  quantity DECIMAL(15, 3) NOT NULL,
  unit_price DECIMAL(15, 2),
  estimated_value DECIMAL(15, 2),
  expiration_date DATE,                            -- Hạn lúc hủy
  reason TEXT,                                     -- Lý do hủy cụ thể cho lô này
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drl_request ON disposal_request_lines(disposal_request_id);
CREATE INDEX IF NOT EXISTS idx_drl_lot ON disposal_request_lines(lot_id);
CREATE INDEX IF NOT EXISTS idx_drl_product ON disposal_request_lines(product_id);

-- FK từ recall_lot_actions
ALTER TABLE recall_lot_actions
  DROP CONSTRAINT IF EXISTS fk_rla_disposal;
ALTER TABLE recall_lot_actions
  ADD CONSTRAINT fk_rla_disposal
  FOREIGN KEY (disposal_request_id) REFERENCES disposal_requests(id) ON DELETE SET NULL;

COMMENT ON TABLE disposal_request_lines IS 'Khoa XN: chi tiết từng lô trong phiếu hủy';

-- =============================================================================
-- 4. Bảng LOT_ALERTS (cảnh báo)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lot_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  alert_type lot_alert_type NOT NULL,
  alert_level lot_alert_level NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_la_tenant_unresolved
  ON lot_alerts(tenant_id, alert_level, created_at DESC)
  WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_la_lot ON lot_alerts(lot_id);

COMMENT ON TABLE lot_alerts IS 'Khoa XN: cảnh báo tự động (expiry/open-vial/recall/QC required)';

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE disposal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_alerts ENABLE ROW LEVEL SECURITY;

-- disposal_requests: thủ kho + DEPT_HEAD
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'disposal_requests' AND policyname = 'dr_select'
  ) THEN
    CREATE POLICY dr_select ON disposal_requests FOR SELECT
      USING (tenant_id = auth_tenant_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'disposal_requests' AND policyname = 'dr_write'
  ) THEN
    CREATE POLICY dr_write ON disposal_requests FOR ALL
      USING (
        fn_user_is_admin_or_head()
        OR EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = auth.uid()
            -- Thủ kho có thể tạo (status=DRAFT/PENDING) nhưng không approve
        )
      )
      WITH CHECK (
        fn_user_is_admin_or_head()
        OR created_by = auth.uid()  -- Tạo mới với created_by = mình
      );
  END IF;
END $$;

-- disposal_request_lines: kế thừa parent
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'disposal_request_lines' AND policyname = 'drl_parent'
  ) THEN
    CREATE POLICY drl_parent ON disposal_request_lines FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM disposal_requests dr
          WHERE dr.id = disposal_request_lines.disposal_request_id
            AND dr.tenant_id = auth_tenant_id()
        )
      );
  END IF;
END $$;

-- lot_alerts: tất cả thấy (cảnh báo)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'lot_alerts' AND policyname = 'la_select'
  ) THEN
    CREATE POLICY la_select ON lot_alerts FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM lots l
          JOIN products p ON p.id = l.product_id
          WHERE l.id = lot_alerts.lot_id
            AND (p.product_group = ANY(fn_user_product_groups()) OR fn_user_is_admin_or_head())
        )
      );
  END IF;
END $$;

-- lot_alerts: cập nhật resolved (admin hoặc thủ kho trong mảng)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'lot_alerts' AND policyname = 'la_update'
  ) THEN
    CREATE POLICY la_update ON lot_alerts FOR UPDATE
      USING (
        fn_user_is_admin_or_head()
        OR EXISTS (
          SELECT 1 FROM lots l
          JOIN products p ON p.id = l.product_id
          WHERE l.id = lot_alerts.lot_id
            AND p.product_group = ANY(fn_user_product_groups())
        )
      );
  END IF;
END $$;
