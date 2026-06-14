-- =============================================================================
-- Khoa XN — Module 3: Internal Replenishment (Weekly)
-- File: supabase/migrations/20260616080000_khoa_xn_replenishment_runs.sql
--
-- Bảng weekly_replenishment_runs + lines + alerts.
-- Workflow: DRAFT → REVIEWED → CONFIRMED_BY_DAILY → APPROVED → TRANSFERRING → COMPLETED
-- Tuần: thứ 6 (auto-trigger 8:00 sáng) + manual bất kỳ lúc nào
-- =============================================================================

-- =============================================================================
-- 1. ENUMs
-- =============================================================================

-- Run status (8 trạng thái)
DO $$ BEGIN
  CREATE TYPE replenishment_run_status AS ENUM (
    'DRAFT',                -- Vừa tạo bởi cron, chưa ai xem
    'REVIEWED',             -- Thủ kho kho chẵn đã review + điều chỉnh
    'CONFIRMED_BY_DAILY',   -- Thủ kho kho lẻ đã confirm số lượng
    'APPROVED',             -- Đã duyệt (auto nếu ≤ 5M, hoặc Trưởng khoa duyệt)
    'REJECTED',             -- Trưởng khoa từ chối
    'TRANSFERRING',         -- Đang vận chuyển (đã tạo StockMovement OUT)
    'COMPLETED',            -- Hoàn tất (đã nhận hàng ở kho lẻ)
    'CANCELLED'             -- Hủy bỏ
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Line status
DO $$ BEGIN
  CREATE TYPE replenishment_line_status AS ENUM (
    'PENDING',              -- Mới tạo
    'ADJUSTED',             -- Thủ kho kho chẵn đã điều chỉnh
    'CONFIRMED',            -- Thủ kho kho lẻ đã confirm
    'SKIPPED',              -- Bỏ qua (vd: lô không đủ, hoặc kho chẵn hết)
    'TRANSFERRING',         -- Đang vận chuyển
    'COMPLETED',            -- Đã nhận
    'FAILED'                -- Lỗi (vd: lô hết hạn giữa chừng, nhận thiếu)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reason for adjust / override
DO $$ BEGIN
  CREATE TYPE replenishment_override_reason AS ENUM (
    'LOT_FEFO_INSUFFICIENT',     -- Lô FEFO không đủ
    'LOT_FEFO_EXPIRING_SOON',   -- Lô FEFO sắp hết hạn, chờ nhập lô mới
    'EMERGENCY',                -- Cấp cứu
    'ALREADY_OPENED',           -- Lô khác đã mở, dùng lô này
    'OTHER'                     -- Khác
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Bảng WEEKLY_REPLENISHMENT_RUNS
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_replenishment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Phân loại
  product_group TEXT NOT NULL CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),
  warehouse_role_from TEXT NOT NULL CHECK (warehouse_role_from IN ('BULK_HC_SP', 'BULK_VTYT')),
  warehouse_role_to TEXT NOT NULL CHECK (warehouse_role_to IN ('DAILY_HC_SP', 'DAILY_VTYT')),

  -- Kỳ đề xuất (luôn là thứ 6 của tuần đó)
  period_date DATE NOT NULL,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  iso_week INT NOT NULL,

  -- Trạng thái
  status replenishment_run_status NOT NULL DEFAULT 'DRAFT',

  -- Thống kê
  total_lines INT NOT NULL DEFAULT 0,
  total_suggested_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
  total_estimated_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  requires_dept_head_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Trigger info
  triggered_by TEXT NOT NULL DEFAULT 'CRON' CHECK (triggered_by IN ('CRON', 'MANUAL')),
  trigger_source TEXT,                              -- 'CRON' | user_id (for manual)

  -- Người tham gia
  created_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  confirmed_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  rejected_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,

  -- Transfer reference (sau khi APPROVED)
  transfer_id UUID,

  -- Thời gian
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- UNIQUE: 1 run / product_group / tuần (DRAFT/REVIEWED/CONFIRMED/APPROVED đều unique)
  -- (Bỏ qua nếu status = CANCELLED)
  CONSTRAINT uq_replenishment_period UNIQUE (tenant_id, product_group, period_date)
);

CREATE INDEX idx_wrr_tenant_period ON weekly_replenishment_runs(tenant_id, period_date DESC);
CREATE INDEX idx_wrr_status ON weekly_replenishment_runs(tenant_id, status);
CREATE INDEX idx_wrr_pending_review
  ON weekly_replenishment_runs(tenant_id, status)
  WHERE status IN ('DRAFT', 'REVIEWED', 'PENDING_APPROVAL', 'CONFIRMED_BY_DAILY');

DROP TRIGGER IF EXISTS trg_wrr_updated ON weekly_replenishment_runs;
CREATE TRIGGER trg_wrr_updated
  BEFORE UPDATE ON weekly_replenishment_runs
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

COMMENT ON TABLE weekly_replenishment_runs IS 'Khoa XN: đề xuất bổ sung kho lẻ hàng tuần (BULK → DAILY)';
COMMENT ON COLUMN weekly_replenishment_runs.period_date IS 'Ngày thứ 6 của tuần đề xuất';
COMMENT ON COLUMN weekly_replenishment_runs.requires_dept_head_approval IS 'TRUE nếu total_estimated_value > 5M VNĐ';

-- =============================================================================
-- 3. Bảng WEEKLY_REPLENISHMENT_LINES
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_replenishment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES weekly_replenishment_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- Snapshot data (tại thời điểm tạo)
  current_daily_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
  current_bulk_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
  consumption_3m DECIMAL(15, 3) NOT NULL DEFAULT 0,
  consumption_last_week DECIMAL(15, 3) NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NOT NULL DEFAULT 0,

  -- Calculation
  avg_3m_weekly DECIMAL(10, 2),
  weighted_avg DECIMAL(10, 2),
  target_qty DECIMAL(10, 2),
  short_reason TEXT,                              -- Lý do buffer (vd: "MIN_STOCK_SHORTFALL")

  -- Đề xuất
  suggested_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,
  adjusted_qty DECIMAL(15, 3),
  daily_requested_qty DECIMAL(15, 3),
  final_qty DECIMAL(15, 3) NOT NULL DEFAULT 0,

  -- Lot (FEFO auto-pick từ BULK warehouse)
  selected_lot_id UUID REFERENCES lots(id) ON DELETE RESTRICT,
  selected_lot_number TEXT,
  selected_lot_expiration DATE,
  selected_lot_quantity DECIMAL(15, 3),

  -- Giá
  unit_price DECIMAL(15, 2),
  estimated_value DECIMAL(15, 2),

  -- Override history (audit trail)
  adjustment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [{"by": "user_id", "by_role": "...", "from": 5, "to": 10, "reason": "...", "at": "..."}]

  -- Transfer reference (cho stock_movements)
  transfer_line_id UUID,

  -- Trạng thái
  status replenishment_line_status NOT NULL DEFAULT 'PENDING',
  skip_reason TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wrl_run ON weekly_replenishment_lines(run_id);
CREATE INDEX idx_wrl_product ON weekly_replenishment_lines(product_id);
CREATE INDEX idx_wrl_lot ON weekly_replenishment_lines(selected_lot_id);
CREATE INDEX idx_wrl_status ON weekly_replenishment_lines(run_id, status);

DROP TRIGGER IF EXISTS trg_wrl_updated ON weekly_replenishment_lines;
CREATE TRIGGER trg_wrl_updated
  BEFORE UPDATE ON weekly_replenishment_lines
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

COMMENT ON TABLE weekly_replenishment_lines IS 'Chi tiết từng sản phẩm trong đề xuất tuần';

-- =============================================================================
-- 4. Bảng WEEKLY_REPLENISHMENT_ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS weekly_replenishment_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES weekly_replenishment_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),

  alert_type TEXT NOT NULL CHECK (alert_type IN ('BULK_OUT_OF_STOCK', 'BULK_LOW_STOCK')),
  alert_level TEXT NOT NULL CHECK (alert_level IN ('INFO', 'WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wra_tenant_unresolved
  ON weekly_replenishment_alerts(tenant_id, alert_level)
  WHERE resolved = FALSE;
CREATE INDEX idx_wra_run ON weekly_replenishment_alerts(run_id);

COMMENT ON TABLE weekly_replenishment_alerts IS 'Cảnh báo kho chẵn hết/thấp trong quá trình tính toán đề xuất tuần';

-- =============================================================================
-- 5. RLS Policies
-- =============================================================================

ALTER TABLE weekly_replenishment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_replenishment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_replenishment_alerts ENABLE ROW LEVEL SECURITY;

-- weekly_replenishment_runs: SELECT theo product_group
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'weekly_replenishment_runs' AND policyname = 'wrr_keeper_select'
  ) THEN
    CREATE POLICY wrr_keeper_select ON weekly_replenishment_runs FOR SELECT
      USING (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- INSERT: thủ kho + admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'weekly_replenishment_runs' AND policyname = 'wrr_keeper_insert'
  ) THEN
    CREATE POLICY wrr_keeper_insert ON weekly_replenishment_runs FOR INSERT
      WITH CHECK (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- UPDATE: thủ kho + admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'weekly_replenishment_runs' AND policyname = 'wrr_keeper_update'
  ) THEN
    CREATE POLICY wrr_keeper_update ON weekly_replenishment_runs FOR UPDATE
      USING (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      )
      WITH CHECK (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- weekly_replenishment_lines: parent policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'weekly_replenishment_lines' AND policyname = 'wrl_parent'
  ) THEN
    CREATE POLICY wrl_parent ON weekly_replenishment_lines FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM weekly_replenishment_runs r
          WHERE r.id = weekly_replenishment_lines.run_id
            AND (r.product_group = ANY(fn_user_product_groups()) OR fn_user_is_admin_or_head())
        )
      );
  END IF;
END $$;

-- weekly_replenishment_alerts: thấy tất cả
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'weekly_replenishment_alerts' AND policyname = 'wra_select'
  ) THEN
    CREATE POLICY wra_select ON weekly_replenishment_alerts FOR SELECT
      USING (tenant_id = auth_tenant_id());
  END IF;
END $$;
