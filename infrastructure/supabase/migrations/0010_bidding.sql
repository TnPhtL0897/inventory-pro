-- =============================================================================
-- Migration 0010: Bidding Management (Quản lý Đấu thầu)
-- Module: Mua sắm đấu thầu cho đơn vị công lập (tuân thủ Luật Đấu thầu 2023).
-- Workflow:
--   bid_plans (KHĐT năm) → purchase_requests (Dự trù) → bid_packages (Gói thầu)
--     → bid_lots (Lô/Phần thầu) → bid_bidders (Nhà thầu) → Award → bid_contracts (HĐ)
-- Mỗi PO phải link tới bid_contract; mỗi GRN + stock_movement lưu bid_lot_id để
-- truy vết kiểm toán. used_value của HĐ tự cập nhật khi GRN posted.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE bid_package_type AS ENUM (
    'OPEN',                 -- Đấu thầu rộng rãi
    'LIMITED',              -- Đấu thầu hạn chế
    'DIRECT',               -- Chỉ định thầu
    'COMPETITIVE_QUOTE'     -- Chào hàng cạnh tranh
);

CREATE TYPE bid_package_status AS ENUM (
    'DRAFT',
    'APPROVED',
    'PUBLISHED',
    'CLOSED',
    'AWARDED',
    'CANCELLED'
);

CREATE TYPE bid_lot_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'EVALUATING',
    'AWARDED',
    'CANCELLED',
    'NO_BIDDER'
);

CREATE TYPE bid_contract_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'EXPIRED',
    'TERMINATED',
    'COMPLETED'
);

CREATE TYPE purchase_request_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'MERGED'
);

-- =============================================================================
-- 1. BID_PLANS (Kế hoạch đấu thầu năm)
-- =============================================================================
CREATE TABLE bid_plans (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_no               VARCHAR(50) NOT NULL,
    fiscal_year           INT NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
    title                 TEXT NOT NULL,
    total_estimated_value NUMERIC(18,2),
    status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT/APPROVED/IN_PROGRESS/CLOSED
    approved_by           UUID REFERENCES users(id),
    approved_at           TIMESTAMPTZ,
    notes                 TEXT,
    created_by            UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, plan_no)
);
CREATE INDEX idx_bid_plans_tenant ON bid_plans(tenant_id);
CREATE INDEX idx_bid_plans_year ON bid_plans(tenant_id, fiscal_year DESC);

COMMENT ON TABLE bid_plans IS 'Kế hoạch đấu thầu năm. Gom các gói thầu dự kiến trong năm.';

-- =============================================================================
-- 2. PURCHASE_REQUESTS (Dự trù mua sắm)
-- =============================================================================
CREATE TABLE purchase_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    bid_plan_id     UUID REFERENCES bid_plans(id) ON DELETE SET NULL,
    pr_number       VARCHAR(50) NOT NULL,
    request_dept    TEXT NOT NULL,
    requester_id    UUID REFERENCES users(id),
    fiscal_year     INT,
    status          purchase_request_status NOT NULL DEFAULT 'DRAFT',
    requested_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, pr_number)
);
CREATE INDEX idx_pr_tenant ON purchase_requests(tenant_id);
CREATE INDEX idx_pr_branch ON purchase_requests(tenant_id, branch_id);
CREATE INDEX idx_pr_plan ON purchase_requests(bid_plan_id);
CREATE INDEX idx_pr_status ON purchase_requests(tenant_id, status);

CREATE TABLE purchase_request_lines (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_request_id     UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity                NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_id                 UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    estimated_unit_price    NUMERIC(18,4) CHECK (estimated_unit_price >= 0),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pr_lines_pr ON purchase_request_lines(purchase_request_id);
CREATE INDEX idx_pr_lines_product ON purchase_request_lines(product_id);

COMMENT ON TABLE purchase_requests IS 'Dự trù mua sắm từ khoa/phòng. Sau khi approve có thể gom vào KHĐT + gói thầu.';
COMMENT ON TABLE purchase_request_lines IS 'Dòng vật tư trong dự trù.';

-- =============================================================================
-- 3. BID_PACKAGES (Gói thầu)
-- =============================================================================
CREATE TABLE bid_packages (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bid_plan_id             UUID REFERENCES bid_plans(id) ON DELETE SET NULL,
    package_no              VARCHAR(50) NOT NULL,
    package_name            TEXT NOT NULL,
    bid_package_type        bid_package_type NOT NULL,
    bid_package_status      bid_package_status NOT NULL DEFAULT 'DRAFT',
    publish_date            DATE,
    bid_open_date           TIMESTAMPTZ,
    bid_close_date          TIMESTAMPTZ,
    total_estimated_value   NUMERIC(18,2),
    procurement_method      TEXT,                       -- Căn cứ Luật Đấu thầu
    decision_no             VARCHAR(100),               -- Số QĐ phê duyệt gói thầu
    decision_date           DATE,
    notes                   TEXT,
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, package_no)
);
CREATE INDEX idx_bid_packages_tenant ON bid_packages(tenant_id);
CREATE INDEX idx_bid_packages_plan ON bid_packages(bid_plan_id);
CREATE INDEX idx_bid_packages_status ON bid_packages(tenant_id, bid_package_status);

COMMENT ON TABLE bid_packages IS 'Gói thầu. Có thể chia thành nhiều lô/phần (bid_lots).';

-- =============================================================================
-- 4. BID_LOTS (Phần/Lô thầu - quan trọng nhất)
-- =============================================================================
CREATE TABLE bid_lots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bid_package_id      UUID NOT NULL REFERENCES bid_packages(id) ON DELETE CASCADE,
    lot_no              VARCHAR(50) NOT NULL,
    lot_name            TEXT NOT NULL,
    bid_lot_status      bid_lot_status NOT NULL DEFAULT 'DRAFT',
    product_category    TEXT,                          -- gợi ý nhóm vật tư
    estimated_value     NUMERIC(18,2),
    quantity_total      NUMERIC(18,4),
    unit                VARCHAR(20),
    awarded_bidder_id   UUID REFERENCES parties(id),  -- NCC trúng thầu
    awarded_value       NUMERIC(18,2),
    awarded_date        DATE,
    decision_no         VARCHAR(100),                 -- Số QĐ phê duyệt kết quả trúng thầu
    contract_id         UUID REFERENCES bid_contracts(id) ON DELETE SET NULL,  -- set sau khi tạo HĐ
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, bid_package_id, lot_no)
);
CREATE INDEX idx_bid_lots_tenant ON bid_lots(tenant_id);
CREATE INDEX idx_bid_lots_package ON bid_lots(bid_package_id);
CREATE INDEX idx_bid_lots_status ON bid_lots(tenant_id, bid_lot_status);
CREATE INDEX idx_bid_lots_winner ON bid_lots(awarded_bidder_id);

CREATE TABLE bid_lot_lines (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bid_lot_id              UUID NOT NULL REFERENCES bid_lots(id) ON DELETE CASCADE,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity                NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_id                 UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
    estimated_unit_price    NUMERIC(18,4) CHECK (estimated_unit_price >= 0),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bid_lot_lines_lot ON bid_lot_lines(bid_lot_id);
CREATE INDEX idx_bid_lot_lines_product ON bid_lot_lines(product_id);

COMMENT ON TABLE bid_lots IS 'Phần/lô thầu - mỗi lô có thể trúng 1 nhà thầu riêng. Đây là đơn vị mua sắm thực tế.';
COMMENT ON TABLE bid_lot_lines IS 'Dòng vật tư trong lô thầu - định nghĩa chính xác SP, SL, đơn giá dự kiến.';

-- =============================================================================
-- 5. BID_BIDDERS (Nhà thầu tham gia dự thầu)
-- =============================================================================
CREATE TABLE bid_bidders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bid_lot_id          UUID NOT NULL REFERENCES bid_lots(id) ON DELETE CASCADE,
    party_id            UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    bid_price           NUMERIC(18,2),
    bid_date            TIMESTAMPTZ,
    is_winner           BOOLEAN NOT NULL DEFAULT FALSE,
    rank                INT,                          -- 1, 2, 3...
    evaluation_score    NUMERIC(5,2),                 -- 0-100
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(bid_lot_id, party_id)
);
CREATE INDEX idx_bid_bidders_lot ON bid_bidders(bid_lot_id);
CREATE INDEX idx_bid_bidders_party ON bid_bidders(party_id);
CREATE INDEX idx_bid_bidders_winner ON bid_bidders(bid_lot_id) WHERE is_winner = TRUE;

COMMENT ON TABLE bid_bidders IS 'Nhà thầu tham gia dự thầu từng lô. Sau khi chấm, 1 bidder được đánh dấu is_winner.';

-- =============================================================================
-- 6. BID_CONTRACTS (Hợp đồng thầu ⭐)
-- =============================================================================
CREATE TABLE bid_contracts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bid_lot_id              UUID NOT NULL REFERENCES bid_lots(id) ON DELETE RESTRICT,
    contract_no             VARCHAR(100) NOT NULL,
    contract_name           TEXT,
    winning_party_id        UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    contract_value          NUMERIC(18,2) NOT NULL CHECK (contract_value > 0),
    contract_start_date     DATE NOT NULL,
    contract_end_date       DATE NOT NULL,
    used_value              NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (used_value >= 0),
    bid_contract_status     bid_contract_status NOT NULL DEFAULT 'ACTIVE',
    payment_terms           INT,
    advance_payment_pct     NUMERIC(5,2) CHECK (advance_payment_pct >= 0 AND advance_payment_pct <= 100),
    retention_pct           NUMERIC(5,2) CHECK (retention_pct >= 0 AND retention_pct <= 100),
    warranty_months         INT,
    signing_date            DATE,
    notes                   TEXT,
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (contract_end_date >= contract_start_date),
    CHECK (used_value <= contract_value),
    UNIQUE(tenant_id, contract_no)
);
CREATE INDEX idx_bid_contracts_tenant ON bid_contracts(tenant_id);
CREATE INDEX idx_bid_contracts_lot ON bid_contracts(bid_lot_id);
CREATE INDEX idx_bid_contracts_party ON bid_contracts(winning_party_id);
CREATE INDEX idx_bid_contracts_dates ON bid_contracts(tenant_id, contract_start_date, contract_end_date);
CREATE INDEX idx_bid_contracts_status ON bid_contracts(tenant_id, bid_contract_status);

COMMENT ON TABLE bid_contracts IS 'Hợp đồng thầu đã ký với nhà thầu trúng. Mỗi PO phải link tới 1 HĐ thầu; used_value tự cập nhật từ GRN.';

-- =============================================================================
-- ALTER EXISTING TABLES - thêm FK thầu
-- =============================================================================
ALTER TABLE purchase_orders
    ADD COLUMN bid_contract_id UUID REFERENCES bid_contracts(id) ON DELETE RESTRICT,
    ADD COLUMN bid_lot_id      UUID REFERENCES bid_lots(id) ON DELETE RESTRICT;
CREATE INDEX idx_po_bid_contract ON purchase_orders(bid_contract_id);
CREATE INDEX idx_po_bid_lot ON purchase_orders(bid_lot_id);

ALTER TABLE goods_receipts
    ADD COLUMN bid_contract_id UUID REFERENCES bid_contracts(id) ON DELETE RESTRICT,
    ADD COLUMN bid_lot_id      UUID REFERENCES bid_lots(id) ON DELETE RESTRICT;
CREATE INDEX idx_grn_bid_contract ON goods_receipts(bid_contract_id);
CREATE INDEX idx_grn_bid_lot ON goods_receipts(bid_lot_id);

ALTER TABLE stock_movements
    ADD COLUMN bid_lot_id UUID REFERENCES bid_lots(id) ON DELETE SET NULL;
CREATE INDEX idx_movements_bid_lot ON stock_movements(tenant_id, bid_lot_id);

COMMENT ON COLUMN purchase_orders.bid_contract_id IS 'HĐ thầu (BẮT BUỘC - mỗi PO phải gắn với 1 HĐ thầu). Validate ở app layer.';
COMMENT ON COLUMN purchase_orders.bid_lot_id IS 'Lô thầu tương ứng trong HĐ. Để kiểm tra vật tư PO có nằm trong lô thầu không.';
COMMENT ON COLUMN goods_receipts.bid_lot_id IS 'Lô thầu mà lô hàng này thuộc về - auto-fill từ PO.';
COMMENT ON COLUMN stock_movements.bid_lot_id IS 'Lô thầu - auto-fill từ GRN. Dùng để truy vết kiểm toán.';

-- =============================================================================
-- GENERATE NUMBER FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_bid_plan_no(p_tenant_id UUID, p_year INT)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'KHĐT-' || p_year::text || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM bid_plans
    WHERE tenant_id = p_tenant_id
      AND plan_no LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION generate_pr_number(p_tenant_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'DT-' || to_char(p_date, 'YYYY') || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM purchase_requests
    WHERE tenant_id = p_tenant_id
      AND pr_number LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION generate_bid_package_no(p_tenant_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'GTHAU-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM bid_packages
    WHERE tenant_id = p_tenant_id
      AND package_no LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION generate_bid_contract_no(p_tenant_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR;
    v_count  INT;
BEGIN
    v_prefix := 'HĐ-' || to_char(p_date, 'YYYY') || '-';
    SELECT COUNT(*) + 1 INTO v_count
    FROM bid_contracts
    WHERE tenant_id = p_tenant_id
      AND contract_no LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- TRIGGER: auto cập nhật used_value của bid_contracts khi GRN posted
-- =============================================================================
CREATE OR REPLACE FUNCTION update_bid_contract_used_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Khi GRN chuyển sang POSTED và có bid_contract_id → cộng used_value
    IF (TG_OP = 'INSERT' AND NEW.status = 'POSTED' AND NEW.bid_contract_id IS NOT NULL) THEN
        UPDATE bid_contracts
        SET used_value = used_value + COALESCE(NEW.total_amount, 0),
            updated_at = NOW()
        WHERE id = NEW.bid_contract_id;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.status = 'POSTED' AND NEW.bid_contract_id IS NOT NULL THEN
            UPDATE bid_contracts
            SET used_value = used_value + COALESCE(NEW.total_amount, 0),
                updated_at = NOW()
            WHERE id = NEW.bid_contract_id;
        ELSIF OLD.status = 'POSTED' AND NEW.status = 'CANCELLED' AND OLD.bid_contract_id IS NOT NULL THEN
            UPDATE bid_contracts
            SET used_value = GREATEST(used_value - COALESCE(OLD.total_amount, 0), 0),
                updated_at = NOW()
            WHERE id = OLD.bid_contract_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_bid_contract_used
AFTER INSERT OR UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION update_bid_contract_used_value();

-- =============================================================================
-- TRIGGER: auto-fill stock_movements.bid_lot_id từ GRN
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_bid_lot_to_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bid_lot_id IS NOT NULL THEN
        UPDATE stock_movements
        SET bid_lot_id = NEW.bid_lot_id
        WHERE ref_type = 'GRN' AND ref_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_bid_lot_to_movement
AFTER INSERT OR UPDATE OF bid_lot_id ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION sync_bid_lot_to_movement();

-- =============================================================================
-- TRIGGER: set bid_lots.contract_id = bid_contracts.id (1-1) sau khi tạo HĐ
-- =============================================================================
CREATE OR REPLACE FUNCTION set_bid_lot_contract_link()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bid_lot_id IS NOT NULL THEN
        UPDATE bid_lots
        SET contract_id = NEW.id,
            updated_at = NOW()
        WHERE id = NEW.bid_lot_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_bid_lot_contract_link
AFTER INSERT ON bid_contracts
FOR EACH ROW EXECUTE FUNCTION set_bid_lot_contract_link();

-- =============================================================================
-- TRIGGER: ensure only 1 winner per bid_lot
-- =============================================================================
CREATE OR REPLACE FUNCTION ensure_single_winner()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_winner = TRUE THEN
        UPDATE bid_bidders
        SET is_winner = FALSE
        WHERE bid_lot_id = NEW.bid_lot_id
          AND id != NEW.id
          AND is_winner = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_single_winner
BEFORE INSERT OR UPDATE OF is_winner ON bid_bidders
FOR EACH ROW EXECUTE FUNCTION ensure_single_winner();

-- =============================================================================
-- TRIGGERS: updated_at + audit cho tất cả bảng mới
-- =============================================================================
CREATE TRIGGER trg_bid_plans_updated_at BEFORE UPDATE ON bid_plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pr_updated_at BEFORE UPDATE ON purchase_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pr_lines_updated_at BEFORE UPDATE ON purchase_request_lines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bid_packages_updated_at BEFORE UPDATE ON bid_packages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bid_lots_updated_at BEFORE UPDATE ON bid_lots
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bid_lot_lines_updated_at BEFORE UPDATE ON bid_lot_lines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bid_bidders_updated_at BEFORE UPDATE ON bid_bidders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bid_contracts_updated_at BEFORE UPDATE ON bid_contracts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_bid_plans
AFTER INSERT OR UPDATE OR DELETE ON bid_plans
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_pr
AFTER INSERT OR UPDATE OR DELETE ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_pr_lines
AFTER INSERT OR UPDATE OR DELETE ON purchase_request_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_bid_packages
AFTER INSERT OR UPDATE OR DELETE ON bid_packages
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_bid_lots
AFTER INSERT OR UPDATE OR DELETE ON bid_lots
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_bid_lot_lines
AFTER INSERT OR UPDATE OR DELETE ON bid_lot_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_bid_bidders
AFTER INSERT OR UPDATE OR DELETE ON bid_bidders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_bid_contracts
AFTER INSERT OR UPDATE OR DELETE ON bid_contracts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE bid_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_lot_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_bidders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_contracts ENABLE ROW LEVEL SECURITY;

-- Policy: tenant isolation + service role bypass
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'bid_plans', 'purchase_requests', 'purchase_request_lines',
        'bid_packages', 'bid_lots', 'bid_lot_lines',
        'bid_bidders', 'bid_contracts'
    ]
    LOOP
        EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I FOR SELECT TO authenticated USING (tenant_id = auth_tenant_id())', t, t);
        EXECUTE format('CREATE POLICY %I_tenant_write ON %I FOR ALL TO authenticated USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id())', t, t);
        EXECUTE format('CREATE POLICY %I_service_role ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON bid_plans, purchase_requests, purchase_request_lines,
    bid_packages, bid_lots, bid_lot_lines, bid_bidders, bid_contracts TO authenticated;
GRANT ALL ON bid_plans, purchase_requests, purchase_request_lines,
    bid_packages, bid_lots, bid_lot_lines, bid_bidders, bid_contracts TO service_role;
GRANT EXECUTE ON FUNCTION generate_bid_plan_no, generate_pr_number,
    generate_bid_package_no, generate_bid_contract_no TO authenticated;
