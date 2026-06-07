-- =============================================================================
-- Migration 0003: Warehouses + Locations
-- warehouses (per branch), locations (bins/shelves within a warehouse)
-- Multi-tenancy: Row-Level Security (RLS) + tenant_id + branch_id
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE warehouse_status AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');
CREATE TYPE location_status AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');
CREATE TYPE location_type AS ENUM (
    'RECEIVING',    -- khu nhận hàng
    'STORAGE',      -- lưu kho chính
    'PICKING',      -- khu lấy hàng
    'PACKING',      -- khu đóng gói
    'SHIPPING',     -- khu xuất hàng
    'QUARANTINE',   -- khu cách ly (chờ xử lý)
    'TRANSIT',      -- trung chuyển
    'RETURN'        -- khu hàng trả
);

-- =============================================================================
-- WAREHOUSES
-- Mỗi branch có thể có nhiều warehouse. Một số tenant lớn có warehouse chuyên biệt
-- (kho NVL, kho TP, kho phụ tùng...). Warehouse là scope của stock.
-- =============================================================================
CREATE TABLE warehouses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    address         TEXT,
    phone           VARCHAR(50),
    manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,   -- default receiving warehouse
    allow_negative  BOOLEAN NOT NULL DEFAULT FALSE,   -- cho phép tồn âm (vd kho transit)
    status          warehouse_status NOT NULL DEFAULT 'ACTIVE',
    attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- diện tích, sức chứa...
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(branch_id, code)
);

CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);
CREATE INDEX idx_warehouses_branch ON warehouses(branch_id);
CREATE INDEX idx_warehouses_status ON warehouses(branch_id, status);
CREATE INDEX idx_warehouses_default ON warehouses(branch_id) WHERE is_default = TRUE;

COMMENT ON TABLE warehouses IS 'Kho vật lý. Mỗi branch có thể có nhiều warehouse. Scope của stock.';

-- =============================================================================
-- LOCATIONS
-- Vị trí/bin trong warehouse. Cho phép FEFO/FIFO chi tiết theo location.
-- barcode = mã vạch vị trí (dùng scanner để pick/put).
-- Một số warehouse không cần location (vd kho nhỏ) → cho phép NULL warehouse_id? Không -
-- nếu không cần location thì coi như location ảo "MAIN". Sẽ tự seed khi tạo warehouse.
-- =============================================================================
CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES locations(id) ON DELETE RESTRICT,  -- zone > aisle > shelf > bin
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(80) NOT NULL,           -- A-01-03-BIN12
    barcode         VARCHAR(100),                    -- scan
    location_type   location_type NOT NULL DEFAULT 'STORAGE',
    capacity_volume NUMERIC(18,4),                  -- cm3
    capacity_weight NUMERIC(18,4),                  -- gram
    max_qty_hint    NUMERIC(18,4),                  -- hint cho UI, không enforce
    pick_sequence   INT NOT NULL DEFAULT 0,          -- thứ tự pick
    is_pickable     BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    status          location_status NOT NULL DEFAULT 'ACTIVE',
    attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(warehouse_id, code)
);

CREATE UNIQUE INDEX idx_locations_warehouse_barcode
    ON locations(warehouse_id, barcode)
    WHERE barcode IS NOT NULL;

CREATE INDEX idx_locations_tenant ON locations(tenant_id);
CREATE INDEX idx_locations_branch ON locations(branch_id);
CREATE INDEX idx_locations_warehouse ON locations(warehouse_id);
CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_pickable ON locations(warehouse_id, is_pickable) WHERE is_pickable = TRUE;

COMMENT ON TABLE locations IS 'Vị trí/bin trong warehouse. Có thể lồng nhau (zone > aisle > bin).';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mỗi branch chỉ có 1 warehouse default (partial unique)
CREATE OR REPLACE FUNCTION enforce_single_default_warehouse()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE warehouses
        SET is_default = FALSE
        WHERE branch_id = NEW.branch_id
          AND id != NEW.id
          AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warehouses_single_default
    BEFORE INSERT OR UPDATE OF is_default ON warehouses
    FOR EACH ROW
    WHEN (NEW.is_default = TRUE)
    EXECUTE FUNCTION enforce_single_default_warehouse();

-- Prevent location cycle (parent_id không được là descendant)
CREATE OR REPLACE FUNCTION check_location_no_cycle()
RETURNS TRIGGER AS $$
DECLARE
    v_current_parent UUID;
BEGIN
    v_current_parent := NEW.parent_id;
    WHILE v_current_parent IS NOT NULL LOOP
        IF v_current_parent = NEW.id THEN
            RAISE EXCEPTION 'Location cycle detected: cannot set parent_id to a descendant';
        END IF;
        SELECT parent_id INTO v_current_parent
        FROM locations
        WHERE id = v_current_parent;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_locations_no_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON locations
    FOR EACH ROW EXECUTE FUNCTION check_location_no_cycle();

-- Auto-seed default location "MAIN" khi tạo warehouse
CREATE OR REPLACE FUNCTION seed_warehouse_default_location()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO locations (
        tenant_id, branch_id, warehouse_id, name, code,
        location_type, pick_sequence
    )
    VALUES (
        NEW.tenant_id, NEW.branch_id, NEW.id,
        'Main Storage', 'MAIN', 'STORAGE', 0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warehouses_seed_location AFTER INSERT ON warehouses
    FOR EACH ROW EXECUTE FUNCTION seed_warehouse_default_location();

-- Audit triggers
CREATE TRIGGER audit_warehouses
AFTER INSERT OR UPDATE OR DELETE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_locations
AFTER INSERT OR UPDATE OR DELETE ON locations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- WAREHOUSES: scope theo tenant + branch user có quyền
CREATE POLICY warehouses_tenant_isolation ON warehouses
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY warehouses_tenant_write ON warehouses
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY warehouses_service_role ON warehouses
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- LOCATIONS
CREATE POLICY locations_tenant_isolation ON locations
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY locations_tenant_write ON locations
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY locations_service_role ON locations
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON warehouses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO authenticated;
GRANT ALL ON warehouses TO service_role;
GRANT ALL ON locations TO service_role;
