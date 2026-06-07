-- =============================================================================
-- Migration 0007: Goods Receipt Notes (GRN / Phiếu nhập kho)
-- Module: Nhập kho từ NCC. Workflow DRAFT → POSTED → COMPLETED.
-- POSTED GRN: insert stock_movements với ref_type=GRN + ref_id=grn.id
-- Cập nhật purchase_order_lines.received_qty.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE grn_status AS ENUM (
    'DRAFT',       -- mới tạo, chưa ghi stock_movements
    'POSTED',      -- đã ghi movements
    'CANCELLED'    -- hủy (chỉ DRAFT, sau khi POSTED phải dùng reversal)
);

CREATE TYPE grn_line_status AS ENUM (
    'OPEN',
    'POSTED',
    'CANCELLED'
);

-- =============================================================================
-- GOODS_RECEIPTS
-- Số GRN: GRN-YYYYMM-NNNN (auto-gen theo tenant + tháng)
-- =============================================================================
CREATE TABLE goods_receipts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    grn_number        VARCHAR(30) NOT NULL,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE RESTRICT,  -- optional: có thể nhập không qua PO
    party_id          UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    warehouse_id      UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    receipt_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_invoice_no VARCHAR(100),                          -- số HĐ NCC
    supplier_invoice_date DATE,
    notes             TEXT,
    status            grn_status NOT NULL DEFAULT 'DRAFT',
    posted_by         UUID REFERENCES users(id),
    posted_at         TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     TEXT,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, grn_number)
);

CREATE INDEX idx_grn_tenant ON goods_receipts(tenant_id);
CREATE INDEX idx_grn_branch ON goods_receipts(tenant_id, branch_id);
CREATE INDEX idx_grn_po ON goods_receipts(purchase_order_id);
CREATE INDEX idx_grn_party ON goods_receipts(party_id);
CREATE INDEX idx_grn_status ON goods_receipts(tenant_id, status);
CREATE INDEX idx_grn_date ON goods_receipts(tenant_id, receipt_date DESC);

COMMENT ON TABLE goods_receipts IS 'Phiếu nhập kho. Có thể link với PO hoặc nhập tay (manual). POSTED sẽ tạo stock_movements.';

-- =============================================================================
-- GOODS_RECEIPT_LINES
-- Mỗi dòng = 1 movement sẽ được ghi vào stock_movements.
-- po_line_id: optional, link tới dòng PO nếu GRN từ PO.
-- received_qty = số lượng thực nhận (có thể < quantity đặt của PO).
-- movement_id: FK tới stock_movements.id SAU khi POSTED.
-- =============================================================================
CREATE TABLE goods_receipt_lines (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goods_receipt_id  UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_line_id        UUID REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,  -- optional
    line_no           INT NOT NULL,
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id           UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    location_id       UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    product_name      VARCHAR(200) NOT NULL,                  -- snapshot
    unit_code         VARCHAR(20) NOT NULL,
    quantity          NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_cost         NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
    batch_no          VARCHAR(100),
    serial_no         VARCHAR(100),
    expiry_date       DATE,
    notes             TEXT,
    movement_id       UUID,                                    -- FK tới stock_movements sau khi POSTED
    status            grn_line_status NOT NULL DEFAULT 'OPEN',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(goods_receipt_id, line_no)
);

CREATE INDEX idx_grn_lines_grn ON goods_receipt_lines(goods_receipt_id);
CREATE INDEX idx_grn_lines_po_line ON goods_receipt_lines(po_line_id) WHERE po_line_id IS NOT NULL;
CREATE INDEX idx_grn_lines_product ON goods_receipt_lines(product_id);
CREATE INDEX idx_grn_lines_movement ON goods_receipt_lines(movement_id) WHERE movement_id IS NOT NULL;

COMMENT ON TABLE goods_receipt_lines IS 'Dòng GRN. Mỗi dòng sẽ tạo 1 stock_movement khi POSTED. movement_id lưu FK sau khi ghi.';

-- =============================================================================
-- FUNCTION: sinh GRN number tự động
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_grn_number(p_tenant_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'GRN-' || to_char(p_date, 'YYYYMM') || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM goods_receipts
    WHERE tenant_id = p_tenant_id
      AND grn_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION generate_grn_number IS 'Sinh số GRN: GRN-YYYYMM-NNNN (theo tenant, reset tháng).';

-- =============================================================================
-- TRIGGERS: audit + updated_at
-- =============================================================================
CREATE TRIGGER trg_grn_updated_at BEFORE UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_grn_lines_updated_at BEFORE UPDATE ON goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_grn
AFTER INSERT OR UPDATE OR DELETE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_grn_lines
AFTER INSERT OR UPDATE OR DELETE ON goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY grn_tenant_isolation ON goods_receipts
    FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id());

CREATE POLICY grn_tenant_write ON goods_receipts
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY grn_service_role ON goods_receipts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY grn_lines_tenant_isolation ON goods_receipt_lines
    FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id());

CREATE POLICY grn_lines_tenant_write ON goods_receipt_lines
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY grn_lines_service_role ON goods_receipt_lines
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON goods_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON goods_receipt_lines TO authenticated;
GRANT ALL ON goods_receipts TO service_role;
GRANT ALL ON goods_receipt_lines TO service_role;
GRANT EXECUTE ON FUNCTION generate_grn_number TO authenticated;
