-- =============================================================================
-- Migration 0006: Stock Takes (kiểm kê)
-- Workflow: DRAFT -> COUNTED (user nhập số đếm) -> POSTED (sinh ADJUST movements)
-- Mỗi line có system_qty (snapshot) và counted_qty (user nhập). Variance -> ADJUST.
-- =============================================================================

CREATE TYPE stock_take_status AS ENUM ('DRAFT', 'COUNTED', 'POSTED', 'CANCELLED');
CREATE TYPE stock_take_line_status AS ENUM ('PENDING', 'COUNTED', 'ADJUSTED', 'SKIPPED', 'CANCELLED');

CREATE TABLE stock_takes (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id        UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    stock_take_number   VARCHAR(50) NOT NULL,
    stock_take_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    notes               TEXT,
    status              stock_take_status NOT NULL DEFAULT 'DRAFT',
    counted_by          UUID REFERENCES users(id),
    counted_at          TIMESTAMPTZ,
    posted_by           UUID REFERENCES users(id),
    posted_at           TIMESTAMPTZ,
    cancel_reason       TEXT,
    cancelled_by        UUID REFERENCES users(id),
    cancelled_at        TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (tenant_id, stock_take_number),
    CONSTRAINT chk_stock_take_warehouse_branch CHECK (warehouse_id IS NOT NULL)
);

CREATE INDEX idx_stock_takes_tenant_status ON stock_takes(tenant_id, status);
CREATE INDEX idx_stock_takes_tenant_wh_date ON stock_takes(tenant_id, warehouse_id, stock_take_date DESC);

CREATE TABLE stock_take_lines (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_take_id       UUID NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    line_no             INT NOT NULL,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id             UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    location_id         UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    product_name        VARCHAR(200) NOT NULL,
    unit_code           VARCHAR(20) NOT NULL,
    location_code       VARCHAR(80) NOT NULL,
    batch_no            VARCHAR(100),
    serial_no           VARCHAR(100),
    system_qty          NUMERIC(18,4) NOT NULL DEFAULT 0,
    counted_qty         NUMERIC(18,4) CHECK (counted_qty IS NULL OR counted_qty >= 0),
    unit_cost           NUMERIC(18,4),
    notes               TEXT,
    adjust_movement_id  UUID,
    status              stock_take_line_status NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (stock_take_id, line_no)
);

CREATE INDEX idx_stock_take_lines_take ON stock_take_lines(stock_take_id);
CREATE INDEX idx_stock_take_lines_product ON stock_take_lines(product_id);
CREATE INDEX idx_stock_take_lines_status ON stock_take_lines(stock_take_id, status)
    WHERE status IN ('PENDING', 'COUNTED');

CREATE TRIGGER trg_stock_take_updated_at BEFORE UPDATE ON stock_takes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_take_line_updated_at BEFORE UPDATE ON stock_take_lines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit
CREATE TRIGGER audit_stock_takes AFTER INSERT OR UPDATE ON stock_takes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- RLS
ALTER TABLE stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_takes_tenant ON stock_takes
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY stock_take_lines_tenant ON stock_take_lines
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY stock_takes_service ON stock_takes
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY stock_take_lines_service ON stock_take_lines
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT ALL ON stock_takes TO authenticated;
GRANT ALL ON stock_take_lines TO authenticated;
GRANT ALL ON stock_takes TO service_role;
GRANT ALL ON stock_take_lines TO service_role;
