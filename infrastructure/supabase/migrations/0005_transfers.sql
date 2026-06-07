-- =============================================================================
-- Migration 0005: Stock Transfers (chuyển kho nội bộ)
-- Workflow: DRAFT -> IN_TRANSIT (đã xuất src) -> RECEIVED (đã nhập dst)
-- Mỗi line ship tạo 1 movement TRANSFER_OUT, receive tạo 1 movement TRANSFER_IN.
-- =============================================================================

CREATE TYPE stock_transfer_status AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE stock_transfer_line_status AS ENUM ('OPEN', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

CREATE TABLE stock_transfers (
    id                       UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transfer_number          VARCHAR(50) NOT NULL,
    from_branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    from_warehouse_id        UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    to_branch_id             UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_warehouse_id          UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    transfer_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_receipt_date    DATE,
    notes                    TEXT,
    status                   stock_transfer_status NOT NULL DEFAULT 'DRAFT',
    out_shipped_by           UUID REFERENCES users(id),
    out_shipped_at           TIMESTAMPTZ,
    in_received_by           UUID REFERENCES users(id),
    in_received_at           TIMESTAMPTZ,
    cancel_reason            TEXT,
    cancelled_by             UUID REFERENCES users(id),
    cancelled_at             TIMESTAMPTZ,
    created_by               UUID REFERENCES users(id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (tenant_id, transfer_number)
);

CREATE INDEX idx_stock_transfers_tenant_status ON stock_transfers(tenant_id, status);
CREATE INDEX idx_stock_transfers_tenant_from_wh ON stock_transfers(tenant_id, from_warehouse_id);
CREATE INDEX idx_stock_transfers_tenant_to_wh ON stock_transfers(tenant_id, to_warehouse_id);
CREATE INDEX idx_stock_transfers_tenant_date ON stock_transfers(tenant_id, transfer_date DESC);

CREATE TABLE stock_transfer_lines (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    line_no             INT NOT NULL,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id             UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    product_name        VARCHAR(200) NOT NULL,
    unit_code           VARCHAR(20) NOT NULL,
    from_location_id    UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    from_location_code  VARCHAR(80) NOT NULL,
    to_location_id      UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    to_location_code    VARCHAR(80) NOT NULL,
    quantity            NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    shipped_qty         NUMERIC(18,4) NOT NULL DEFAULT 0,
    received_qty        NUMERIC(18,4) NOT NULL DEFAULT 0,
    batch_no            VARCHAR(100),
    serial_no           VARCHAR(100),
    expiry_date         DATE,
    notes               TEXT,
    out_movement_id     UUID,  -- FK tới stock_movements được set sau khi ship
    in_movement_id      UUID,
    status              stock_transfer_line_status NOT NULL DEFAULT 'OPEN',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (stock_transfer_id, line_no)
);

CREATE INDEX idx_stock_transfer_lines_transfer ON stock_transfer_lines(stock_transfer_id);
CREATE INDEX idx_stock_transfer_lines_product ON stock_transfer_lines(product_id);

CREATE TRIGGER trg_stock_transfer_updated_at BEFORE UPDATE ON stock_transfers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_transfer_line_updated_at BEFORE UPDATE ON stock_transfer_lines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_transfers_tenant ON stock_transfers
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY stock_transfer_lines_tenant ON stock_transfer_lines
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY stock_transfers_service ON stock_transfers
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY stock_transfer_lines_service ON stock_transfer_lines
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT ALL ON stock_transfers TO authenticated;
GRANT ALL ON stock_transfer_lines TO authenticated;
GRANT ALL ON stock_transfers TO service_role;
GRANT ALL ON stock_transfer_lines TO service_role;
