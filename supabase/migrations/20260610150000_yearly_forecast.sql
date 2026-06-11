-- =============================================================================
-- Phase 6c+: Yearly Forecast (Dự trù năm) cho kế hoạch mua sắm năm sau
-- =============================================================================
-- Công thức: Max(TB 12 tháng, max 3 tháng gần nhất) × 12
-- Nguồn tiêu thụ: stock_issues (OUT) + stock_transfers (TRANSFER_OUT)
--                  + ADJUST_OUT (hỏng/mất) — TẤT Cả OUT movements
-- Phạm vi: tất cả products ACTIVE (user tick/untick trên UI)
-- Kết quả: lưu vào yearly_forecast_runs + yearly_forecast_lines để export Excel
-- =============================================================================

-- =============================================================================
-- 1. ENUM cho trạng thái run
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE yearly_forecast_status AS ENUM (
    'DRAFT',        -- đang chạy / chưa xong
    'COMPLETED',    -- tính xong, có kết quả
    'CANCELLED'     -- hủy (chạy lại)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE yearly_forecast_line_status AS ENUM (
    'INCLUDED',     -- user đã tick, sẽ đưa vào KH mua sắm
    'EXCLUDED',     -- user untick, loại khỏi KH
    'PENDING'       -- chưa quyết
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. BẢNG HEADER: yearly_forecast_runs
-- Mỗi lần chạy dự trù = 1 row. Có thể chạy lại nhiều lần / năm (drafts).
-- =============================================================================
CREATE TABLE IF NOT EXISTS yearly_forecast_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fiscal_year         INT NOT NULL,                    -- NĂM CẦN DỰ TRÙ (vd: 2027)
    run_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    warehouse_ids       UUID[] NOT NULL DEFAULT '{}',     -- các kho tính (mảng)
    formula             TEXT NOT NULL DEFAULT
                        'MAX(avg12m, max3m) * 12',
    -- Tổng kết (denormalized for quick view)
    total_products      INT DEFAULT 0,                    -- số SP xét
    total_lines         INT DEFAULT 0,                    -- số SP có output
    total_estimated_value NUMERIC(18,2) DEFAULT 0,       -- tổng tiền dự kiến
    -- Audit
    status              yearly_forecast_status NOT NULL DEFAULT 'DRAFT',
    run_by              UUID REFERENCES users(id),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yearly_forecast_runs_tenant_year
    ON yearly_forecast_runs(tenant_id, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_yearly_forecast_runs_status
    ON yearly_forecast_runs(tenant_id, status);

COMMENT ON TABLE yearly_forecast_runs IS
    'Mỗi lần chạy dự trù năm = 1 row. Lưu kết quả để export Excel gửi phòng kế hoạch.';

-- =============================================================================
-- 3. BẢNG LINE: yearly_forecast_lines
-- 1 row / product / run. Lưu chi tiết tính toán.
-- =============================================================================
CREATE TABLE IF NOT EXISTS yearly_forecast_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    run_id              UUID NOT NULL REFERENCES yearly_forecast_runs(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    -- Lịch sử tiêu thụ (đã group theo warehouseIds trong run)
    consumption_12m     NUMERIC(18,4) NOT NULL DEFAULT 0,    -- TỔNG xuất 12 tháng qua
    consumption_12m_avg NUMERIC(18,4) NOT NULL DEFAULT 0,    -- TB tháng 12 tháng
    consumption_3m_max  NUMERIC(18,4) NOT NULL DEFAULT 0,    -- Max 1 tháng trong 3 tháng gần nhất
    -- Công thức áp dụng (lưu vết cho audit)
    forecast_base       NUMERIC(18,4) NOT NULL DEFAULT 0,    -- MAX(avg12m, max3m)
    forecast_year_qty   NUMERIC(18,4) NOT NULL DEFAULT 0,    -- × 12 = tổng dự kiến năm
    -- Tồn kho hiện tại + đề xuất
    current_stock       NUMERIC(18,4) NOT NULL DEFAULT 0,    -- on_hand_qty tại thời điểm run
    suggested_buy_qty   NUMERIC(18,4) NOT NULL DEFAULT 0,    -- MAX(0, forecast_year_qty - current_stock)
    -- Tiền
    unit_price          NUMERIC(18,4) NOT NULL DEFAULT 0,    -- products.cost_price
    total_estimated_value NUMERIC(18,2) NOT NULL DEFAULT 0, -- suggested_buy_qty × unit_price
    -- User quyết định
    line_status         yearly_forecast_line_status NOT NULL DEFAULT 'PENDING',
    user_note           TEXT,
    -- Unit info (snapshot tại thời điểm run)
    unit_id             UUID REFERENCES units_of_measure(id),
    unit_code           TEXT,
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_yearly_forecast_lines_run
    ON yearly_forecast_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_yearly_forecast_lines_product
    ON yearly_forecast_lines(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_yearly_forecast_lines_status
    ON yearly_forecast_lines(run_id, line_status);

COMMENT ON TABLE yearly_forecast_lines IS
    'Chi tiết dự trù năm theo từng sản phẩm. Lưu vết công thức + audit trail.';

-- =============================================================================
-- 4. RLS: tenant isolation
-- =============================================================================
ALTER TABLE yearly_forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE yearly_forecast_lines ENABLE ROW LEVEL SECURITY;

-- Authenticated: SELECT theo tenant
DROP POLICY IF EXISTS yearly_forecast_runs_tenant_select ON yearly_forecast_runs;
CREATE POLICY yearly_forecast_runs_tenant_select ON yearly_forecast_runs
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS yearly_forecast_lines_tenant_select ON yearly_forecast_lines;
CREATE POLICY yearly_forecast_lines_tenant_select ON yearly_forecast_lines
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

-- Service role: full access (used by edge function)
DROP POLICY IF EXISTS yearly_forecast_runs_service_role ON yearly_forecast_runs;
CREATE POLICY yearly_forecast_runs_service_role ON yearly_forecast_runs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS yearly_forecast_lines_service_role ON yearly_forecast_lines;
CREATE POLICY yearly_forecast_lines_service_role ON yearly_forecast_lines
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- 5. GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON yearly_forecast_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON yearly_forecast_lines TO authenticated;
GRANT ALL ON yearly_forecast_runs TO service_role;
GRANT ALL ON yearly_forecast_lines TO service_role;

-- =============================================================================
-- 6. Helper VIEW: lịch sử tiêu thụ 12 tháng + 3 tháng gần nhất theo product + warehouse
-- Tái sử dụng cho edge function (tránh join phức tạp)
-- =============================================================================
CREATE OR REPLACE VIEW v_product_consumption_yearly AS
WITH all_out_movements AS (
    -- Stock Issues: OUT (xuất kho)
    SELECT
        l.product_id,
        g.warehouse_id,
        i.issue_date::date AS movement_date,
        l.quantity
    FROM stock_issue_lines l
    JOIN stock_issues i ON i.id = l.stock_issue_id
    WHERE i.status = 'POSTED'

    UNION ALL

    -- Stock Transfers: TRANSFER_OUT
    SELECT
        l.product_id,
        t.from_warehouse_id AS warehouse_id,
        t.created_at::date AS movement_date,
        l.shipped_qty AS quantity
    FROM stock_transfer_lines l
    JOIN stock_transfers t ON t.id = l.stock_transfer_id
    WHERE t.status IN ('IN_TRANSIT', 'RECEIVED')

    UNION ALL

    -- Stock Takes: ADJUST_OUT (hỏng, mất, hết HSD)
    -- Lưu ý: stock_take_lines có system_qty + counted_qty, variance = counted - system
    -- Tạm thời chưa aggregate vì stock_take chưa có flow tự tạo movements
    -- TODO: bổ sung khi có stock_take flow chính thức
)
SELECT
    a.product_id,
    a.warehouse_id,
    -- 12 tháng gần nhất (rolling window)
    COALESCE(SUM(a.quantity) FILTER (
        WHERE a.movement_date >= CURRENT_DATE - INTERVAL '12 months'
    ), 0) AS consumption_12m_total,
    -- Trung bình / tháng trong 12 tháng
    COALESCE(SUM(a.quantity) FILTER (
        WHERE a.movement_date >= CURRENT_DATE - INTERVAL '12 months'
    ), 0) / 12.0 AS consumption_12m_avg,
    -- Max 1 tháng trong 3 tháng gần nhất
    COALESCE(MAX(monthly_qty), 0) AS consumption_3m_max
FROM all_out_movements a
LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS monthly_qty
    FROM all_out_movements a2
    WHERE a2.product_id = a.product_id
      AND a2.warehouse_id = a.warehouse_id
      AND a2.movement_date >= CURRENT_DATE - INTERVAL '3 months'
      AND date_trunc('month', a2.movement_date) = date_trunc('month', a.movement_date)
) monthly ON true
WHERE a.movement_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY a.product_id, a.warehouse_id;

COMMENT ON VIEW v_product_consumption_yearly IS
    'Tổng hợp tiêu thụ 12 tháng + max 3 tháng gần nhất theo (product, warehouse). Dùng cho yearly forecast.';

GRANT SELECT ON v_product_consumption_yearly TO authenticated, service_role;

-- =============================================================================
-- 7. Apply migration log (track via _migrations table nếu có)
-- =============================================================================
-- INSERT INTO schema_migrations (version, name) VALUES ('20260610150000', 'yearly_forecast');
