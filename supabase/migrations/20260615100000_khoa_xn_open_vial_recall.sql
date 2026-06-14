-- =============================================================================
-- Khoa XN — Module 2: Open-vial history + Recall
-- File: supabase/migrations/20260615100000_khoa_xn_open_vial_recall.sql
-- =============================================================================

-- =============================================================================
-- 1. Bảng OPEN_VIAL_HISTORY (lịch sử mở nắp - 1 lô có thể mở nhiều lần)
-- =============================================================================

CREATE TABLE IF NOT EXISTS open_vial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  -- Thời điểm + người mở
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID NOT NULL REFERENCES auth.users(id),

  -- Volume
  quantity_before DECIMAL(15, 3) NOT NULL,         -- Trước khi mở/lấy
  quantity_taken DECIMAL(15, 3) NOT NULL DEFAULT 0,
  quantity_after DECIMAL(15, 3) NOT NULL,         -- Còn lại

  -- Open-vial expiration (tính từ product config)
  open_vial_stability_days INT NOT NULL,
  open_vial_expiration_date DATE NOT NULL,

  -- In nhãn
  label_printed BOOLEAN NOT NULL DEFAULT FALSE,
  label_printed_at TIMESTAMPTZ,

  -- Ghi chú
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ovh_lot ON open_vial_history(lot_id);
CREATE INDEX IF NOT EXISTS idx_ovh_opened_at ON open_vial_history(tenant_id, opened_at DESC);

COMMENT ON TABLE open_vial_history IS 'Khoa XN: lịch sử mở nắp lô (1 lô có thể mở nhiều lần)';
COMMENT ON COLUMN open_vial_history.quantity_after IS 'Volume còn lại sau khi mở/lấy';
COMMENT ON COLUMN open_vial_history.open_vial_expiration_date IS 'Tính = opened_at + open_vial_stability_days';

-- =============================================================================
-- 2. Bảng OPEN_VIAL_PRINT_QUEUE (hàng đợi in nhãn)
-- =============================================================================

CREATE TABLE IF NOT EXISTS open_vial_print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  open_vial_history_id UUID NOT NULL REFERENCES open_vial_history(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PRINTED', 'FAILED')),
  printed_at TIMESTAMPTZ,
  printed_by UUID REFERENCES auth.users(id),
  printer_id TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ovpq_status ON open_vial_print_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ovpq_tenant_pending
  ON open_vial_print_queue(tenant_id)
  WHERE status = 'PENDING';

COMMENT ON TABLE open_vial_print_queue IS 'Hàng đợi in nhãn open-vial (sẽ tích hợp máy in sau)';

-- =============================================================================
-- 3. Bảng RECALL_NOTICES
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE recall_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recall_status AS ENUM ('ACTIVE', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE recall_action_type AS ENUM (
    'RETURN_TO_SUPPLIER',
    'DESTROY',
    'INVESTIGATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS recall_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Thông tin recall
  recall_number TEXT NOT NULL,                    -- Số recall từ NCC
  supplier_name TEXT NOT NULL,
  product_names TEXT[] NOT NULL DEFAULT '{}',

  -- Lý do + mức độ
  reason TEXT NOT NULL,
  severity recall_severity NOT NULL DEFAULT 'MEDIUM',
  recall_date DATE NOT NULL,
  action_taken_by_supplier TEXT,

  -- Lot numbers bị ảnh hưởng (cache để dễ query)
  -- Có thể normalize thành bảng riêng nếu cần
  affected_lot_numbers TEXT[] NOT NULL DEFAULT '{}',

  -- Trạng thái
  status recall_status NOT NULL DEFAULT 'ACTIVE',
  resolved_at TIMESTAMPTZ,

  -- Người tạo
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recall_tenant_status ON recall_notices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_recall_date ON recall_notices(tenant_id, recall_date DESC);
CREATE INDEX IF NOT EXISTS idx_recall_lots_gin ON recall_notices USING GIN (affected_lot_numbers);

DROP TRIGGER IF EXISTS trg_recall_updated_at ON recall_notices;
CREATE TRIGGER trg_recall_updated_at
  BEFORE UPDATE ON recall_notices
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

-- FK từ lots.recall_notice_id
ALTER TABLE lots
  DROP CONSTRAINT IF EXISTS fk_lots_recall;
ALTER TABLE lots
  ADD CONSTRAINT fk_lots_recall
  FOREIGN KEY (recall_notice_id) REFERENCES recall_notices(id) ON DELETE SET NULL;

COMMENT ON TABLE recall_notices IS 'Khoa XN: thông báo recall từ nhà cung cấp (DEPT_HEAD/Admin tạo)';

-- =============================================================================
-- 4. Bảng RECALL_LOT_ACTIONS (hành động xử lý cho từng lô bị recall)
-- =============================================================================

CREATE TABLE IF NOT EXISTS recall_lot_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recall_notice_id UUID NOT NULL REFERENCES recall_notices(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  -- Trạng thái kiểm tra vật lý
  still_in_stock BOOLEAN,
  already_used BOOLEAN,
  usage_notes TEXT,

  -- Hành động quyết định
  action recall_action_type NOT NULL,
  action_notes TEXT,

  -- Reference đến documents phát sinh
  disposal_request_id UUID,                       -- FK tạo ở migration disposal
  return_document_id UUID,
  investigation_task_id UUID,

  -- Người xử lý
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rla_recall ON recall_lot_actions(recall_notice_id);
CREATE INDEX IF NOT EXISTS idx_rla_lot ON recall_lot_actions(lot_id);
CREATE INDEX IF NOT EXISTS idx_rla_action ON recall_lot_actions(tenant_id, action);

COMMENT ON TABLE recall_lot_actions IS 'Khoa XN: hành động xử lý cho từng lô bị recall (trả NCC/hủy/điều tra)';

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE open_vial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_vial_print_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_lot_actions ENABLE ROW LEVEL SECURITY;

-- open_vial_history: thủ kho HC-SP thấy (chỉ HC-SP mới có open-vial)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'open_vial_history' AND policyname = 'ovh_hc_sp_only'
  ) THEN
    CREATE POLICY ovh_hc_sp_only ON open_vial_history FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM lots l
          JOIN products p ON p.id = l.product_id
          WHERE l.id = open_vial_history.lot_id
            AND p.product_group = 'HOA_CHAT_SINH_PHAM'
        )
        OR fn_user_is_admin_or_head()
      );
  END IF;
END $$;

-- open_vial_print_queue: thủ kho + admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'open_vial_print_queue' AND policyname = 'ovpq_select'
  ) THEN
    CREATE POLICY ovpq_select ON open_vial_print_queue FOR SELECT
      USING (true);
  END IF;
END $$;

-- recall_notices: tất cả user trong tenant đều thấy (cảnh báo)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'recall_notices' AND policyname = 'recall_tenant_view'
  ) THEN
    CREATE POLICY recall_tenant_view ON recall_notices FOR SELECT
      USING (tenant_id = auth_tenant_id());
  END IF;
END $$;

-- recall INSERT/UPDATE: chỉ DEPT_HEAD/ADMIN
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'recall_notices' AND policyname = 'recall_admin_write'
  ) THEN
    CREATE POLICY recall_admin_write ON recall_notices FOR ALL
      USING (fn_user_is_admin_or_head())
      WITH CHECK (fn_user_is_admin_or_head());
  END IF;
END $$;

-- recall_lot_actions: thủ kho + DEPT_HEAD
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'recall_lot_actions' AND policyname = 'rla_all'
  ) THEN
    CREATE POLICY rla_all ON recall_lot_actions FOR ALL
      USING (
        tenant_id = auth_tenant_id()
        AND (
          fn_user_is_admin_or_head()
          OR EXISTS (
            SELECT 1 FROM lots l
            JOIN products p ON p.id = l.product_id
            WHERE l.id = recall_lot_actions.lot_id
              AND p.product_group = ANY(fn_user_product_groups())
          )
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 6. Trigger: tự động update lots khi insert open_vial_history
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_update_lot_on_open_vial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_stability INT;
BEGIN
  -- Lấy product.open_vial_stability_days
  SELECT p.open_vial_stability_days
  INTO v_product_stability
  FROM lots l
  JOIN products p ON p.id = l.product_id
  WHERE l.id = NEW.lot_id;

  -- Nếu product chưa cấu hình → dùng giá trị user nhập
  IF v_product_stability IS NULL THEN
    v_product_stability := NEW.open_vial_stability_days;
  END IF;

  -- Update lots
  UPDATE lots
  SET
    open_vial_opened_at = NEW.opened_at,
    open_vial_opened_by = NEW.opened_by,
    open_vial_quantity_remaining = NEW.quantity_after,
    open_vial_expiration_date = NEW.open_vial_expiration_date,
    open_vial_stability_days = v_product_stability,
    open_vial_count = COALESCE(open_vial_count, 0) + 1,
    status = CASE
      WHEN NEW.quantity_after = 0 THEN 'DEPLETED'::lot_status
      WHEN status IN ('APPROVED', 'QUARANTINE', 'PENDING_QC') THEN 'IN_USE'::lot_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.lot_id;

  -- Thêm vào print queue
  INSERT INTO open_vial_print_queue (tenant_id, open_vial_history_id)
  VALUES (NEW.tenant_id, NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ovh_insert ON open_vial_history;
CREATE TRIGGER trg_ovh_insert
  AFTER INSERT ON open_vial_history
  FOR EACH ROW EXECUTE FUNCTION trg_update_lot_on_open_vial();
