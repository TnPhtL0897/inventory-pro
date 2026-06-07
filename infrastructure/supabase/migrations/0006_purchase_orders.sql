-- =============================================================================
-- Migration 0006: Purchase Orders (PO)
-- Module: Mua hàng. Workflow DRAFT → APPROVED → POSTED.
-- POSTED PO không tự ghi stock_movements — chỉ tạo reservation. Stock movement
-- sinh ra khi GRN (sẽ thêm ở migration 0007).
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE po_status AS ENUM (
    'DRAFT',       -- mới tạo, có thể sửa
    'APPROVED',    -- đã duyệt (manager), không sửa được
    'POSTED',      -- đã ghi reservation, đang chờ GRN
    'COMPLETED',   -- đã nhận đủ qua các GRN
    'CANCELLED'    -- hủy (cả khi chưa approve, cả sau khi approve)
);

CREATE TYPE po_line_status AS ENUM (
    'OPEN',        -- chưa nhận
    'PARTIAL',     -- nhận một phần
    'RECEIVED',    -- nhận đủ
    'CANCELLED'    -- hủy dòng
);

-- =============================================================================
-- PURCHASE_ORDERS
-- Số PO format: PO-YYYYMM-NNNN (vd: PO-202601-0001). Auto-gen theo tenant.
-- =============================================================================
CREATE TABLE purchase_orders (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    po_number         VARCHAR(30) NOT NULL,
    party_id          UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date     DATE,
    currency          VARCHAR(3) NOT NULL DEFAULT 'VND',
    exchange_rate     NUMERIC(18,6) NOT NULL DEFAULT 1,
    subtotal          NUMERIC(18,4) NOT NULL DEFAULT 0,
    discount_amount   NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
    shipping_amount   NUMERIC(18,4) NOT NULL DEFAULT 0,
    total             NUMERIC(18,4) NOT NULL DEFAULT 0,
    paid_amount       NUMERIC(18,4) NOT NULL DEFAULT 0,
    status            po_status NOT NULL DEFAULT 'DRAFT',
    payment_terms     INT NOT NULL DEFAULT 0,
    shipping_address  TEXT,
    notes             TEXT,
    internal_notes    TEXT,
    approved_by       UUID REFERENCES users(id),
    approved_at       TIMESTAMPTZ,
    posted_by         UUID REFERENCES users(id),
    posted_at         TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    cancel_reason     TEXT,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, po_number)
);

CREATE INDEX idx_po_tenant ON purchase_orders(tenant_id);
CREATE INDEX idx_po_branch ON purchase_orders(tenant_id, branch_id);
CREATE INDEX idx_po_party ON purchase_orders(party_id);
CREATE INDEX idx_po_status ON purchase_orders(tenant_id, status);
CREATE INDEX idx_po_date ON purchase_orders(tenant_id, order_date DESC);
CREATE INDEX idx_po_number_trgm ON purchase_orders USING gin (po_number gin_trgm_ops);

COMMENT ON TABLE purchase_orders IS 'Đơn mua hàng. Workflow DRAFT → APPROVED → POSTED → COMPLETED. Tạo GRN để nhận kho.';

-- =============================================================================
-- PURCHASE_ORDER_LINES
-- Mỗi dòng = 1 sản phẩm. received_qty cập nhật qua trigger khi GRN post.
-- =============================================================================
CREATE TABLE purchase_order_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_no         INT NOT NULL,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id         UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    product_name    VARCHAR(200) NOT NULL,        -- snapshot lúc tạo (phòng khi product đổi tên)
    unit_code       VARCHAR(20) NOT NULL,
    quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    received_qty    NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    unit_price      NUMERIC(18,4) NOT NULL CHECK (unit_price >= 0),
    discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    tax_pct         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_pct >= 0),
    line_total      NUMERIC(18,4) NOT NULL,        -- = qty * price * (1 - discount_pct/100) * (1 + tax_pct/100)
    status          po_line_status NOT NULL DEFAULT 'OPEN',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(purchase_order_id, line_no)
);

CREATE INDEX idx_po_lines_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_po_lines_product ON purchase_order_lines(product_id);
CREATE INDEX idx_po_lines_status ON purchase_order_lines(tenant_id, status);

COMMENT ON TABLE purchase_order_lines IS 'Dòng chi tiết PO. received_qty cập nhật từ GRN.';

-- =============================================================================
-- FUNCTION: tự sinh PO number theo tenant + tháng
-- Format: PO-YYYYMM-NNNN (reset theo tháng, theo tenant)
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_po_number(p_tenant_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'PO-' || to_char(p_date, 'YYYYMM') || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM purchase_orders
    WHERE tenant_id = p_tenant_id
      AND po_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION generate_po_number IS 'Sinh số PO tự động: PO-YYYYMM-NNNN (theo tenant, reset tháng).';

-- =============================================================================
-- FUNCTION: recompute PO totals từ lines (gọi từ trigger khi lines thay đổi)
-- subtotal = sum(line_total / (1 + tax_pct/100))   ← trước thuế
-- tax_amount = sum(line_total) - subtotal
-- total = subtotal - discount_amount + tax_amount + shipping_amount
-- =============================================================================
CREATE OR REPLACE FUNCTION recompute_po_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_po_id UUID;
    v_subtotal NUMERIC(18,4);
    v_tax NUMERIC(18,4);
    v_total NUMERIC(18,4);
BEGIN
    v_po_id := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    SELECT
        COALESCE(SUM(line_total / (1 + tax_pct/100)), 0),
        COALESCE(SUM(line_total) - SUM(line_total / (1 + tax_pct/100)), 0),
        COALESCE(SUM(line_total), 0)
    INTO v_subtotal, v_tax, v_total
    FROM purchase_order_lines
    WHERE purchase_order_id = v_po_id
      AND status <> 'CANCELLED';

    UPDATE purchase_orders
    SET subtotal = v_subtotal,
        tax_amount = v_tax,
        total = v_subtotal - discount_amount + v_tax + shipping_amount,
        updated_at = NOW()
    WHERE id = v_po_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_lines_recompute_totals
AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION recompute_po_totals();

-- =============================================================================
-- FUNCTION: cập nhật status dòng PO dựa trên received_qty vs quantity
-- =============================================================================
CREATE OR REPLACE FUNCTION update_po_line_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CANCELLED' THEN
        RETURN NEW;
    END IF;
    IF NEW.received_qty = 0 THEN
        NEW.status := 'OPEN';
    ELSIF NEW.received_qty < NEW.quantity THEN
        NEW.status := 'PARTIAL';
    ELSE
        NEW.status := 'RECEIVED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_lines_status
BEFORE INSERT OR UPDATE OF received_qty, quantity ON purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION update_po_line_status();

-- =============================================================================
-- TRIGGERS: audit + updated_at
-- =============================================================================
CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_po_lines_updated_at BEFORE UPDATE ON purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_po
AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_po_lines
AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- PURCHASE_ORDERS: scope theo tenant + branch user có quyền (qua app layer)
CREATE POLICY po_tenant_isolation ON purchase_orders
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY po_tenant_write ON purchase_orders
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY po_service_role ON purchase_orders
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- PURCHASE_ORDER_LINES
CREATE POLICY po_lines_tenant_isolation ON purchase_order_lines
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY po_lines_tenant_write ON purchase_order_lines
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY po_lines_service_role ON purchase_order_lines
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_order_lines TO authenticated;
GRANT ALL ON purchase_orders TO service_role;
GRANT ALL ON purchase_order_lines TO service_role;
GRANT EXECUTE ON FUNCTION generate_po_number TO authenticated;
