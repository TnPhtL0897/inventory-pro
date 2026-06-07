-- =============================================================================
-- Migration 0008: Stock Issues (Phiếu xuất kho)
-- Xuất cho nhiều mục đích: SALE (bán), INTERNAL_USE, SCRAP, SAMPLE, ADJUST.
-- Workflow DRAFT → POSTED → CANCELLED. POSTED tạo stock_movements với movement_type=OUT.
-- =============================================================================

CREATE TYPE stock_issue_purpose AS ENUM (
    'SALE',              -- bán hàng
    'INTERNAL_USE',      -- sử dụng nội bộ
    'SCRAP',             -- hủy hàng hỏng/hết hạn
    'SAMPLE',            -- hàng mẫu
    'GIFT',              -- quà tặng
    'TRANSFER_OUT',      -- alias, dùng module Transfer riêng
    'ADJUSTMENT'         -- alias, dùng module StockTake riêng
);

-- =============================================================================
-- STOCK_ISSUES
-- =============================================================================
CREATE TABLE stock_issues (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    issue_number      VARCHAR(30) NOT NULL,
    party_id          UUID REFERENCES parties(id) ON DELETE RESTRICT,  -- optional, cho SALE
    warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    purpose           stock_issue_purpose NOT NULL DEFAULT 'SALE',
    issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_no      VARCHAR(100),                                    -- số HĐ bán, số phiếu xuất...
    notes             TEXT,
    status            grn_status NOT NULL DEFAULT 'DRAFT',             -- dùng chung enum
    posted_by         UUID REFERENCES users(id),
    posted_at         TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     TEXT,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, issue_number)
);

CREATE INDEX idx_issues_tenant ON stock_issues(tenant_id);
CREATE INDEX idx_issues_branch ON stock_issues(tenant_id, branch_id);
CREATE INDEX idx_issues_party ON stock_issues(party_id);
CREATE INDEX idx_issues_status ON stock_issues(tenant_id, status);
CREATE INDEX idx_issues_purpose ON stock_issues(tenant_id, purpose);
CREATE INDEX idx_issues_date ON stock_issues(tenant_id, issue_date DESC);

COMMENT ON TABLE stock_issues IS 'Phiếu xuất kho. POSTED tạo stock_movements với movement_type=OUT.';

-- =============================================================================
-- STOCK_ISSUE_LINES
-- =============================================================================
CREATE TABLE stock_issue_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_issue_id  UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
    line_no         INT NOT NULL,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id         UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    product_name    VARCHAR(200) NOT NULL,
    unit_code       VARCHAR(20) NOT NULL,
    quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(18,4) NOT NULL DEFAULT 0,                -- giá bán (cho SALE)
    batch_no        VARCHAR(100),
    serial_no       VARCHAR(100),
    expiry_date     DATE,
    notes           TEXT,
    movement_id     UUID,
    status          grn_line_status NOT NULL DEFAULT 'OPEN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(stock_issue_id, line_no)
);

CREATE INDEX idx_issue_lines_issue ON stock_issue_lines(stock_issue_id);
CREATE INDEX idx_issue_lines_product ON stock_issue_lines(product_id);
CREATE INDEX idx_issue_lines_movement ON stock_issue_lines(movement_id) WHERE movement_id IS NOT NULL;

COMMENT ON TABLE stock_issue_lines IS 'Dòng phiếu xuất. Mỗi dòng tạo 1 stock_movement OUT khi POSTED.';

-- =============================================================================
-- FUNCTION: sinh số issue
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_issue_number(p_tenant_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'ISS-' || to_char(p_date, 'YYYYMM') || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM stock_issues
    WHERE tenant_id = p_tenant_id
      AND issue_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON stock_issues
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_issue_lines_updated_at BEFORE UPDATE ON stock_issue_lines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_issues
AFTER INSERT OR UPDATE OR DELETE ON stock_issues
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_issue_lines
AFTER INSERT OR UPDATE OR DELETE ON stock_issue_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE stock_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issue_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY issues_tenant_isolation ON stock_issues
    FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id());

CREATE POLICY issues_tenant_write ON stock_issues
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY issues_service_role ON stock_issues
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY issue_lines_tenant_isolation ON stock_issue_lines
    FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id());

CREATE POLICY issue_lines_tenant_write ON stock_issue_lines
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY issue_lines_service_role ON stock_issue_lines
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON stock_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_issue_lines TO authenticated;
GRANT ALL ON stock_issues TO service_role;
GRANT ALL ON stock_issue_lines TO service_role;
GRANT EXECUTE ON FUNCTION generate_issue_number TO authenticated;
