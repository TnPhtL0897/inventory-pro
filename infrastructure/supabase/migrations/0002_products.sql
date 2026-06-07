-- =============================================================================
-- Migration 0002: Products master data
-- categories (tree), units_of_measure, products, product_units (conversion)
-- Multi-tenancy: Row-Level Security (RLS) + tenant_id
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- GIN index cho tìm kiếm theo tên

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE product_type AS ENUM ('GOODS', 'SERVICE', 'RAW_MATERIAL', 'FINISHED_GOOD', 'CONSUMABLE');
CREATE TYPE product_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE unit_type AS ENUM ('COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA', 'TIME');

-- =============================================================================
-- CATEGORIES (tree structure)
-- Mỗi tenant tự tổ chức cây danh mục riêng. parent_id NULL = root.
-- =============================================================================
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES categories(id) ON DELETE RESTRICT,
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    description     TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(tenant_id, is_active);

COMMENT ON TABLE categories IS 'Danh mục sản phẩm dạng cây. Mỗi tenant có cây riêng.';

-- =============================================================================
-- UNITS OF MEASURE
-- Đơn vị tính. Mỗi tenant có 1 bảng đơn vị riêng.
-- Mặc định seed: CÁI (COUNT), KG (WEIGHT), LÍT (VOLUME), MÉT (LENGTH).
-- =============================================================================
CREATE TABLE units_of_measure (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(20) NOT NULL,    -- CÁI, KG, LÍT, MÉT, THÙNG, HỘP...
    name            VARCHAR(100) NOT NULL,   -- Cái, Kilogram, Lít, Mét, Thùng, Hộp
    unit_type       unit_type NOT NULL DEFAULT 'COUNT',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_units_tenant ON units_of_measure(tenant_id);
CREATE INDEX idx_units_active ON units_of_measure(tenant_id, is_active);

COMMENT ON TABLE units_of_measure IS 'Đơn vị tính. Tenant tự định nghĩa.';

-- =============================================================================
-- PRODUCTS
-- SKU unique theo tenant. barcode unique theo tenant (cho phép NULL - không phải SP nào cũng có).
-- base_unit_id = đơn vị gốc (vd: CÁI). Mọi conversion tính về base.
-- =============================================================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku             VARCHAR(50) NOT NULL,
    barcode         VARCHAR(50),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category_id     UUID REFERENCES categories(id) ON DELETE RESTRICT,
    base_unit_id    UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    product_type    product_type NOT NULL DEFAULT 'GOODS',
    cost_price      NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    sell_price      NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
    min_stock       NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    max_stock       NUMERIC(18,4) CHECK (max_stock IS NULL OR max_stock >= min_stock),
    is_batch_tracked     BOOLEAN NOT NULL DEFAULT FALSE,  -- quản lý lô (sau)
    is_serial_tracked    BOOLEAN NOT NULL DEFAULT FALSE,  -- quản lý serial (sau)
    is_expiry_tracked    BOOLEAN NOT NULL DEFAULT FALSE,  -- HSD (sau)
    weight              NUMERIC(18,4),  -- gram
    volume              NUMERIC(18,4),  -- cm3
    attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- extensible: màu sắc, size, brand...
    image_url           TEXT,
    status              product_status NOT NULL DEFAULT 'ACTIVE',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, sku)
);

-- Cho phép nhiều product NULL barcode (vì partial unique không có sẵn, dùng unique index có điều kiện)
CREATE UNIQUE INDEX idx_products_tenant_barcode
    ON products(tenant_id, barcode)
    WHERE barcode IS NOT NULL;

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(tenant_id, status);
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

COMMENT ON TABLE products IS 'Sản phẩm/vật tư. SKU unique theo tenant. Có RLS.';

-- =============================================================================
-- PRODUCT UNITS (conversion)
-- Một product có thể dùng nhiều đơn vị: 1 THÙNG = 24 CÁI. 1 HỘP = 12 CÁI.
-- factor: 1 unit này = factor unit base. VD: 1 THÙNG = 24 CÁI → factor=24.
-- conversion: quantity_in_base = quantity_in_unit * factor.
-- is_purchase / is_sale: đơn vị dùng khi mua/bán (thường chỉ 1 đơn vị sale chính).
-- =============================================================================
CREATE TABLE product_units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_id         UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    factor          NUMERIC(18,6) NOT NULL CHECK (factor > 0),  -- 1 unit này = factor base
    is_purchase     BOOLEAN NOT NULL DEFAULT FALSE,
    is_sale         BOOLEAN NOT NULL DEFAULT FALSE,
    barcode         VARCHAR(50),  -- barcode riêng cho unit conversion
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, unit_id)
);

CREATE INDEX idx_product_units_product ON product_units(product_id);
CREATE INDEX idx_product_units_tenant ON product_units(tenant_id);

-- Mỗi product chỉ có 1 unit sale chính (partial unique)
CREATE UNIQUE INDEX idx_product_units_one_sale
    ON product_units(product_id)
    WHERE is_sale = TRUE;

-- Mỗi product chỉ có 1 unit purchase chính (partial unique)
CREATE UNIQUE INDEX idx_product_units_one_purchase
    ON product_units(product_id)
    WHERE is_purchase = TRUE;

CREATE UNIQUE INDEX idx_product_units_barcode
    ON product_units(tenant_id, barcode)
    WHERE barcode IS NOT NULL;

COMMENT ON TABLE product_units IS 'Đơn vị quy đổi cho product. 1 unit = factor base unit.';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units_of_measure
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_units_updated_at BEFORE UPDATE ON product_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Prevent category cycle (parent_id không được là chính nó hoặc descendant)
CREATE OR REPLACE FUNCTION check_category_no_cycle()
RETURNS TRIGGER AS $$
DECLARE
    v_current_parent UUID;
BEGIN
    v_current_parent := NEW.parent_id;
    WHILE v_current_parent IS NOT NULL LOOP
        IF v_current_parent = NEW.id THEN
            RAISE EXCEPTION 'Category cycle detected: cannot set parent_id to a descendant';
        END IF;
        SELECT parent_id INTO v_current_parent
        FROM categories
        WHERE id = v_current_parent;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_no_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON categories
    FOR EACH ROW EXECUTE FUNCTION check_category_no_cycle();

-- Audit triggers
CREATE TRIGGER audit_categories
AFTER INSERT OR UPDATE OR DELETE ON categories
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_units
AFTER INSERT OR UPDATE OR DELETE ON units_of_measure
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_products
AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_product_units
AFTER INSERT OR UPDATE OR DELETE ON product_units
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;

-- CATEGORIES
CREATE POLICY categories_tenant_isolation ON categories
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY categories_tenant_write ON categories
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY categories_service_role ON categories
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- UNITS_OF_MEASURE
CREATE POLICY units_tenant_isolation ON units_of_measure
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY units_tenant_write ON units_of_measure
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY units_service_role ON units_of_measure
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- PRODUCTS: cần check quyền products.read / products.write (qua application layer, RLS chỉ scope tenant)
CREATE POLICY products_tenant_isolation ON products
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY products_tenant_write ON products
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY products_service_role ON products
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- PRODUCT_UNITS
CREATE POLICY product_units_tenant_isolation ON product_units
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY product_units_tenant_write ON product_units
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY product_units_service_role ON product_units
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- SEED: units mặc định khi tạo tenant
-- =============================================================================
CREATE OR REPLACE FUNCTION seed_tenant_default_units()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO units_of_measure (tenant_id, code, name, unit_type)
    VALUES
        (NEW.id, 'CÁI', 'Cái', 'COUNT'),
        (NEW.id, 'KG',  'Kilogram', 'WEIGHT'),
        (NEW.id, 'G',   'Gram', 'WEIGHT'),
        (NEW.id, 'LÍT', 'Lít', 'VOLUME'),
        (NEW.id, 'ML',  'Mililít', 'VOLUME'),
        (NEW.id, 'MÉT', 'Mét', 'LENGTH'),
        (NEW.id, 'CM',  'Centimét', 'LENGTH'),
        (NEW.id, 'M2',  'Mét vuông', 'AREA'),
        (NEW.id, 'HỘP', 'Hộp', 'COUNT'),
        (NEW.id, 'THÙNG', 'Thùng', 'COUNT');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_seed_units AFTER INSERT ON tenants
    FOR EACH ROW EXECUTE FUNCTION seed_tenant_default_units();

-- =============================================================================
-- HELPER: validate product_units.factor dùng đúng unit_type với base unit
-- (Bổ sung sau khi có bảng stock movements để dùng chung)
-- =============================================================================
