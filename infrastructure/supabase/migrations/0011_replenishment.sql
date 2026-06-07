-- =============================================================================
-- Migration 0011: Dự trù cuối tháng (Month-End Replenishment)
-- =============================================================================
-- Bảng month_end_forecast_runs: lưu lịch sử chạy dự trù cuối tháng
-- 1 record / (tenant, fiscal_year, fiscal_month) - đảm bảo idempotency
-- Algorithm (xem ReplenishmentHandlers.cs):
--   1. Lấy danh sách warehouse type='RECEIVING' trong tenant
--   2. Tính tồn kho hiện tại từ materialized stock table (group by product+warehouse)
--   3. Tính consumption 3 tháng gần nhất từ stock_movements (OUT/TransferOut/Issue)
--   4. Forecast tháng tới = avg_daily_out × 30; đề xuất = max(0, forecast + min_stock - tồn)
--   5. Fallback: dùng max_stock - tồn nếu thiếu lịch sử (<3 lần OUT trong 90 ngày)
--   6. Match với BidContract ACTIVE cùng product category
--   7. Output: tạo 1 PurchaseRequest DRAFT gom tất cả lines
-- =============================================================================

-- =============================================================================
-- TABLE
-- =============================================================================
CREATE TABLE month_end_forecast_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_type varchar(20) NOT NULL DEFAULT 'MANUAL',  -- 'MANUAL' | 'SCHEDULED'
  fiscal_year int NOT NULL,
  fiscal_month int NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
  as_of_date date NOT NULL,
  triggered_by_user uuid,
  status varchar(20) NOT NULL DEFAULT 'COMPLETED',  -- 'COMPLETED' | 'FAILED'
  warehouse_count int NOT NULL DEFAULT 0,
  product_count int NOT NULL DEFAULT 0,
  total_estimated_value numeric(18,2) NOT NULL DEFAULT 0,
  created_purchase_request_ids uuid[] NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  -- Idempotency: 1 tenant chỉ chạy 1 lần / tháng
  CONSTRAINT uq_forecast_run_per_month UNIQUE (tenant_id, fiscal_year, fiscal_month)
);

CREATE INDEX idx_forecast_runs_tenant_year ON month_end_forecast_runs(tenant_id, fiscal_year DESC, fiscal_month DESC);
CREATE INDEX idx_forecast_runs_status ON month_end_forecast_runs(tenant_id, status);

-- =============================================================================
-- TRIGGERS: updated_at + audit
-- =============================================================================
CREATE TRIGGER trg_forecast_runs_updated_at BEFORE UPDATE ON month_end_forecast_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_forecast_runs
AFTER INSERT OR UPDATE OR DELETE ON month_end_forecast_runs
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE month_end_forecast_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['month_end_forecast_runs']
    LOOP
        EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id())', t, t);
        EXECUTE format('CREATE POLICY %I_tenant_write ON %I FOR ALL TO authenticated USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id())', t, t);
        EXECUTE format('CREATE POLICY %I_service_role ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON month_end_forecast_runs TO authenticated;
GRANT ALL ON month_end_forecast_runs TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE month_end_forecast_runs IS
  'Lịch sử chạy dự trù cuối tháng cho kho chẵn (RECEIVING). Idempotent: 1 run/tháng/tenant.';
COMMENT ON COLUMN month_end_forecast_runs.run_type IS
  'MANUAL: user bấm từ UI; SCHEDULED: BackgroundService tự chạy theo cron';
COMMENT ON COLUMN month_end_forecast_runs.fiscal_year IS 'Năm dự trù (vd: 2026)';
COMMENT ON COLUMN month_end_forecast_runs.fiscal_month IS 'Tháng dự trù (1-12)';
COMMENT ON COLUMN month_end_forecast_runs.as_of_date IS 'Ngày chạy (cuối tháng)';
COMMENT ON COLUMN month_end_forecast_runs.triggered_by_user IS 'User bấm tay; NULL nếu SCHEDULED';
COMMENT ON COLUMN month_end_forecast_runs.created_purchase_request_ids IS
  'Danh sách ID các PurchaseRequest DRAFT được tạo từ run này';
