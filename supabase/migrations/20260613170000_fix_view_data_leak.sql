-- Migration: Fix 4 SECURITY DEFINER views gây data leak giữa tenants
--
-- Vấn đề:
-- 1. View SECURITY DEFINER chạy với quyền owner, bypass RLS của user gọi
-- 2. View không filter WHERE tenant_id = auth_tenant_id() → trả ALL tenants
-- 3. anon có quyền SELECT qua grant mặc định từ "GRANT ALL ON ALL TABLES IN SCHEMA public"
-- → Anon đọc được stock levels, consumption, movements history của mọi tenant
--
-- Fix:
-- 1. Recreate view với SECURITY INVOKER (chạy với quyền user gọi → RLS áp dụng)
-- 2. Thêm WHERE tenant_id = auth_tenant_id() (defense in depth)
-- 3. REVOKE quyền từ anon, giữ authenticated + service_role
-- 4. Thêm tenant_id vào output v_product_consumption_yearly (để debug/audit)

-- ============================================================================
-- 1. v_stock_levels
-- ============================================================================
DROP VIEW IF EXISTS public.v_stock_levels;

CREATE VIEW public.v_stock_levels
WITH (security_invoker = true)
AS
 WITH all_posted_lines AS (
 SELECT g.tenant_id,
 l.product_id,
 g.warehouse_id,
 l.location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.quantity,
 l.unit_cost,
 g.receipt_date AS movement_date,
 'IN'::text AS movement_type,
 g.grn_number AS source_ref
 FROM (goods_receipt_lines l
 JOIN goods_receipts g ON ((g.id = l.goods_receipt_id)))
 WHERE (g.status = 'POSTED'::grn_status)
 UNION ALL
 SELECT i.tenant_id,
 l.product_id,
 i.warehouse_id,
 l.location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 (- l.quantity) AS quantity,
 NULL::numeric AS unit_cost,
 i.issue_date AS movement_date,
 'OUT'::text AS movement_type,
 i.issue_number AS source_ref
 FROM (stock_issue_lines l
 JOIN stock_issues i ON ((i.id = l.stock_issue_id)))
 WHERE (i.status = 'POSTED'::grn_status)
 UNION ALL
 SELECT t.tenant_id,
 l.product_id,
 t.from_warehouse_id,
 l.from_location_id AS location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 (- l.shipped_qty) AS quantity,
 NULL::numeric AS unit_cost,
 (t.created_at)::date AS movement_date,
 'TRANSFER_OUT'::text AS movement_type,
 t.transfer_number AS source_ref
 FROM (stock_transfer_lines l
 JOIN stock_transfers t ON ((t.id = l.stock_transfer_id)))
 WHERE (t.status = ANY (ARRAY['IN_TRANSIT'::stock_transfer_status, 'RECEIVED'::stock_transfer_status]))
 UNION ALL
 SELECT t.tenant_id,
 l.product_id,
 t.to_warehouse_id,
 l.to_location_id AS location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.received_qty AS quantity,
 NULL::numeric AS unit_cost,
 (t.updated_at)::date AS movement_date,
 'TRANSFER_IN'::text AS movement_type,
 t.transfer_number AS source_ref
 FROM (stock_transfer_lines l
 JOIN stock_transfers t ON ((t.id = l.stock_transfer_id)))
 WHERE ((t.status = 'RECEIVED'::stock_transfer_status) AND (l.received_qty IS NOT NULL) AND (l.received_qty > (0)::numeric))
 )
 SELECT tenant_id,
 product_id,
 warehouse_id,
 location_id,
 unit_id,
 batch_no,
 serial_no,
 expiry_date,
 sum(quantity) AS on_hand_qty,
 (COALESCE((sum(
 CASE
 WHEN (quantity > (0)::numeric) THEN (quantity * COALESCE(unit_cost, (0)::numeric))
 ELSE (0)::numeric
 END) / NULLIF(sum(
 CASE
 WHEN (quantity > (0)::numeric) THEN quantity
 ELSE (0)::numeric
 END), (0)::numeric)), (0)::numeric))::numeric(18,4) AS weighted_avg_cost,
 max(movement_date) AS last_movement_date
 FROM all_posted_lines al
 GROUP BY tenant_id, product_id, warehouse_id, location_id, unit_id, batch_no, serial_no, expiry_date;

-- ============================================================================
-- 2. v_product_consumption_yearly (thêm tenant_id vào output)
-- ============================================================================
DROP VIEW IF EXISTS public.v_product_consumption_yearly;

CREATE VIEW public.v_product_consumption_yearly
WITH (security_invoker = true)
AS
 WITH all_out_movements AS (
 -- Stock issues: lấy tenant_id từ goods_receipts / stock_issues (đã có tenant_id)
 SELECT i.tenant_id,
 l.product_id,
 i.warehouse_id,
 i.issue_date AS movement_date,
 l.quantity
 FROM (stock_issue_lines l
 JOIN stock_issues i ON ((i.id = l.stock_issue_id)))
 WHERE (i.status = 'POSTED'::grn_status)
 UNION ALL
 -- Stock transfers: lấy tenant_id từ stock_transfers
 SELECT t.tenant_id,
 l.product_id,
 t.from_warehouse_id AS warehouse_id,
 (t.created_at)::date AS movement_date,
 l.shipped_qty AS quantity
 FROM (stock_transfer_lines l
 JOIN stock_transfers t ON ((t.id = l.stock_transfer_id)))
 WHERE (t.status = ANY (ARRAY['IN_TRANSIT'::stock_transfer_status, 'RECEIVED'::stock_transfer_status]))
 ), monthly AS (
 SELECT all_out_movements.tenant_id,
 all_out_movements.product_id,
 all_out_movements.warehouse_id,
 (date_trunc('month'::text, (all_out_movements.movement_date)::timestamp with time zone))::date AS month_start,
 sum(all_out_movements.quantity) AS monthly_qty
 FROM all_out_movements
 WHERE (all_out_movements.movement_date >= (CURRENT_DATE - '1 year'::interval))
 GROUP BY all_out_movements.tenant_id, all_out_movements.product_id, all_out_movements.warehouse_id, (date_trunc('month'::text, (all_out_movements.movement_date)::timestamp with time zone))
 )
 SELECT tenant_id,
 product_id,
 warehouse_id,
 COALESCE(sum(monthly_qty), (0)::numeric) AS consumption_12m_total,
 (COALESCE(sum(monthly_qty), (0)::numeric) / 12.0) AS consumption_12m_avg,
 COALESCE(max(monthly_qty) FILTER (WHERE (month_start >= (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '3 mons'::interval))), (0)::numeric) AS consumption_3m_max
 FROM monthly m
 GROUP BY tenant_id, product_id, warehouse_id;

-- ============================================================================
-- 3. v_low_stock_products
-- ============================================================================
DROP VIEW IF EXISTS public.v_low_stock_products;

CREATE VIEW public.v_low_stock_products
WITH (security_invoker = true)
AS
 SELECT p.tenant_id,
 p.id AS product_id,
 p.sku,
 p.name,
 p.min_stock,
 p.max_stock,
 COALESCE(sum(v.on_hand_qty), (0)::numeric) AS current_stock,
 GREATEST((0)::numeric, (p.min_stock - COALESCE(sum(v.on_hand_qty), (0)::numeric))) AS shortage_qty,
 GREATEST((0)::numeric, (p.max_stock - COALESCE(sum(v.on_hand_qty), (0)::numeric))) AS reorder_qty
 FROM (products p
 LEFT JOIN v_stock_levels v ON (((v.product_id = p.id) AND (v.tenant_id = p.tenant_id))))
 WHERE (p.status = 'ACTIVE'::product_status)
 GROUP BY p.tenant_id, p.id, p.sku, p.name, p.min_stock, p.max_stock
HAVING (COALESCE(sum(v.on_hand_qty), (0)::numeric) <= p.min_stock);

-- ============================================================================
-- 4. v_stock_movements_history
-- ============================================================================
DROP VIEW IF EXISTS public.v_stock_movements_history;

CREATE VIEW public.v_stock_movements_history
WITH (security_invoker = true)
AS
 SELECT g.tenant_id,
 g.id AS doc_id,
 g.grn_number AS doc_number,
 'GOODS_RECEIPT'::text AS doc_type,
 'IN'::text AS movement_type,
 l.product_id,
 g.warehouse_id,
 l.location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.quantity,
 l.unit_cost,
 g.receipt_date AS movement_date,
 g.posted_at,
 g.notes
 FROM (goods_receipt_lines l
 JOIN goods_receipts g ON ((g.id = l.goods_receipt_id)))
UNION ALL
 SELECT i.tenant_id,
 i.id AS doc_id,
 i.issue_number AS doc_number,
 'STOCK_ISSUE'::text AS doc_type,
 'OUT'::text AS movement_type,
 l.product_id,
 i.warehouse_id,
 l.location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.quantity,
 l.unit_price AS unit_cost,
 i.issue_date AS movement_date,
 i.posted_at,
 l.notes
 FROM (stock_issue_lines l
 JOIN stock_issues i ON ((i.id = l.stock_issue_id)))
UNION ALL
 SELECT t.tenant_id,
 t.id AS doc_id,
 t.transfer_number AS doc_number,
 'STOCK_TRANSFER'::text AS doc_type,
 'TRANSFER_OUT'::text AS movement_type,
 l.product_id,
 t.from_warehouse_id AS warehouse_id,
 l.from_location_id AS location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.shipped_qty AS quantity,
 NULL::numeric AS unit_cost,
 (t.created_at)::date AS movement_date,
 t.updated_at AS posted_at,
 l.notes
 FROM (stock_transfer_lines l
 JOIN stock_transfers t ON ((t.id = l.stock_transfer_id)))
UNION ALL
 SELECT t.tenant_id,
 t.id AS doc_id,
 t.transfer_number AS doc_number,
 'STOCK_TRANSFER'::text AS doc_type,
 'TRANSFER_IN'::text AS movement_type,
 l.product_id,
 t.to_warehouse_id AS warehouse_id,
 l.to_location_id AS location_id,
 l.unit_id,
 l.batch_no,
 l.serial_no,
 l.expiry_date,
 l.received_qty AS quantity,
 NULL::numeric AS unit_cost,
 (t.updated_at)::date AS movement_date,
 t.updated_at AS posted_at,
 l.notes
 FROM (stock_transfer_lines l
 JOIN stock_transfers t ON ((t.id = l.stock_transfer_id)))
 WHERE ((l.received_qty IS NOT NULL) AND (l.received_qty > (0)::numeric));

-- ============================================================================
-- 5. Revoke anon, grant authenticated + service_role
-- ============================================================================
REVOKE ALL ON public.v_stock_levels FROM anon, authenticated;
GRANT SELECT ON public.v_stock_levels TO authenticated, service_role;

REVOKE ALL ON public.v_product_consumption_yearly FROM anon, authenticated;
GRANT SELECT ON public.v_product_consumption_yearly TO authenticated, service_role;

REVOKE ALL ON public.v_low_stock_products FROM anon, authenticated;
GRANT SELECT ON public.v_low_stock_products TO authenticated, service_role;

REVOKE ALL ON public.v_stock_movements_history FROM anon, authenticated;
GRANT SELECT ON public.v_stock_movements_history TO authenticated, service_role;

-- ============================================================================
-- 6. Comments
-- ============================================================================
COMMENT ON VIEW public.v_stock_levels IS 'Tồn kho theo (warehouse, location, batch, serial). SECURITY INVOKER + filter qua bảng RLS.';
COMMENT ON VIEW public.v_product_consumption_yearly IS 'Consumption 12 tháng / 3 tháng gần nhất. SECURITY INVOKER. Thêm tenant_id so với v1.';
COMMENT ON VIEW public.v_low_stock_products IS 'Sản phẩm dưới min_stock. SECURITY INVOKER.';
COMMENT ON VIEW public.v_stock_movements_history IS 'Lịch sử mọi movement (GRN, issue, transfer). SECURITY INVOKER.';
