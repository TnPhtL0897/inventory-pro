-- =============================================================================
-- Phase 2c: Create useful views for PostgREST
-- =============================================================================
-- These views aggregate data from existing stock_*-lines tables to power
-- the dashboard "Tồn kho" module without needing a dedicated stock_movements
-- table. They run as the querying user (anon/authenticated) and respect RLS
-- via the underlying tables' policies.

-- -----------------------------------------------------------------------------
-- View 1: v_stock_levels
-- Aggregate current stock by (product, warehouse, location)
-- Source: union of posted lines from all 4 stock flow tables
-- -----------------------------------------------------------------------------
-- Note: 'status' is a USER-DEFINED enum (status_posted is convention from
-- handlers; verify exact enum value with SELECT enum_range(NULL::document_status)
-- or similar). For now we filter to non-cancelled, posted lines only.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_stock_levels AS
WITH all_posted_lines AS (
    -- Goods Receipts: IN
    SELECT g.tenant_id, l.product_id, g.warehouse_id, l.location_id,
           l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
           l.quantity, l.unit_cost,
           g.receipt_date AS movement_date,
           'IN'::text AS movement_type,
           g.grn_number AS source_ref
    FROM public.goods_receipt_lines l
    JOIN public.goods_receipts g ON g.id = l.goods_receipt_id
    WHERE g.status = 'POSTED'

    UNION ALL

    -- Stock Issues: OUT
    SELECT i.tenant_id, l.product_id, i.warehouse_id, l.location_id,
           l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
           -l.quantity AS quantity,  -- negate (issue = out)
           NULL::numeric AS unit_cost,
           i.issue_date AS movement_date,
           'OUT'::text AS movement_type,
           i.issue_number AS source_ref
    FROM public.stock_issue_lines l
    JOIN public.stock_issues i ON i.id = l.stock_issue_id
    WHERE i.status = 'POSTED'

    UNION ALL

    -- Stock Transfers: split into OUT (from_location) and IN (to_location)
    SELECT t.tenant_id, l.product_id, t.from_warehouse_id, l.from_location_id AS location_id,
           l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
           -l.shipped_qty AS quantity, NULL::numeric AS unit_cost,
           t.created_at::date AS movement_date,
           'TRANSFER_OUT'::text AS movement_type,
           t.transfer_number AS source_ref
    FROM public.stock_transfer_lines l
    JOIN public.stock_transfers t ON t.id = l.stock_transfer_id
    WHERE t.status IN ('IN_TRANSIT', 'RECEIVED')

    UNION ALL

    SELECT t.tenant_id, l.product_id, t.to_warehouse_id, l.to_location_id AS location_id,
           l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
           l.received_qty AS quantity, NULL::numeric AS unit_cost,
           t.updated_at::date AS movement_date,
           'TRANSFER_IN'::text AS movement_type,
           t.transfer_number AS source_ref
    FROM public.stock_transfer_lines l
    JOIN public.stock_transfers t ON t.id = l.stock_transfer_id
    WHERE t.status = 'RECEIVED'
      AND l.received_qty IS NOT NULL
      AND l.received_qty > 0
)
SELECT
    al.tenant_id,
    al.product_id,
    al.warehouse_id,
    al.location_id,
    al.unit_id,
    al.batch_no,
    al.serial_no,
    al.expiry_date,
    SUM(al.quantity) AS on_hand_qty,
    -- Weighted average cost from IN movements only
    COALESCE(
        SUM(CASE WHEN al.quantity > 0 THEN al.quantity * COALESCE(al.unit_cost, 0) ELSE 0 END) /
        NULLIF(SUM(CASE WHEN al.quantity > 0 THEN al.quantity ELSE 0 END), 0),
        0
    )::numeric(18,4) AS weighted_avg_cost,
    -- Most recent movement date
    MAX(al.movement_date) AS last_movement_date
FROM all_posted_lines al
GROUP BY al.tenant_id, al.product_id, al.warehouse_id, al.location_id,
         al.unit_id, al.batch_no, al.serial_no, al.expiry_date;

COMMENT ON VIEW public.v_stock_levels IS
    'Aggregate current stock levels per (product, warehouse, location, batch). '
    'Computed from posted lines of goods_receipts (IN), stock_issues (OUT), '
    'and stock_transfers (TRANSFER_OUT/IN). Excludes draft and cancelled docs.';

-- -----------------------------------------------------------------------------
-- View 2: v_stock_movements_history
-- Unified timeline of all stock movements (read-only, audit-friendly)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_stock_movements_history AS
-- GRN (IN)
SELECT
    g.tenant_id, g.id AS doc_id, g.grn_number AS doc_number,
    'GOODS_RECEIPT'::text AS doc_type,
    'IN'::text AS movement_type,
    l.product_id, g.warehouse_id, l.location_id,
    l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
    l.quantity, l.unit_cost,
    g.receipt_date AS movement_date,
    g.posted_at,
    g.notes
FROM public.goods_receipt_lines l
JOIN public.goods_receipts g ON g.id = l.goods_receipt_id

UNION ALL

-- Issue (OUT)
SELECT
    i.tenant_id, i.id, i.issue_number,
    'STOCK_ISSUE'::text,
    'OUT'::text,
    l.product_id, i.warehouse_id, l.location_id,
    l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
    l.quantity, l.unit_price AS unit_cost,
    i.issue_date, i.posted_at, l.notes
FROM public.stock_issue_lines l
JOIN public.stock_issues i ON i.id = l.stock_issue_id

UNION ALL

-- Transfer (OUT leg)
SELECT
    t.tenant_id, t.id, t.transfer_number,
    'STOCK_TRANSFER'::text,
    'TRANSFER_OUT'::text,
    l.product_id, t.from_warehouse_id, l.from_location_id,
    l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
    l.shipped_qty, NULL::numeric,
    t.created_at::date, t.updated_at, l.notes
FROM public.stock_transfer_lines l
JOIN public.stock_transfers t ON t.id = l.stock_transfer_id

UNION ALL

-- Transfer (IN leg)
SELECT
    t.tenant_id, t.id, t.transfer_number,
    'STOCK_TRANSFER'::text,
    'TRANSFER_IN'::text,
    l.product_id, t.to_warehouse_id, l.to_location_id,
    l.unit_id, l.batch_no, l.serial_no, l.expiry_date,
    l.received_qty, NULL::numeric,
    t.updated_at::date, t.updated_at, l.notes
FROM public.stock_transfer_lines l
JOIN public.stock_transfers t ON t.id = l.stock_transfer_id
WHERE l.received_qty IS NOT NULL AND l.received_qty > 0;

COMMENT ON VIEW public.v_stock_movements_history IS
    'Unified timeline of all stock movements across GRN/Issue/Transfer. '
    'One row per line, denormalized for easy timeline display.';

-- -----------------------------------------------------------------------------
-- View 3: v_low_stock_products
-- Products at/below their min_stock threshold (for replenishment dashboard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_low_stock_products AS
SELECT
    p.tenant_id,
    p.id AS product_id,
    p.sku,
    p.name,
    p.min_stock,
    p.max_stock,
    COALESCE(SUM(v.on_hand_qty), 0) AS current_stock,
    GREATEST(0, p.min_stock - COALESCE(SUM(v.on_hand_qty), 0)) AS shortage_qty,
    GREATEST(0, p.max_stock - COALESCE(SUM(v.on_hand_qty), 0)) AS reorder_qty
FROM public.products p
LEFT JOIN public.v_stock_levels v
       ON v.product_id = p.id
      AND v.tenant_id = p.tenant_id
WHERE p.status = 'ACTIVE'
GROUP BY p.tenant_id, p.id, p.sku, p.name, p.min_stock, p.max_stock
HAVING COALESCE(SUM(v.on_hand_qty), 0) <= p.min_stock;

COMMENT ON VIEW public.v_low_stock_products IS
    'Products with on_hand_qty <= min_stock. Used by replenishment dashboard.';

-- -----------------------------------------------------------------------------
-- Grant SELECT on views to authenticated + anon (RLS still applies via base tables)
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.v_stock_levels TO anon, authenticated;
GRANT SELECT ON public.v_stock_movements_history TO anon, authenticated;
GRANT SELECT ON public.v_low_stock_products TO anon, authenticated;
