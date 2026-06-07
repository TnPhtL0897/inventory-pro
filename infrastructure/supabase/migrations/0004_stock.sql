-- =============================================================================
-- Migration 0004: Stock + Stock movements (event-sourcing)
-- Theo ADR-0002: stock_movements append-only + stock là materialized view.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
-- Movement types dùng cho cả IN/OUT/TRANSFER/ADJUST
CREATE TYPE stock_movement_type AS ENUM (
    'IN',              -- nhập kho thủ công / từ GRN
    'OUT',             -- xuất kho thủ công / từ issue
    'TRANSFER_IN',     -- nhận từ branch khác
    'TRANSFER_OUT',    -- chuyển sang branch khác
    'ADJUST_IN',       -- điều chỉnh tăng (kiểm kê dư)
    'ADJUST_OUT',      -- điều chỉnh giảm (kiểm kê thiếu, hỏng, mất)
    'RETURN_IN',       -- khách trả hàng
    'RETURN_OUT'       -- trả NCC
);

CREATE TYPE stock_movement_status AS ENUM (
    'PENDING',    -- mới tạo, chưa apply
    'POSTED',     -- đã apply vào stock (trigger đã chạy)
    'REVERSED',   -- đã bị hủy/reverse
    'CANCELLED'   -- hủy trước khi post
);

CREATE TYPE stock_reference_type AS ENUM (
    'MANUAL',       -- nhập tay
    'GRN',          -- goods received note
    'ISSUE',        -- phiếu xuất
    'TRANSFER',     -- phiếu chuyển kho
    'STOCKTAKE',    -- kiểm kê
    'SALE_RETURN',  -- trả hàng bán
    'PURCHASE_RETURN' -- trả hàng mua
);

-- =============================================================================
-- STOCK_MOVEMENTS (append-only, partition theo created_at)
-- Mỗi dòng = 1 sự kiện thay đổi tồn. quantity có dấu: +IN, -OUT.
-- idempotency_key chống duplicate (client-supplied UUID).
-- =============================================================================
CREATE TABLE stock_movements (
    id              UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_id         UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    movement_type   stock_movement_type NOT NULL,
    status          stock_movement_status NOT NULL DEFAULT 'POSTED',
    -- Số lượng theo unit_id ở trên. Để tính về base unit, dùng product_units.factor.
    quantity        NUMERIC(18,4) NOT NULL CHECK (quantity <> 0),
    unit_cost       NUMERIC(18,4),                    -- giá vốn tại thời điểm (cho IN)
    ref_type        stock_reference_type NOT NULL DEFAULT 'MANUAL',
    ref_id          UUID,                              -- ID của GRN/ISSUE/TRANSFER...
    ref_line_id     UUID,                              -- ID dòng (nếu có)
    notes           TEXT,
    batch_no        VARCHAR(100),                      -- lô (nếu is_batch_tracked)
    serial_no       VARCHAR(100),                      -- serial (nếu is_serial_tracked)
    expiry_date     DATE,                              -- HSD (nếu is_expiry_tracked)
    idempotency_key UUID NOT NULL,                     -- chống duplicate
    created_by      UUID REFERENCES users(id),
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partial unique trên idempotency_key (per tenant) - chống duplicate
CREATE UNIQUE INDEX idx_stock_movements_idempotency
    ON stock_movements(tenant_id, idempotency_key);

CREATE INDEX idx_stock_movements_tenant_product ON stock_movements(tenant_id, product_id, created_at DESC);
CREATE INDEX idx_stock_movements_tenant_branch ON stock_movements(tenant_id, branch_id, created_at DESC);
CREATE INDEX idx_stock_movements_tenant_warehouse ON stock_movements(tenant_id, warehouse_id, created_at DESC);
CREATE INDEX idx_stock_movements_ref ON stock_movements(ref_type, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX idx_stock_movements_batch ON stock_movements(product_id, batch_no) WHERE batch_no IS NOT NULL;
CREATE INDEX idx_stock_movements_serial ON stock_movements(product_id, serial_no) WHERE serial_no IS NOT NULL;

COMMENT ON TABLE stock_movements IS 'Append-only event log mọi thay đổi tồn. Partition theo tháng. Revoke UPDATE/DELETE.';

-- Tạo partitions cho 12 tháng tới (sẽ auto-extend sau bằng cron)
DO $$
DECLARE
    v_start DATE := date_trunc('month', NOW())::DATE;
    v_end   DATE;
    v_i     INT;
BEGIN
    FOR v_i IN 0..11 LOOP
        v_end := (v_start + (v_i + 1) * INTERVAL '1 month')::DATE;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS stock_movements_%s PARTITION OF stock_movements
             FOR VALUES FROM (%L) TO (%L)',
            to_char(v_start + v_i * INTERVAL '1 month', 'YYYY_MM'),
            (v_start + v_i * INTERVAL '1 month')::DATE,
            v_end
        );
    END LOOP;
END $$;

-- =============================================================================
-- STOCK (materialized view của stock_movements)
-- Composite PK theo (branch, warehouse, location, product) [+ batch/serial nếu tracked]
-- version: optimistic locking cho concurrent update.
-- =============================================================================
CREATE TABLE stock (
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_no        VARCHAR(100),                      -- NULL nếu không track
    serial_no       VARCHAR(100),                      -- NULL nếu không track
    quantity        NUMERIC(18,4) NOT NULL DEFAULT 0,
    reserved_qty    NUMERIC(18,4) NOT NULL DEFAULT 0,  -- đã reserve cho order (chưa xuất)
    avg_cost        NUMERIC(18,4) NOT NULL DEFAULT 0,  -- weighted avg cost
    last_movement_at TIMESTAMPTZ,
    version         INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, warehouse_id, location_id, product_id, batch_no, serial_no)
);

CREATE INDEX idx_stock_tenant ON stock(tenant_id);
CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_stock_warehouse ON stock(warehouse_id, product_id);
CREATE INDEX idx_stock_branch ON stock(branch_id, product_id);
-- Filter theo sản phẩm còn tồn
CREATE INDEX idx_stock_nonzero ON stock(tenant_id, product_id) WHERE quantity > 0;

COMMENT ON TABLE stock IS 'Tồn kho hiện tại. Materialized từ stock_movements. PK có batch/serial để track chi tiết.';

-- =============================================================================
-- TRIGGER: UPSERT stock từ stock_movements
-- Chạy với row-level lock (FOR UPDATE) để an toàn concurrent.
-- Đây là core của event-sourcing: mọi insert movement = cập nhật stock.
-- =============================================================================
CREATE OR REPLACE FUNCTION apply_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_quantity_signed NUMERIC(18,4);
    v_new_qty         NUMERIC(18,4);
    v_new_avg_cost    NUMERIC(18,4);
    v_warehouse_allow_negative BOOLEAN;
BEGIN
    -- Chỉ apply khi status = POSTED
    IF NEW.status <> 'POSTED' THEN
        RETURN NEW;
    END IF;

    -- Tính quantity có dấu theo movement_type
    v_quantity_signed := CASE NEW.movement_type
        WHEN 'IN'           THEN  NEW.quantity
        WHEN 'OUT'          THEN -NEW.quantity
        WHEN 'TRANSFER_IN'  THEN  NEW.quantity
        WHEN 'TRANSFER_OUT' THEN -NEW.quantity
        WHEN 'ADJUST_IN'    THEN  NEW.quantity
        WHEN 'ADJUST_OUT'   THEN -NEW.quantity
        WHEN 'RETURN_IN'    THEN  NEW.quantity
        WHEN 'RETURN_OUT'   THEN -NEW.quantity
    END;

    -- Upsert stock với row-level lock
    INSERT INTO stock (
        tenant_id, branch_id, warehouse_id, location_id, product_id,
        batch_no, serial_no, quantity, avg_cost,
        last_movement_at, version
    )
    VALUES (
        NEW.tenant_id, NEW.branch_id, NEW.warehouse_id, NEW.location_id, NEW.product_id,
        NEW.batch_no, NEW.serial_no, v_quantity_signed,
        COALESCE(NEW.unit_cost, 0),
        NEW.posted_at, 1
    )
    ON CONFLICT (branch_id, warehouse_id, location_id, product_id, batch_no, serial_no)
    DO UPDATE SET
        quantity = stock.quantity + EXCLUDED.quantity,
        -- Weighted average cost (chỉ áp dụng khi IN)
        avg_cost = CASE
            WHEN EXCLUDED.quantity > 0 AND EXCLUDED.avg_cost > 0 THEN
                ((stock.quantity * stock.avg_cost) + (EXCLUDED.quantity * EXCLUDED.avg_cost))
                / NULLIF(stock.quantity + EXCLUDED.quantity, 0)
            ELSE stock.avg_cost
        END,
        last_movement_at = EXCLUDED.last_movement_at,
        version = stock.version + 1,
        updated_at = NOW()
    RETURNING quantity, avg_cost INTO v_new_qty, v_new_avg_cost;

    -- Kiểm tra warehouse có cho phép âm không
    SELECT allow_negative INTO v_warehouse_allow_negative
    FROM warehouses
    WHERE id = NEW.warehouse_id;

    IF COALESCE(v_warehouse_allow_negative, FALSE) = FALSE AND v_new_qty < 0 THEN
        RAISE EXCEPTION 'Stock would go negative (qty=%) at warehouse=%, product=%, batch=%, serial=%',
            v_new_qty, NEW.warehouse_id, NEW.product_id, NEW.batch_no, NEW.serial_no
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger AFTER INSERT trên partition cha (tự áp dụng cho mọi partition)
CREATE TRIGGER trg_stock_movements_apply
    AFTER INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- updated_at trên stock
CREATE TRIGGER trg_stock_updated_at BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only enforcement: revoke UPDATE/DELETE từ authenticated
REVOKE UPDATE, DELETE ON stock_movements FROM authenticated;
REVOKE UPDATE, DELETE ON stock_movements FROM anon;
-- Service role vẫn được (cho admin / correction)
-- Lưu ý: cần ALTER ... DISABLE trigger trước khi xóa/service maintenance

-- Audit (chỉ INSERT, vì row không bao giờ update/delete)
CREATE TRIGGER audit_stock_movements
AFTER INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- FUNCTION RPC: ghi movement an toàn (cho API/server gọi)
-- Wrap insert + check quyền + trả về row.
-- =============================================================================
CREATE OR REPLACE FUNCTION record_stock_movement(
    p_branch_id      UUID,
    p_warehouse_id   UUID,
    p_location_id    UUID,
    p_product_id     UUID,
    p_unit_id        UUID,
    p_movement_type  stock_movement_type,
    p_quantity       NUMERIC,
    p_unit_cost      NUMERIC DEFAULT NULL,
    p_ref_type       stock_reference_type DEFAULT 'MANUAL',
    p_ref_id         UUID DEFAULT NULL,
    p_ref_line_id    UUID DEFAULT NULL,
    p_notes          TEXT DEFAULT NULL,
    p_batch_no       VARCHAR DEFAULT NULL,
    p_serial_no      VARCHAR DEFAULT NULL,
    p_expiry_date    DATE DEFAULT NULL,
    p_idempotency_key UUID DEFAULT NULL
)
RETURNS stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := auth_tenant_id();
    v_result stock_movements;
    v_idempotency_key UUID := COALESCE(p_idempotency_key, uuid_generate_v4());
BEGIN
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Missing tenant_id in JWT claims';
    END IF;

    IF p_quantity IS NULL OR p_quantity = 0 THEN
        RAISE EXCEPTION 'Quantity must be non-zero';
    END IF;

    -- Idempotency: nếu key đã tồn tại cho tenant này, trả về row cũ
    SELECT * INTO v_result
    FROM stock_movements
    WHERE tenant_id = v_tenant_id
      AND idempotency_key = v_idempotency_key;

    IF FOUND THEN
        RETURN v_result;
    END IF;

    INSERT INTO stock_movements (
        tenant_id, branch_id, warehouse_id, location_id, product_id, unit_id,
        movement_type, quantity, unit_cost, ref_type, ref_id, ref_line_id,
        notes, batch_no, serial_no, expiry_date, idempotency_key, created_by
    )
    VALUES (
        v_tenant_id, p_branch_id, p_warehouse_id, p_location_id, p_product_id, p_unit_id,
        p_movement_type, p_quantity, p_unit_cost, p_ref_type, p_ref_id, p_ref_line_id,
        p_notes, p_batch_no, p_serial_no, p_expiry_date, v_idempotency_key, auth.uid()
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION record_stock_movement IS 'Ghi 1 stock movement. Idempotent qua idempotency_key. Trigger tự apply vào stock.';

-- =============================================================================
-- FUNCTION: truy vấn tồn hiện tại (helper)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_current_stock(
    p_branch_id    UUID DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL,
    p_product_id   UUID DEFAULT NULL
)
RETURNS TABLE (
    branch_id    UUID,
    warehouse_id UUID,
    location_id  UUID,
    product_id   UUID,
    batch_no     VARCHAR,
    serial_no    VARCHAR,
    quantity     NUMERIC,
    reserved_qty NUMERIC,
    available_qty NUMERIC,
    avg_cost     NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT
        s.branch_id,
        s.warehouse_id,
        s.location_id,
        s.product_id,
        s.batch_no,
        s.serial_no,
        s.quantity,
        s.reserved_qty,
        s.quantity - s.reserved_qty AS available_qty,
        s.avg_cost
    FROM stock s
    WHERE s.tenant_id = auth_tenant_id()
      AND (p_branch_id    IS NULL OR s.branch_id    = p_branch_id)
      AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
      AND (p_product_id   IS NULL OR s.product_id   = p_product_id);
$$;

COMMENT ON FUNCTION get_current_stock IS 'Lấy tồn hiện tại. Có thể filter theo branch/warehouse/product.';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

-- STOCK_MOVEMENTS: chỉ SELECT (không UPDATE/DELETE qua app - đã revoke)
CREATE POLICY stock_movements_tenant_isolation ON stock_movements
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

-- INSERT thông qua RPC record_stock_movement (SECURITY DEFINER bypass RLS)
-- Tuy nhiên authenticated cũng có thể insert trực tiếp nếu cần (vd bulk import)
CREATE POLICY stock_movements_insert ON stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY stock_movements_service_role ON stock_movements
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- STOCK: scope theo tenant
CREATE POLICY stock_tenant_isolation ON stock
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

-- Cho phép trigger ghi vào stock (vì trigger chạy SECURITY DEFINER + là owner)
-- Nhưng authenticated cũng cần insert/update nếu có lý do (vd manual fix).
-- Mặc định chỉ service_role mới ghi stock để đảm bảo consistency.
CREATE POLICY stock_service_role ON stock
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT ON stock_movements TO authenticated;  -- không UPDATE/DELETE
GRANT SELECT ON stock TO authenticated;                     -- không INSERT/UPDATE/DELETE
GRANT ALL ON stock_movements TO service_role;
GRANT ALL ON stock TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- RPC grants
GRANT EXECUTE ON FUNCTION record_stock_movement TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_stock TO authenticated;
