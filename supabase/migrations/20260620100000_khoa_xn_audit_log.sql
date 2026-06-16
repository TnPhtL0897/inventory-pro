-- =============================================================================
-- Khoa XN — Module 7: Audit Log Viewer
-- File: supabase/migrations/20260620100000_khoa_xn_audit_log.sql
--
-- Trigger tự động ghi log mọi INSERT/UPDATE/DELETE trên các bảng nghiệp vụ.
-- Lưu trữ 5 năm theo TT 54/2017/BYT.
-- =============================================================================

-- =============================================================================
-- 1. ENUM audit_operation
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE audit_operation AS ENUM ('INSERT', 'UPDATE', 'DELETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. Bảng AUDIT_LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Context
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation audit_operation NOT NULL,

  -- Data
  old_data JSONB,                            -- NULL nếu INSERT
  new_data JSONB,                            -- NULL nếu DELETE
  changed_fields TEXT[],                     -- Chỉ áp dụng UPDATE (vd: ['status', 'quantity'])

  -- User
  changed_by UUID REFERENCES auth.users(id),
  changed_by_email TEXT,
  changed_by_role TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,                           -- Correlation ID

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes cho query thường gặp
CREATE INDEX IF NOT EXISTS idx_audit_tenant_date
  ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table
  ON audit_logs(tenant_id, table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_logs(tenant_id, changed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record
  ON audit_logs(tenant_id, table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operation
  ON audit_logs(tenant_id, operation, created_at DESC);

-- Partition theo năm (optional, để tăng tốc query archive cũ)
-- Tạm thời không partition để giữ đơn giản

COMMENT ON TABLE audit_logs IS
  'Khoa XN: audit log tất cả thao tác INSERT/UPDATE/DELETE trên bảng nghiệp vụ. Lưu 5 năm theo TT54.';

-- =============================================================================
-- 3. RLS
-- =============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: thấy log của tenant mình
DROP POLICY IF EXISTS audit_tenant_isolation ON audit_logs;
CREATE POLICY audit_tenant_isolation ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

-- Service role bypass
DROP POLICY IF EXISTS audit_service_role ON audit_logs;
CREATE POLICY audit_service_role ON audit_logs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT ALL ON audit_logs TO authenticated, service_role;

-- =============================================================================
-- 4. Function ghi log (dùng chung cho triggers)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_changed_fields TEXT[];
  v_record_id UUID;
  v_op audit_operation;
BEGIN
  v_user_id := auth.uid();

  -- Resolve tenant_id dựa vào bảng
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data := to_jsonb(OLD);
    v_tenant_id := (to_jsonb(OLD) ->> 'tenant_id')::UUID;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_tenant_id := COALESCE(
      (to_jsonb(NEW) ->> 'tenant_id')::UUID,
      (to_jsonb(OLD) ->> 'tenant_id')::UUID
    );

    -- Tính changed_fields (so sánh từng key)
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM jsonb_each(v_old_data)
    WHERE v_old_data ->> key IS DISTINCT FROM v_new_data ->> key;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_new_data := to_jsonb(NEW);
    v_tenant_id := (to_jsonb(NEW) ->> 'tenant_id')::UUID;
  END IF;

  v_op := TG_OP::audit_operation;

  -- Lấy email + role của user
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    SELECT array_to_string(role_codes, ',') INTO v_user_role
    FROM user_role_assignments WHERE user_id = v_user_id LIMIT 1;
  END IF;

  -- Ghi log
  INSERT INTO audit_logs (
    tenant_id, table_name, record_id, operation,
    old_data, new_data, changed_fields,
    changed_by, changed_by_email, changed_by_role
  ) VALUES (
    v_tenant_id, TG_TABLE_NAME, v_record_id, v_op,
    v_old_data, v_new_data, v_changed_fields,
    v_user_id, v_user_email, v_user_role
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_write_audit_log IS
  'Generic trigger function: ghi log mọi INSERT/UPDATE/DELETE vào audit_logs. Tự động resolve tenant_id từ OLD/NEW.';

-- =============================================================================
-- 5. Gắn trigger lên các bảng nghiệp vụ chính
-- =============================================================================

-- Bảng đã có sẵn từ các module trước:
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'products',
    'lots',
    'stock_movements',
    'stocktakes',
    'bid_contracts',
    'bid_lots',
    'purchase_requests',
    'goods_receipts',
    'stock_issues',
    'stock_transfers',
    'fefo_audit_log',
    'user_warehouse_roles',
    'user_global_roles'
  ];
  v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY v_tables
  LOOP
    -- Insert trigger
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_audit_insert_%I ON %I;
      CREATE TRIGGER trg_audit_insert_%I
        AFTER INSERT ON %I
        FOR EACH ROW
        EXECUTE FUNCTION fn_write_audit_log();
    ', v_t, v_t, v_t, v_t);

    -- Update trigger
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_audit_update_%I ON %I;
      CREATE TRIGGER trg_audit_update_%I
        AFTER UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION fn_write_audit_log();
    ', v_t, v_t, v_t, v_t);

    -- Delete trigger
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_audit_delete_%I ON %I;
      CREATE TRIGGER trg_audit_delete_%I
        AFTER DELETE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION fn_write_audit_log();
    ', v_t, v_t, v_t, v_t);
  END LOOP;
END $$;

-- =============================================================================
-- 6. Function query audit log với filter (cho UI)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_query_audit_log(
  p_table_name TEXT DEFAULT NULL,
  p_operation audit_operation DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  table_name TEXT,
  record_id UUID,
  operation audit_operation,
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  changed_by UUID,
  changed_by_email TEXT,
  changed_by_role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  RETURN QUERY
  SELECT
    al.id, al.table_name, al.record_id, al.operation,
    al.old_data, al.new_data, al.changed_fields,
    al.changed_by, al.changed_by_email, al.changed_by_role,
    al.created_at
  FROM audit_logs al
  WHERE al.tenant_id = current_setting('app.tenant_id', TRUE)::uuid
    AND (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_operation IS NULL OR al.operation = p_operation)
    AND (p_user_id IS NULL OR al.changed_by = p_user_id)
    AND (p_from_date IS NULL OR al.created_at >= p_from_date)
    AND (p_to_date IS NULL OR al.created_at < p_to_date + INTERVAL '1 day')
  ORDER BY al.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_query_audit_log(
  TEXT, audit_operation, UUID, DATE, DATE, INT, INT
) TO authenticated, service_role;

COMMENT ON FUNCTION fn_query_audit_log IS
  'Query audit log với filter (table, operation, user, date range) + pagination. Dùng cho UI viewer.';

-- =============================================================================
-- 7. Cleanup function (archive sau 5 năm)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_archive_old_audit_logs(p_retention_years INT DEFAULT 5)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_cutoff_date TIMESTAMPTZ := now() - (p_retention_years || ' years')::INTERVAL;
BEGIN
  -- Xóa log cũ hơn retention period
  DELETE FROM audit_logs WHERE created_at < v_cutoff_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_archive_old_audit_logs(INT) TO service_role;

COMMENT ON FUNCTION fn_archive_old_audit_logs IS
  'Cron hàng năm: xóa audit log cũ hơn N năm (mặc định 5 năm theo TT54). Trả về số records đã xóa.';
