# SPEC #9: Audit Log Viewer — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: #7 (P0)
> **Liên quan**: Tuân thủ TT 54/2017/BYT Điều 14

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
**Audit tự động tất cả thao tác** INSERT/UPDATE/DELETE trên các bảng nghiệp vụ, cung cấp giao diện tra cứu cho DEPT_HEAD và Admin. Lưu trữ 5 năm theo TT54/BYT.

### 1.2. Phạm vi
- **Trong scope**:
  - Trigger tự động ghi log mọi thay đổi
  - UI tra cứu với filter (user, bảng, thời gian, loại thao tác)
  - Xuất Excel/PDF cho kiểm tra
  - Lưu trữ 5 năm, archive sau 5 năm
- **Ngoài scope**:
  - Audit log cho authentication (Supabase Auth đã có)
  - Real-time alert cho thao tác bất thường (vd: thủ kho xóa nhiều records)

---

## 2. ACTORS

| Actor | Quyền |
|---|---|
| **DEPT_HEAD** | Xem tất cả audit log trong khoa |
| **Admin** | Xem tất cả, xuất báo cáo |
| **Thủ kho** | Xem audit log của riêng mình (read-only) |

---

## 3. WORKFLOW

```
[User thực hiện thao tác: INSERT/UPDATE/DELETE]
        ↓
[Trigger] Tự động ghi vào audit_logs:
  - table_name, record_id
  - operation (INSERT/UPDATE/DELETE)
  - old_data, new_data (JSONB)
  - changed_by, changed_at
  - ip_address, user_agent (nếu có)
  - tenant_id
        ↓
[DEPT_HEAD/Admin] Tra cứu qua UI
        ↓
[Xuất Excel/PDF] Cho kiểm tra nội bộ hoặc cơ quan quản lý
```

---

## 4. LOGIC

### 4.1. Audit tất cả thao tác (đã chốt)
- Trigger trên: products, lots, stock_movements, stocktakes, contracts, weekly_replenishment_*, monthly_replenishment_*, recall_*, disposal_*, fefo_override_log, user_warehouse_roles, user_global_roles
- Lưu `old_data` và `new_data` dạng JSONB (dễ diff)

### 4.2. Phân loại audit
- **READ** (SELECT) — KHÔNG log (quá nhiều)
- **INSERT** — log new_data
- **UPDATE** — log old_data + new_data (cho phép diff)
- **DELETE** — log old_data

### 4.3. Edge cases
| Tình huống | Xử lý |
|---|---|
| Trigger fail → rollback operation | Bắt buộc, log lỗi |
| Cùng 1 user thao tác 1000 lần trong 1 phút | Vẫn log hết (dung lượng lớn) |
| Bulk update (vd: FEFO override 100 lô) | Log từng lô riêng |
| Xóa lô có cascade (vd: xóa product → xóa lots) | Log riêng cho mỗi bảng |
| IP/UA tracking | Lấy từ Supabase Edge Function context |

---

## 5. SCHEMA

```sql
-- ============================================================
-- MODULE #7: AUDIT LOG VIEWER
-- File: supabase/migrations/20260614_audit_log.sql
-- ============================================================

CREATE TYPE audit_operation AS ENUM ('INSERT', 'UPDATE', 'DELETE');

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Context
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation audit_operation NOT NULL,

  -- Data
  old_data JSONB,                          -- NULL nếu INSERT
  new_data JSONB,                          -- NULL nếu DELETE
  changed_fields TEXT[],                   -- Cho UPDATE: danh sách cột thay đổi

  -- User context
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),

  -- Request context (từ Edge Function)
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,      -- VD: reason, batch_id

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, changed_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(changed_by, changed_at DESC);
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id, changed_at DESC);
CREATE INDEX idx_audit_operation ON audit_logs(tenant_id, operation, changed_at DESC);

-- Partition by year (cho 5 năm lưu trữ)
-- (Production: dùng native partitioning để tối ưu)

-- Generic trigger function
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_changed TEXT[];
  v_key TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_old := to_jsonb(OLD);
    INSERT INTO audit_logs (tenant_id, table_name, record_id, operation, old_data, changed_by)
    VALUES (
      (v_old ->> 'tenant_id')::UUID,
      TG_TABLE_NAME,
      (v_old ->> 'id')::UUID,
      'DELETE',
      v_old,
      auth.uid()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Tính changed_fields
    v_changed := ARRAY[]::TEXT[];
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;
    -- Chỉ log nếu có thay đổi
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO audit_logs (tenant_id, table_name, record_id, operation, old_data, new_data, changed_fields, changed_by)
      VALUES (
        (v_new ->> 'tenant_id')::UUID,
        TG_TABLE_NAME,
        (v_new ->> 'id')::UUID,
        'UPDATE',
        v_old, v_new, v_changed,
        auth.uid()
      );
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new := to_jsonb(NEW);
    INSERT INTO audit_logs (tenant_id, table_name, record_id, operation, new_data, changed_by)
    VALUES (
      (v_new ->> 'tenant_id')::UUID,
      TG_TABLE_NAME,
      (v_new ->> 'id')::UUID,
      'INSERT',
      v_new,
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Apply trigger cho tất cả bảng nghiệp vụ
-- (Ví dụ)
CREATE TRIGGER trg_audit_lots AFTER INSERT OR UPDATE OR DELETE ON lots
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_contracts AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- (Apply cho các bảng còn lại: stocktakes, stock_movements, weekly_replenishment_*, monthly_replenishment_*, recall_*, disposal_*, fefo_override_log, user_warehouse_roles, user_global_roles)

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_audit_admin" ON audit_logs
  FOR SELECT USING ((auth.jwt() ->> 'role') IN ('ADMIN', 'DEPT_HEAD'));

CREATE POLICY "rls_audit_self" ON audit_logs
  FOR SELECT USING (changed_by = auth.uid());

-- Cron: archive logs > 5 năm (chuyển sang bảng audit_logs_archive)
-- Chạy ngày 1/1 hàng năm

COMMENT ON TABLE audit_logs IS 'Audit log tự động - 5 năm theo TT54/BYT';
```

---

## 6. API + UI

### API
- `useAuditLogs(params: { tableName?; recordId?; userId?; operation?; dateFrom?; dateTo?; limit? })`
- `useAuditLogDiff(logId)` — lấy old vs new để hiển thị diff
- `useExportAuditLogs(params, format: 'excel' | 'pdf')`

### UI
- `/audit-logs` — danh sách với filter
- `/audit-logs/[id]` — chi tiết 1 log + diff
- Xuất Excel/PDF theo filter

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Audit Log                                                     │
│  Bảng: [Tất cả ▼]  User: [_____]  Thao tác: [Tất cả ▼]            │
│  Từ: [__/__/__]  Đến: [__/__/__]  [🔍 Tìm]                     │
│                                                                  │
│  ┌─── Kết quả ──────────────────────────────────────────────┐  │
│  │ Thời gian        │ User       │ Bảng    │ Thao tác │ Record│  │
│  │──────────────────┼────────────┼─────────┼──────────┼───────│  │
│  │ 14/06 14:30:15  │ Nguyễn A   │ lots    │ UPDATE   │ L001  │  │
│  │ 14/06 14:28:42  │ System     │ lots    │ INSERT   │ L100  │  │
│  │ 14/06 14:25:10  │ Trần B     │products │ UPDATE   │ HO-001│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [📥 Xuất Excel]  [📄 Xuất PDF]                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Modal diff

```
┌─────────────────────────────────────────────────┐
│  📋 Chi tiết thay đổi — Lot L001                 │
│  ─────────────────────────────────────────────  │
│  User: Nguyễn A | 14/06 14:30:15 | IP: 192...   │
│                                                  │
│  ┌─── Field ──┬─── Cũ ───┬─── Mới ───┐        │
│  │ quantity   │ 50       │ 48        │ 🔴     │
│  │ updated_at │ 14/06 14:25│ 14/06 14:30│      │
│  │ status     │ APPROVED │ IN_USE    │ 🟡     │
│  └────────────┴──────────┴───────────┘        │
│                                                  │
│  [💾 Đóng]                                       │
└─────────────────────────────────────────────────┘
```

---

## 7. Edge cases + Acceptance

| Tình huống | Xử lý |
|---|---|
| Trigger fail | Bắt buộc, log lỗi |
| Bulk update | Log từng record |
| 5 năm lưu trữ | Cron archive |
| Thủ kho xem audit của mình | OK (read-only) |
| Thủ kho xem audit của người khác | 403 |

- [ ] **AC-1**: Auto audit tất cả bảng nghiệp vụ
- [ ] **AC-2**: UI tra cứu + filter
- [ ] **AC-3**: Diff old vs new rõ ràng
- [ ] **AC-4**: Xuất Excel/PDF
- [ ] **AC-5**: Lưu trữ 5 năm + archive
- [ ] **AC-6**: RLS đúng (DEPT_HEAD/Admin xem tất cả, thủ kho xem của mình)

---

## Effort: 1.5 tuần**

- Schema + trigger: 0.5 tuần
- UI + API: 1 tuần

**Phụ thuộc**: Tất cả modules (audit log cho tất cả)

**Câu hỏi mở**:
- Real-time alert cho thao tác bất thường?
- Tích hợp với SIEM (Security Information & Event Management)?

---

**Người viết**: Claude | **Ngày**: 2026-06-14 | **Trạng thái**: ⏸️ CHỜ USER REVIEW
