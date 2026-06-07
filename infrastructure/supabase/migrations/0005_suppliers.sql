-- =============================================================================
-- Migration 0005: Suppliers + Customers (parties)
-- Module Suppliers: Nhà cung cấp + Khách hàng. Multi-tenancy + RLS.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE party_type AS ENUM ('SUPPLIER', 'CUSTOMER', 'BOTH');
CREATE TYPE party_status AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- =============================================================================
-- SUPPLIERS / CUSTOMERS (gộp chung bảng "parties")
-- Thiết kế: 1 bảng parties với party_type, dùng cho cả NCC và khách hàng.
-- Có thể là BOTH nếu 1 đối tác vừa mua vừa bán.
-- =============================================================================
CREATE TABLE parties (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    party_type      party_type NOT NULL DEFAULT 'SUPPLIER',
    code            VARCHAR(50) NOT NULL,                -- mã nội bộ NCC/KH
    name            VARCHAR(200) NOT NULL,                -- tên đối tác
    tax_code        VARCHAR(50),                          -- mã số thuế
    contact_name    VARCHAR(200),                         -- người liên hệ
    contact_email   CITEXT,
    contact_phone   VARCHAR(50),
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) NOT NULL DEFAULT 'VN',
    payment_terms   INT NOT NULL DEFAULT 0,               -- số ngày thanh toán (0 = tiền mặt)
    credit_limit    NUMERIC(18,4) NOT NULL DEFAULT 0,    -- hạn mức công nợ
    bank_account    VARCHAR(50),                          -- số tài khoản NH
    bank_name       VARCHAR(200),                         -- tên ngân hàng
    notes           TEXT,
    status          party_status NOT NULL DEFAULT 'ACTIVE',
    attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_parties_tenant ON parties(tenant_id);
CREATE INDEX idx_parties_type ON parties(tenant_id, party_type);
CREATE INDEX idx_parties_status ON parties(tenant_id, status);
CREATE INDEX idx_parties_name ON parties USING gin (name gin_trgm_ops);
CREATE INDEX idx_parties_tax_code ON parties(tenant_id, tax_code) WHERE tax_code IS NOT NULL;

COMMENT ON TABLE parties IS 'Đối tác: nhà cung cấp (SUPPLIER), khách hàng (CUSTOMER), hoặc BOTH.';

-- =============================================================================
-- SUPPLIER_PRODUCTS (optional: NCC chính cho 1 product)
-- Giúp biết khi tạo PO có thể default NCC, hoặc lúc tạo GRN đổ từ PO.
-- 1 product có thể có nhiều NCC, mỗi NCC có price + lead_time riêng.
-- =============================================================================
CREATE TABLE supplier_products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    party_id        UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_sku    VARCHAR(100),                         -- mã SKU phía NCC
    cost_price      NUMERIC(18,4) NOT NULL DEFAULT 0,     -- giá mua gần nhất
    min_order_qty   NUMERIC(18,4) NOT NULL DEFAULT 1,     -- MOQ
    lead_time_days  INT NOT NULL DEFAULT 7,               -- thời gian giao hàng
    is_preferred    BOOLEAN NOT NULL DEFAULT FALSE,        -- NCC ưu tiên
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(party_id, product_id)
);

CREATE INDEX idx_supplier_products_tenant ON supplier_products(tenant_id);
CREATE INDEX idx_supplier_products_product ON supplier_products(product_id);
CREATE INDEX idx_supplier_products_preferred ON supplier_products(product_id) WHERE is_preferred = TRUE;

COMMENT ON TABLE supplier_products IS 'NCC cung cấp từng product. Lưu giá + lead time. is_preferred = NCC chính.';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at
CREATE TRIGGER trg_parties_updated_at BEFORE UPDATE ON parties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_supplier_products_updated_at BEFORE UPDATE ON supplier_products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mỗi product chỉ có 1 supplier preferred (partial unique)
CREATE OR REPLACE FUNCTION enforce_single_preferred_supplier()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_preferred = TRUE THEN
        UPDATE supplier_products
        SET is_preferred = FALSE
        WHERE product_id = NEW.product_id
          AND id != NEW.id
          AND is_preferred = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supplier_products_single_preferred
    BEFORE INSERT OR UPDATE OF is_preferred ON supplier_products
    FOR EACH ROW
    WHEN (NEW.is_preferred = TRUE)
    EXECUTE FUNCTION enforce_single_preferred_supplier();

-- Audit
CREATE TRIGGER audit_parties
AFTER INSERT OR UPDATE OR DELETE ON parties
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_supplier_products
AFTER INSERT OR UPDATE OR DELETE ON supplier_products
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

-- PARTIES
CREATE POLICY parties_tenant_isolation ON parties
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY parties_tenant_write ON parties
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY parties_service_role ON parties
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- SUPPLIER_PRODUCTS
CREATE POLICY supplier_products_tenant_isolation ON supplier_products
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY supplier_products_tenant_write ON supplier_products
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY supplier_products_service_role ON supplier_products
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON parties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_products TO authenticated;
GRANT ALL ON parties TO service_role;
GRANT ALL ON supplier_products TO service_role;
