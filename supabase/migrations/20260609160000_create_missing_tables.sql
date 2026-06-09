-- =============================================================================
-- Migration: Create missing tables referenced by C# handlers but not in Supabase
-- =============================================================================
-- Tables: stock_movements, stock, bid_plans, bid_packages, bid_lots, bid_lot_lines,
--         bid_bidders, bid_contracts, purchase_requests, purchase_request_lines
--
-- Schema mirrored from EF Core Configurations (apps/api/src/InventoryPro.Infrastructure
-- /Persistence/Configurations/{Stock,Bidding}Configuration.cs)
--
-- RLS pattern: tenant_id isolation via auth_tenant_id() + service_role bypass,
-- same as existing 25 tables.

-- =============================================================================
-- 1. stock (materialized on-hand quantities, weighted average cost)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stock (
    tenant_id        uuid          NOT NULL,
    branch_id        uuid          NOT NULL,
    warehouse_id     uuid          NOT NULL,
    location_id      uuid          NOT NULL,
    product_id       uuid          NOT NULL,
    batch_no         varchar(100)  NOT NULL DEFAULT '',
    serial_no        varchar(100)  NOT NULL DEFAULT '',
    quantity         numeric(18,4) NOT NULL DEFAULT 0,
    reserved_qty     numeric(18,4) NOT NULL DEFAULT 0,
    avg_cost         numeric(18,4) NOT NULL DEFAULT 0,
    last_movement_at timestamptz,
    version          int           NOT NULL DEFAULT 0,
    created_at       timestamptz   DEFAULT now(),
    updated_at       timestamptz   DEFAULT now(),
    CONSTRAINT stock_pkey PRIMARY KEY (branch_id, warehouse_id, location_id, product_id, batch_no, serial_no)
);

CREATE INDEX IF NOT EXISTS idx_stock_tenant       ON public.stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_product      ON public.stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse_pd ON public.stock(warehouse_id, product_id);

ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_service_role      ON public.stock;
DROP POLICY IF EXISTS stock_tenant_isolation  ON public.stock;
DROP POLICY IF EXISTS stock_tenant_write      ON public.stock;
CREATE POLICY stock_service_role     ON public.stock FOR ALL TO service_role USING (true);
CREATE POLICY stock_tenant_isolation ON public.stock FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY stock_tenant_write     ON public.stock FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 2. stock_movements (event-sourcing log, partitioned by created_at)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid          NOT NULL,
    branch_id       uuid          NOT NULL,
    warehouse_id    uuid          NOT NULL,
    location_id     uuid          NOT NULL,
    product_id      uuid          NOT NULL,
    unit_id         uuid          NOT NULL,
    movement_type   varchar(20)   NOT NULL,    -- IN/OUT/TRANSFER_IN/TRANSFER_OUT/ADJUST_IN/ADJUST_OUT/RETURN_IN/RETURN_OUT
    status          varchar(20)   NOT NULL,    -- POSTED/CANCELLED
    quantity        numeric(18,4) NOT NULL,
    unit_cost       numeric(18,4),
    ref_type        varchar(20)   NOT NULL,    -- GRN/ISSUE/TRANSFER/STOCK_TAKE/ADJUST/MANUAL
    ref_id          uuid,
    ref_line_id     uuid,
    notes           text,
    batch_no        varchar(100)  NOT NULL DEFAULT '',
    serial_no       varchar(100)  NOT NULL DEFAULT '',
    expiry_date     date,
    idempotency_key uuid          NOT NULL,
    created_by      uuid,
    posted_at       timestamptz,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    metadata        jsonb         NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT stock_movements_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Initial partitions (last 6 months + next 6 months, plus a DEFAULT catch-all)
DO $$
DECLARE
    start_date date := date_trunc('month', now() - interval '6 months')::date;
    i int;
BEGIN
    FOR i IN 0..11 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS public.stock_movements_%s PARTITION OF public.stock_movements FOR VALUES FROM (%L) TO (%L)',
            to_char(start_date + (i || ' months')::interval, 'YYYY_MM'),
            start_date + (i || ' months')::interval,
            start_date + ((i+1) || ' months')::interval
        );
    END LOOP;
END $$;

-- Default partition for any dates outside the explicit range
CREATE TABLE IF NOT EXISTS public.stock_movements_default
    PARTITION OF public.stock_movements DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_idem
    ON public.stock_movements(tenant_id, idempotency_key, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product
    ON public.stock_movements(tenant_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch
    ON public.stock_movements(tenant_id, branch_id, created_at);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_service_role     ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_tenant_isolation ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_tenant_write     ON public.stock_movements;
CREATE POLICY stock_movements_service_role     ON public.stock_movements FOR ALL TO service_role USING (true);
CREATE POLICY stock_movements_tenant_isolation ON public.stock_movements FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY stock_movements_tenant_write     ON public.stock_movements FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 3. bid_plans
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_plans (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id             uuid          NOT NULL,
    plan_no               varchar(50)   NOT NULL,
    fiscal_year           int           NOT NULL,
    title                 text          NOT NULL,
    total_estimated_value numeric(18,2),
    status                varchar(20)   NOT NULL DEFAULT 'DRAFT',
    approved_by           uuid,
    approved_at           timestamptz,
    notes                 text,
    created_by            uuid,
    created_at            timestamptz   DEFAULT now(),
    updated_at            timestamptz   DEFAULT now(),
    CONSTRAINT bid_plans_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_plans_tenant_no   ON public.bid_plans(tenant_id, plan_no);
CREATE INDEX        IF NOT EXISTS idx_bid_plans_tenant_fy  ON public.bid_plans(tenant_id, fiscal_year);

ALTER TABLE public.bid_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_plans_service_role     ON public.bid_plans FOR ALL TO service_role USING (true);
CREATE POLICY bid_plans_tenant_isolation ON public.bid_plans FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_plans_tenant_write     ON public.bid_plans FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 4. bid_packages
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_packages (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id             uuid          NOT NULL,
    bid_plan_id           uuid,
    package_no            varchar(50)   NOT NULL,
    package_name          text          NOT NULL,
    bid_package_type      varchar(30)   NOT NULL,
    bid_package_status    varchar(20)   NOT NULL,
    publish_date          date,
    bid_open_date         date,
    bid_close_date        date,
    total_estimated_value numeric(18,2),
    procurement_method    text,
    decision_no           varchar(100),
    decision_date         date,
    notes                 text,
    created_by            uuid,
    created_at            timestamptz   DEFAULT now(),
    updated_at            timestamptz   DEFAULT now(),
    CONSTRAINT bid_packages_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_packages_tenant_no  ON public.bid_packages(tenant_id, package_no);
CREATE INDEX        IF NOT EXISTS idx_bid_packages_plan      ON public.bid_packages(bid_plan_id);
CREATE INDEX        IF NOT EXISTS idx_bid_packages_status    ON public.bid_packages(tenant_id, bid_package_status);

ALTER TABLE public.bid_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_packages_service_role     ON public.bid_packages FOR ALL TO service_role USING (true);
CREATE POLICY bid_packages_tenant_isolation ON public.bid_packages FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_packages_tenant_write     ON public.bid_packages FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 5. bid_lots
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_lots (
    id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id           uuid          NOT NULL,
    bid_package_id      uuid          NOT NULL,
    lot_no              varchar(50)   NOT NULL,
    lot_name            text          NOT NULL,
    bid_lot_status      varchar(20)   NOT NULL,
    product_category    text,
    estimated_value     numeric(18,2),
    quantity_total      numeric(18,4),
    unit                varchar(20),
    awarded_bidder_id   uuid,    -- FK to parties.id (not bid_bidders.id, see handler)
    awarded_value       numeric(18,2),
    awarded_date        date,
    decision_no         varchar(100),
    contract_id         uuid,    -- 1-1 back-ref to bid_contracts (nullable)
    created_by          uuid,
    created_at          timestamptz   DEFAULT now(),
    updated_at          timestamptz   DEFAULT now(),
    CONSTRAINT bid_lots_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_lots_tenant_pkg_lot ON public.bid_lots(tenant_id, bid_package_id, lot_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_lots_contract       ON public.bid_lots(contract_id);
CREATE INDEX        IF NOT EXISTS idx_bid_lots_pkg           ON public.bid_lots(bid_package_id);
CREATE INDEX        IF NOT EXISTS idx_bid_lots_status        ON public.bid_lots(tenant_id, bid_lot_status);
CREATE INDEX        IF NOT EXISTS idx_bid_lots_bidder        ON public.bid_lots(awarded_bidder_id);

ALTER TABLE public.bid_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_lots_service_role     ON public.bid_lots FOR ALL TO service_role USING (true);
CREATE POLICY bid_lots_tenant_isolation ON public.bid_lots FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_lots_tenant_write     ON public.bid_lots FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 6. bid_lot_lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_lot_lines (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id             uuid          NOT NULL,
    bid_lot_id            uuid          NOT NULL,
    product_id            uuid          NOT NULL,
    quantity              numeric(18,4),
    unit_id               uuid          NOT NULL,
    estimated_unit_price  numeric(18,4),
    notes                 text,
    created_at            timestamptz   DEFAULT now(),
    updated_at            timestamptz   DEFAULT now(),
    CONSTRAINT bid_lot_lines_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_bid_lot_lines_lot     ON public.bid_lot_lines(bid_lot_id);
CREATE INDEX IF NOT EXISTS idx_bid_lot_lines_product ON public.bid_lot_lines(product_id);

ALTER TABLE public.bid_lot_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_lot_lines_service_role     ON public.bid_lot_lines FOR ALL TO service_role USING (true);
CREATE POLICY bid_lot_lines_tenant_isolation ON public.bid_lot_lines FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_lot_lines_tenant_write     ON public.bid_lot_lines FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 7. bid_bidders
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_bidders (
    id                uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id         uuid          NOT NULL,
    bid_lot_id        uuid          NOT NULL,
    party_id          uuid          NOT NULL,
    bid_price         numeric(18,2),
    bid_date          timestamptz,
    is_winner         boolean       NOT NULL DEFAULT false,
    rank              int,
    evaluation_score  numeric(5,2),
    notes             text,
    created_at        timestamptz   DEFAULT now(),
    updated_at        timestamptz   DEFAULT now(),
    CONSTRAINT bid_bidders_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_bidders_lot_party ON public.bid_bidders(bid_lot_id, party_id);
CREATE INDEX        IF NOT EXISTS idx_bid_bidders_party    ON public.bid_bidders(party_id);

ALTER TABLE public.bid_bidders ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_bidders_service_role     ON public.bid_bidders FOR ALL TO service_role USING (true);
CREATE POLICY bid_bidders_tenant_isolation ON public.bid_bidders FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_bidders_tenant_write     ON public.bid_bidders FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 8. bid_contracts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bid_contracts (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id             uuid          NOT NULL,
    bid_lot_id            uuid          NOT NULL,    -- required FK from principal
    contract_no           varchar(100)  NOT NULL,
    contract_name         text,
    winning_party_id      uuid          NOT NULL,
    contract_value        numeric(18,2),
    contract_start_date   date,
    contract_end_date     date,
    used_value            numeric(18,2) NOT NULL DEFAULT 0,
    bid_contract_status   varchar(20)   NOT NULL,
    payment_terms         text,
    advance_payment_pct   numeric(5,2),
    retention_pct         numeric(5,2),
    warranty_months       int,
    signing_date          date,
    notes                 text,
    created_by            uuid,
    created_at            timestamptz   DEFAULT now(),
    updated_at            timestamptz   DEFAULT now(),
    CONSTRAINT bid_contracts_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_contracts_tenant_no   ON public.bid_contracts(tenant_id, contract_no);
CREATE INDEX        IF NOT EXISTS idx_bid_contracts_lot        ON public.bid_contracts(bid_lot_id);
CREATE INDEX        IF NOT EXISTS idx_bid_contracts_party      ON public.bid_contracts(winning_party_id);
CREATE INDEX        IF NOT EXISTS idx_bid_contracts_date_range ON public.bid_contracts(tenant_id, contract_start_date, contract_end_date);
CREATE INDEX        IF NOT EXISTS idx_bid_contracts_status     ON public.bid_contracts(tenant_id, bid_contract_status);

ALTER TABLE public.bid_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bid_contracts_service_role     ON public.bid_contracts FOR ALL TO service_role USING (true);
CREATE POLICY bid_contracts_tenant_isolation ON public.bid_contracts FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY bid_contracts_tenant_write     ON public.bid_contracts FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 9. purchase_requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id              uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id       uuid          NOT NULL,
    branch_id       uuid          NOT NULL,
    bid_plan_id     uuid,
    pr_number       varchar(50)   NOT NULL,
    request_dept    text          NOT NULL,
    requester_id    uuid,
    fiscal_year     int,
    status          varchar(20)   NOT NULL,
    requested_date  date,
    approved_by     uuid,
    approved_at     timestamptz,
    notes           text,
    created_by      uuid,
    created_at      timestamptz   DEFAULT now(),
    updated_at      timestamptz   DEFAULT now(),
    CONSTRAINT purchase_requests_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requests_tenant_pr ON public.purchase_requests(tenant_id, pr_number);
CREATE INDEX        IF NOT EXISTS idx_purchase_requests_branch   ON public.purchase_requests(tenant_id, branch_id);
CREATE INDEX        IF NOT EXISTS idx_purchase_requests_plan     ON public.purchase_requests(bid_plan_id);
CREATE INDEX        IF NOT EXISTS idx_purchase_requests_status   ON public.purchase_requests(tenant_id, status);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requests_service_role     ON public.purchase_requests FOR ALL TO service_role USING (true);
CREATE POLICY purchase_requests_tenant_isolation ON public.purchase_requests FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY purchase_requests_tenant_write     ON public.purchase_requests FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- 10. purchase_request_lines
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_request_lines (
    id                    uuid          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id             uuid          NOT NULL,
    purchase_request_id   uuid          NOT NULL,
    product_id            uuid          NOT NULL,
    quantity              numeric(18,4),
    unit_id               uuid          NOT NULL,
    estimated_unit_price  numeric(18,4),
    notes                 text,
    created_at            timestamptz   DEFAULT now(),
    updated_at            timestamptz   DEFAULT now(),
    CONSTRAINT purchase_request_lines_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_pr  ON public.purchase_request_lines(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_pd  ON public.purchase_request_lines(product_id);

ALTER TABLE public.purchase_request_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_request_lines_service_role     ON public.purchase_request_lines FOR ALL TO service_role USING (true);
CREATE POLICY purchase_request_lines_tenant_isolation ON public.purchase_request_lines FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY purchase_request_lines_tenant_write     ON public.purchase_request_lines FOR ALL USING (tenant_id = auth_tenant_id());

-- =============================================================================
-- Foreign keys (added after all tables exist to avoid order issues)
-- =============================================================================
DO $$
BEGIN
    -- bid_packages -> bid_plans
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_packages_plan') THEN
        ALTER TABLE public.bid_packages
            ADD CONSTRAINT fk_bid_packages_plan FOREIGN KEY (bid_plan_id) REFERENCES public.bid_plans(id) ON DELETE SET NULL;
    END IF;
    -- bid_lots -> bid_packages
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_lots_package') THEN
        ALTER TABLE public.bid_lots
            ADD CONSTRAINT fk_bid_lots_package FOREIGN KEY (bid_package_id) REFERENCES public.bid_packages(id) ON DELETE CASCADE;
    END IF;
    -- bid_lot_lines -> bid_lots
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_lot_lines_lot') THEN
        ALTER TABLE public.bid_lot_lines
            ADD CONSTRAINT fk_bid_lot_lines_lot FOREIGN KEY (bid_lot_id) REFERENCES public.bid_lots(id) ON DELETE CASCADE;
    END IF;
    -- bid_bidders -> bid_lots, parties
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_bidders_lot') THEN
        ALTER TABLE public.bid_bidders
            ADD CONSTRAINT fk_bid_bidders_lot FOREIGN KEY (bid_lot_id) REFERENCES public.bid_lots(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_bidders_party') THEN
        ALTER TABLE public.bid_bidders
            ADD CONSTRAINT fk_bid_bidders_party FOREIGN KEY (party_id) REFERENCES public.parties(id);
    END IF;
    -- bid_contracts -> bid_lots, parties
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_contracts_lot') THEN
        ALTER TABLE public.bid_contracts
            ADD CONSTRAINT fk_bid_contracts_lot FOREIGN KEY (bid_lot_id) REFERENCES public.bid_lots(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bid_contracts_party') THEN
        ALTER TABLE public.bid_contracts
            ADD CONSTRAINT fk_bid_contracts_party FOREIGN KEY (winning_party_id) REFERENCES public.parties(id);
    END IF;
    -- purchase_requests -> bid_plans, branches
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_requests_plan') THEN
        ALTER TABLE public.purchase_requests
            ADD CONSTRAINT fk_purchase_requests_plan FOREIGN KEY (bid_plan_id) REFERENCES public.bid_plans(id) ON DELETE SET NULL;
    END IF;
    -- purchase_request_lines -> purchase_requests
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_request_lines_pr') THEN
        ALTER TABLE public.purchase_request_lines
            ADD CONSTRAINT fk_purchase_request_lines_pr FOREIGN KEY (purchase_request_id) REFERENCES public.purchase_requests(id) ON DELETE CASCADE;
    END IF;
    -- stock_movements -> parties/warehouses (basic, not all)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_movements_branch') THEN
        ALTER TABLE public.stock_movements
            ADD CONSTRAINT fk_stock_movements_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id);
    END IF;
END $$;

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE public.stock_movements IS 'Event-sourcing log of all stock movements. Partitioned by created_at (monthly). PK = (id, created_at).';
COMMENT ON TABLE public.stock             IS 'Materialized on-hand quantities by (branch, warehouse, location, product, batch, serial). Composite PK.';
COMMENT ON TABLE public.bid_plans         IS 'Annual bidding plans (KHĐT).';
COMMENT ON TABLE public.bid_packages      IS 'Packages within a bid plan. Each package contains multiple lots.';
COMMENT ON TABLE public.bid_lots          IS 'Lots within a package. 1-1 with bid_contracts when awarded.';
COMMENT ON TABLE public.bid_lot_lines     IS 'Line items (products) within a lot.';
COMMENT ON TABLE public.bid_bidders       IS 'Bidders participating in a lot. Unique (lot_id, party_id).';
COMMENT ON TABLE public.bid_contracts     IS 'Signed contracts. 1-1 with bid_lots. Tracks used_value vs contract_value.';
COMMENT ON TABLE public.purchase_requests IS 'Purchase requisitions from departments. Source of bid_plans/PR aggregation.';
COMMENT ON TABLE public.purchase_request_lines IS 'Line items in a purchase request.';
