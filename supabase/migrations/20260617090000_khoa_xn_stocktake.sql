-- =============================================================================
-- Khoa XN — Module #4: Monthly Stock Take (Dual Scope)
-- File: supabase/migrations/20260617090000_khoa_xn_stocktake.sql
--
-- ADAPT existing stock_takes + stock_take_lines tables cho Khoa XN:
-- - Thêm columns: product_group, assigned_to, period_year, period_month, adjustment_history, discrepancy_category
-- - Helper functions: fn_create_monthly_stocktake (snapshot từ lots)
-- - RLS update: filter theo product_group
-- =============================================================================

-- =============================================================================
-- 1. ENUMs (mới)
-- =============================================================================

-- Stocktake line status (mở rộng từ status hiện có)
-- (existing enum: stock_take_status = DRAFT|COUNTED|POSTED|CANCELLED)
-- Thêm 'ADJUSTED' = thủ kho đã tạo StockMovement điều chỉnh
DO $$ BEGIN
  CREATE TYPE stocktake_line_status AS ENUM (
    'PENDING',        -- Mới tạo, chưa đếm
    'COUNTED',       -- Đã đếm, chênh lệch = 0
    'DISCREPANCY',   -- Có chênh lệch
    'ADJUSTED',      -- Đã approve + tạo StockMovement
    'REJECTED',      -- Bị Trưởng khoa từ chối, cần đếm lại
    'SKIPPED'        -- Bỏ qua (vd: sản phẩm bán hết)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Discrepancy category (lý do chênh lệch)
DO $$ BEGIN
  CREATE TYPE stocktake_discrepancy_category AS ENUM (
    'BROKEN',                -- Vỡ/hỏng vật lý
    'EXPIRED_BUT_NOT_FLAGGED',  -- Hết hạn nhưng chưa flag
    'MISCOUNT',              -- Sai số đếm
    'THEFT',                 -- Mất cắp
    'SHRINKAGE',             -- Hao hụt tự nhiên
    'OTHER'                  -- Khác
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Thêm columns mới vào stock_takes
-- =============================================================================

-- Khoa XN: phân loại theo mảng nghiệp vụ
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS product_group TEXT
    CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE'));

-- Kỳ kiểm kê (luôn là tháng hiện tại hoặc tháng trước)
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS period_year INT CHECK (period_year BETWEEN 2020 AND 2100);
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS period_month INT CHECK (period_month BETWEEN 1 AND 12);

-- Thủ kho được chỉ định phụ trách (1 thủ kho kiểm 2 kho cùng mảng)
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- Lưu danh sách warehouses covered (cho dual scope)
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS warehouse_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

-- Tổng giá trị chênh lệch
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS total_estimated_value DECIMAL(15, 2) DEFAULT 0;

-- Số line có chênh lệch
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS total_discrepancies INT DEFAULT 0;

-- Audit: thông tin người tạo
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Index cho query
CREATE INDEX IF NOT EXISTS idx_stocktakes_period
  ON stock_takes(tenant_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_stocktakes_assigned
  ON stock_takes(tenant_id, assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stocktakes_product_group
  ON stock_takes(tenant_id, product_group)
  WHERE product_group IS NOT NULL;

-- UNIQUE: 1 stocktake / tenant / product_group / period (chỉ áp dụng khi status != CANCELLED)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktakes_period
  ON stock_takes(tenant_id, product_group, period_year, period_month)
  WHERE status != 'CANCELLED' AND product_group IS NOT NULL;

COMMENT ON COLUMN stock_takes.product_group IS 'Khoa XN: HOA_CHAT_SINH_PHAM hoặc VAT_TU_Y_TE';
COMMENT ON COLUMN stock_takes.assigned_to IS 'Thủ kho phụ trách (1 thủ kho kiểm 2 kho cùng mảng)';
COMMENT ON COLUMN stock_takes.warehouse_ids IS 'Danh sách warehouse_ids covered (1 hoặc 2 kho)';

-- =============================================================================
-- 3. Thêm columns mới vào stock_take_lines
-- =============================================================================

-- Discrepancy tracking
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS discrepancy DECIMAL(15, 3);                    -- = counted - system
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS discrepancy_value DECIMAL(15, 2);             -- Giá trị chênh lệch (|discrepancy| * unit_cost)
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS discrepancy_category stocktake_discrepancy_category;
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS discrepancy_reason TEXT;                       -- Mô tả chi tiết
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS line_status stocktake_line_status DEFAULT 'PENDING';

-- Adjustment history (audit trail)
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS adjustment_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Approve info
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id);
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Index
CREATE INDEX IF NOT EXISTS idx_stl_line_status
  ON stock_take_lines(stock_take_id, line_status);
CREATE INDEX IF NOT EXISTS idx_stl_discrepancy
  ON stock_take_lines(stock_take_id)
  WHERE line_status = 'DISCREPANCY';

COMMENT ON COLUMN stock_take_lines.discrepancy IS 'Chênh lệch = counted_qty - system_qty (NULL nếu chưa đếm)';
COMMENT ON COLUMN stock_take_lines.discrepancy_value IS 'Giá trị chênh lệch (|discrepancy| * unit_cost)';
COMMENT ON COLUMN stock_take_lines.line_status IS 'PENDING (chưa đếm) | COUNTED (khớp) | DISCREPANCY (lệch) | ADJUSTED (đã duyệt)';

-- =============================================================================
-- 4. Helper function: tạo monthly stocktake + snapshot từ lots
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_create_monthly_stocktake(
  p_tenant_id UUID,
  p_product_group TEXT,
  p_assigned_to UUID,
  p_warehouse_ids UUID[] DEFAULT NULL,
  p_period_year INT DEFAULT NULL,
  p_period_month INT DEFAULT NULL,
  p_stock_take_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_year INT;
  v_period_month INT;
  v_stock_take_id UUID;
  v_warehouse_ids UUID[];
  v_line_count INT := 0;
BEGIN
  -- Validate
  IF p_product_group NOT IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE') THEN
    RAISE EXCEPTION 'Invalid product_group: %', p_product_group;
  END IF;

  v_period_year := COALESCE(p_period_year, EXTRACT(year FROM CURRENT_DATE)::INT);
  v_period_month := COALESCE(p_period_month, EXTRACT(month FROM CURRENT_DATE)::INT);

  -- Nếu không truyền warehouse_ids, lấy tất cả warehouses thuộc product_group
  IF p_warehouse_ids IS NULL OR array_length(p_warehouse_ids, 1) IS NULL THEN
    SELECT array_agg(id) INTO v_warehouse_ids
    FROM warehouses
    WHERE tenant_id = p_tenant_id
      AND (
        (p_product_group = 'HOA_CHAT_SINH_PHAM' AND role IN ('BULK_HC_SP', 'DAILY_HC_SP'))
        OR (p_product_group = 'VAT_TU_Y_TE' AND role IN ('BULK_VTYT', 'DAILY_VTYT'))
      )
      AND status = 'ACTIVE';
  ELSE
    v_warehouse_ids := p_warehouse_ids;
  END IF;

  IF v_warehouse_ids IS NULL OR array_length(v_warehouse_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No warehouses found for tenant % product_group %', p_tenant_id, p_product_group;
  END IF;

  -- Idempotency: nếu đã có stocktake cho period này → trả về
  SELECT id INTO v_stock_take_id
  FROM stock_takes
  WHERE tenant_id = p_tenant_id
    AND product_group = p_product_group
    AND period_year = v_period_year
    AND period_month = v_period_month
    AND status != 'CANCELLED';

  IF v_stock_take_id IS NOT NULL THEN
    RETURN v_stock_take_id;  -- Trả về run hiện tại
  END IF;

  -- Tạo stocktake mới
  INSERT INTO stock_takes (
    tenant_id, branch_id, warehouse_id, stock_take_number,
    stock_take_date, status, notes,
    product_group, period_year, period_month,
    assigned_to, warehouse_ids,
    created_by
  ) VALUES (
    p_tenant_id,
    -- Lấy branch_id từ warehouse đầu tiên
    (SELECT branch_id FROM warehouses WHERE id = v_warehouse_ids[1]),
    v_warehouse_ids[1],  -- Primary warehouse (cho display)
    'ST-' || p_product_group || '-' || v_period_year || '-' || LPAD(v_period_month::TEXT, 2, '0') || '-' || substring(gen_random_uuid()::text, 1, 6),
    p_stock_take_date,
    'DRAFT',
    'Auto-created for Khoa XN monthly stock take',
    p_product_group, v_period_year, v_period_month,
    p_assigned_to, v_warehouse_ids,
    auth.uid()
  )
  RETURNING id INTO v_stock_take_id;

  -- Snapshot từ lots: tạo line cho mỗi (product, warehouse) có tồn kho > 0
  INSERT INTO stock_take_lines (
    tenant_id, stock_take_id, line_no, product_id, unit_id, location_id,
    product_name, unit_code, location_code, batch_no, serial_no,
    system_qty, unit_cost, line_status
  )
  SELECT
    p_tenant_id,
    v_stock_take_id,
    ROW_NUMBER() OVER (PARTITION BY l.product_id, l.warehouse_id ORDER BY l.expiration_date NULLS LAST, l.id),
    l.product_id,
    p.base_unit_id,
    NULL,  -- location_id (optional, dùng vị trí mặc định)
    p.name AS product_name,
    NULL,  -- unit_code (lookup nếu cần)
    NULL,  -- location_code
    l.lot_number AS batch_no,
    NULL,  -- serial_no
    l.quantity AS system_qty,
    p.cost_price AS unit_cost,
    'PENDING'::stocktake_line_status
  FROM lots l
  JOIN products p ON p.id = l.product_id
  WHERE l.tenant_id = p_tenant_id
    AND l.warehouse_id = ANY(v_warehouse_ids)
    AND l.status NOT IN ('DESTROYED', 'EXPIRED', 'QC_FAILED')
    AND p.product_group = p_product_group
    AND p.is_active = TRUE
  ORDER BY p.name, l.warehouse_id, l.expiration_date NULLS LAST;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RAISE NOTICE '[fn_create_monthly_stocktake] Created stocktake % with % lines', v_stock_take_id, v_line_count;

  RETURN v_stock_take_id;
END;
$$;

COMMENT ON FUNCTION fn_create_monthly_stocktake IS
  'Tạo DRAFT stocktake cho Khoa XN. Snapshot từ lots có tồn kho > 0 trong product_group. Idempotent theo (tenant, product_group, period).';

GRANT EXECUTE ON FUNCTION fn_create_monthly_stocktake TO authenticated, service_role;

-- =============================================================================
-- 5. Helper function: thủ kho update counted_qty + tính discrepancy
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_count_stocktake_line(
  p_line_id UUID,
  p_counted_qty DECIMAL(15, 3),
  p_user_id UUID
)
RETURNS TABLE(
  line_id UUID,
  discrepancy DECIMAL(15, 3),
  line_status stocktake_line_status
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_line RECORD;
  v_discrepancy DECIMAL(15, 3);
  v_line_status stocktake_line_status;
BEGIN
  SELECT * INTO v_line FROM stock_take_lines WHERE id = p_line_id;
  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Line % not found', p_line_id;
  END IF;

  v_discrepancy := p_counted_qty - COALESCE(v_line.system_qty, 0);

  IF v_discrepancy = 0 THEN
    v_line_status := 'COUNTED';
  ELSE
    v_line_status := 'DISCREPANCY';
  END IF;

  UPDATE stock_take_lines
  SET
    counted_qty = p_counted_qty,
    discrepancy = v_discrepancy,
    discrepancy_value = ABS(v_discrepancy) * COALESCE(unit_cost, 0),
    line_status = v_line_status,
    adjustment_history = adjustment_history || jsonb_build_object(
      'by', p_user_id,
      'from', system_qty,
      'to', p_counted_qty,
      'discrepancy', v_discrepancy,
      'at', now()
    )::jsonb,
    updated_at = now()
  WHERE id = p_line_id;

  RETURN QUERY SELECT p_line_id, v_discrepancy, v_line_status;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_count_stocktake_line TO authenticated;

COMMENT ON FUNCTION fn_count_stocktake_line IS
  'Thủ kho nhập số đếm. Tự động tính discrepancy + set line_status.';

-- =============================================================================
-- 6. Helper function: thủ kho nhập lý do chênh lệch (bắt buộc nếu discrepancy != 0)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_set_stocktake_line_reason(
  p_line_id UUID,
  p_category stocktake_discrepancy_category,
  p_reason TEXT,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_line RECORD;
BEGIN
  SELECT * INTO v_line FROM stock_take_lines WHERE id = p_line_id;
  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Line % not found', p_line_id;
  END IF;

  IF v_line.line_status != 'DISCREPANCY' THEN
    RAISE EXCEPTION 'Line không có chênh lệch, không cần nhập lý do';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Lý do phải có ít nhất 10 ký tự';
  END IF;

  UPDATE stock_take_lines
  SET
    discrepancy_category = p_category,
    discrepancy_reason = p_reason,
    adjustment_history = adjustment_history || jsonb_build_object(
      'by', p_user_id,
      'category', p_category,
      'reason', p_reason,
      'at', now()
    )::jsonb
  WHERE id = p_line_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_set_stocktake_line_reason TO authenticated;

-- =============================================================================
-- 7. Helper function: Trưởng khoa duyệt line → tạo StockMovement + update lot
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_approve_stocktake_line(
  p_line_id UUID,
  p_user_id UUID
)
RETURNS UUID  -- ID của StockMovement tạo ra
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_line RECORD;
  v_stock_take RECORD;
  v_movement_id UUID;
  v_user_role TEXT;
BEGIN
  -- Permission check
  IF NOT fn_user_is_admin_or_head() THEN
    RAISE EXCEPTION 'Permission denied: chỉ DEPT_HEAD hoặc ADMIN mới được approve';
  END IF;

  SELECT * INTO v_line FROM stock_take_lines WHERE id = p_line_id;
  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Line % not found', p_line_id;
  END IF;

  IF v_line.line_status NOT IN ('DISCREPANCY', 'COUNTED') THEN
    RAISE EXCEPTION 'Line ở trạng thái %, không thể approve', v_line.line_status;
  END IF;

  IF v_line.line_status = 'DISCREPANCY' AND (v_line.discrepancy_category IS NULL OR v_line.discrepancy_reason IS NULL) THEN
    RAISE EXCEPTION 'Line có chênh lệch nhưng chưa nhập lý do (bắt buộc)';
  END IF;

  SELECT * INTO v_stock_take FROM stock_takes WHERE id = v_line.stock_take_id;

  -- Nếu có chênh lệch, tạo StockMovement điều chỉnh
  IF v_line.discrepancy != 0 THEN
    -- Lấy lot_id đầu tiên của product này trong warehouse (giả định 1:1)
    DECLARE
      v_lot_id UUID;
      v_warehouse_id UUID;
    BEGIN
      -- Lấy warehouse_id từ stocktake
      v_warehouse_id := v_stock_take.warehouse_id;

      -- Tìm lot tương ứng (cùng product, cùng warehouse, status APPROVED, có tồn)
      SELECT id INTO v_lot_id
      FROM lots
      WHERE product_id = v_line.product_id
        AND warehouse_id = v_warehouse_id
        AND status = 'APPROVED'
        AND quantity > 0
      ORDER BY expiration_date ASC NULLS LAST
      LIMIT 1;

      IF v_lot_id IS NOT NULL THEN
        -- Tạo StockMovement
        INSERT INTO stock_movements (
          tenant_id, product_id, warehouse_id, lot_id,
          movement_type, quantity, unit_cost, movement_date,
          reference_type, reference_id, notes, created_by
        ) VALUES (
          v_line.tenant_id, v_line.product_id, v_warehouse_id, v_lot_id,
          CASE WHEN v_line.discrepancy > 0 THEN 'ADJUST_IN' ELSE 'ADJUST_OUT' END,
          ABS(v_line.discrepancy),
          v_line.unit_cost,
          now(),
          'STOCKTAKE', v_line.stock_take_id,
          format('Stocktake adjustment: %s (reason: %s)',
            v_line.discrepancy, COALESCE(v_line.discrepancy_reason, 'N/A')),
          p_user_id
        )
        RETURNING id INTO v_movement_id;

        -- Update lot.quantity
        UPDATE lots
        SET quantity = GREATEST(0, quantity + v_line.discrepancy),
            updated_at = now()
        WHERE id = v_lot_id;

        -- Update stock table (nếu có)
        -- (Phase 1 có sẵn view stock - không cần update)
      END IF;
    END;
  END IF;

  -- Update line status
  UPDATE stock_take_lines
  SET
    line_status = 'ADJUSTED'::stocktake_line_status,
    approved_by = p_user_id,
    approved_at = now(),
    adjust_movement_id = v_movement_id,
    updated_at = now()
  WHERE id = p_line_id;

  -- Update stocktake totals
  UPDATE stock_takes st
  SET
    total_discrepancies = (
      SELECT COUNT(*) FROM stock_take_lines
      WHERE stock_take_id = st.id AND line_status = 'DISCREPANCY'
    ),
    total_estimated_value = COALESCE((
      SELECT SUM(discrepancy_value) FROM stock_take_lines
      WHERE stock_take_id = st.id
    ), 0),
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM stock_take_lines
        WHERE stock_take_id = st.id AND line_status NOT IN ('ADJUSTED', 'SKIPPED')
      ) THEN 'COUNTED'  -- Tất cả line đã xử lý
      ELSE st.status
    END
  WHERE st.id = v_line.stock_take_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_approve_stocktake_line TO authenticated;

COMMENT ON FUNCTION fn_approve_stocktake_line IS
  'Trưởng khoa/Admin duyệt line. Tự động tạo StockMovement nếu có chênh lệch + update lot.quantity.';

-- =============================================================================
-- 8. RLS Update (thêm product_group filter)
-- =============================================================================

-- Drop old stocktakes/stock_take_lines policies đã có và thêm mới
DO $$ BEGIN
  -- Thủ kho thấy stocktake theo product_group
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'stock_takes' AND policyname = 'stocktakes_khoaxn_select'
  ) THEN
    CREATE POLICY stocktakes_khoaxn_select ON stock_takes FOR SELECT
      USING (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
        -- Backward compat: stocktake cũ không có product_group
        OR (product_group IS NULL)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'stock_takes' AND policyname = 'stocktakes_khoaxn_insert'
  ) THEN
    CREATE POLICY stocktakes_khoaxn_insert ON stock_takes FOR INSERT
      WITH CHECK (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'stock_takes' AND policyname = 'stocktakes_khoaxn_update'
  ) THEN
    CREATE POLICY stocktakes_khoaxn_update ON stock_takes FOR UPDATE
      USING (
        product_group = ANY(fn_user_product_groups())
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- stock_take_lines: kế thừa parent policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'stock_take_lines' AND policyname = 'stl_khoaxn_parent'
  ) THEN
    CREATE POLICY stl_khoaxn_parent ON stock_take_lines FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM stock_takes st
          WHERE st.id = stock_take_lines.stock_take_id
            AND (st.product_group = ANY(fn_user_product_groups()) OR fn_user_is_admin_or_head() OR st.product_group IS NULL)
        )
      );
  END IF;
END $$;
