# Hướng dẫn Test Module 2 trên Supabase Dashboard

> **Ngày**: 2026-06-14
> **Scope**: Test 5 SQL migrations + 2 edge functions + 9 test scenarios cho Khoa XN Module 2

## ⚠️ Lý do không tự động chạy được

Em không có `SUPABASE_DB_CONNECTION` (file `.supabase-credentials` được gitignore) để chạy migrations qua `psql` hoặc Python. Cũng không có MCP Supabase trong session này.

**Cách nhanh nhất**: Bác copy file SQL + paste vào Supabase SQL Editor.

---

## Bước 1: Apply 5 SQL migrations (theo thứ tự)

Vào **Supabase Dashboard → SQL Editor** cho project `ituyoplyuhbdxkhabcpy`:
https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/sql/new

Chạy lần lượt 5 file migration theo thứ tự (copy nội dung file → paste vào editor → Run):

### 1.1. `20260615090000_khoa_xn_lots.sql` (Lots + QC)
- Tạo bảng `lots` (10 trạng thái), `lot_qc_records`
- Function `fn_check_lot_needs_qc_retest`
- 5 RLS policies
- **Expected**: Thấy "Success. No rows returned" + có thể check `SELECT * FROM lots LIMIT 0;` (sẽ thấy 0 rows, nhưng bảng tồn tại)

### 1.2. `20260615100000_khoa_xn_open_vial_recall.sql` (Open-vial + Recall)
- Tạo bảng `open_vial_history`, `open_vial_print_queue`, `recall_notices`, `recall_lot_actions`
- Trigger `trg_update_lot_on_open_vial`
- 7 RLS policies

### 1.3. `20260615110000_khoa_xn_disposal_alerts.sql` (Disposal + Alerts)
- Tạo bảng `disposal_requests`, `disposal_request_lines`, `lot_alerts`
- 9 RLS policies (đã fix Issue #11, #12)

### 1.4. `20260615120000_khoa_xn_lot_functions.sql` (Functions)
- 4 functions: `fn_check_lot_expirations`, `fn_auto_expire_lots`, `fn_apply_recall_to_lots`, `fn_complete_lot_qc`
- Trigger `trg_recall_apply`
- **Đã fix**: Issue #1, #2, #3 (idempotency, role check, SECURITY DEFINER)

### 1.5. `20260615130000_khoa_xn_cron_schedules.sql` (Cron)
- Setup pg_cron schedules
- **CẦN set `service_role_key` trước** (xem Bước 3)

---

## Bước 2: Chạy Test Scenarios

Sau khi 5 migrations OK, chạy file test:
`20260615999999_khoa_xn_lot_test_scenarios.sql`

**Expected output** (9 TC PASS):
```
TC-1 PASS: Tạo lô HC-SP → PENDING_QC
TC-2 PASS: Tạo lô VTYT → APPROVED (auto)
TC-3 PASS: Sau QC PASS → APPROVED
TC-4 PASS: Open-vial tracking OK
TC-5: fn_check_lot_expirations trả về alerts OK
TC-6 PASS: Auto EXPIRED + tạo DisposalRequest
TC-7 PASS: Idempotency OK
TC-8 PASS: Auto BLOCK lots khi recall
TC-9 PASS: QC lại open-vial OK
========================================
ALL TEST SCENARIOS PASSED!
========================================
```

### Verify trong SQL Editor (sau khi test chạy):

```sql
-- Check lots đã tạo
SELECT lot_number, status, expiration_date
FROM lots
WHERE lot_number LIKE 'TEST-%'
ORDER BY lot_number;

-- Check disposal requests
SELECT request_number, status, auto_generated, total_estimated_value
FROM disposal_requests
WHERE request_number LIKE 'DR-EXP-%'
ORDER BY created_at DESC;

-- Check recall notice
SELECT recall_number, status, affected_lot_numbers
FROM recall_notices
WHERE recall_number = 'TEST-REC-001';

-- Check lots bị BLOCK
SELECT lot_number, status, recall_notice_id
FROM lots
WHERE lot_number LIKE 'TEST-%' AND status = 'BLOCKED';

-- Check lot alerts
SELECT alert_type, alert_level, message
FROM lot_alerts
WHERE lot_id IN (SELECT id FROM lots WHERE lot_number LIKE 'TEST-%')
ORDER BY created_at DESC;
```

### Cleanup test data (sau khi verify xong):

```sql
-- Xóa theo thứ tự (FK constraints)
DELETE FROM open_vial_history
WHERE lot_id IN (SELECT id FROM lots WHERE lot_number LIKE 'TEST-%');
DELETE FROM lot_alerts
WHERE lot_id IN (SELECT id FROM lots WHERE lot_number LIKE 'TEST-%');
DELETE FROM disposal_request_lines
WHERE lot_id IN (SELECT id FROM lots WHERE lot_number LIKE 'TEST-%');
DELETE FROM disposal_requests
WHERE request_number LIKE 'DR-EXP-%';
DELETE FROM lot_qc_records
WHERE lot_id IN (SELECT id FROM lots WHERE lot_number LIKE 'TEST-%');
DELETE FROM lots WHERE lot_number LIKE 'TEST-%';
DELETE FROM recall_notices WHERE recall_number = 'TEST-REC-001';
DELETE FROM warehouses WHERE code LIKE 'TST-%';
DELETE FROM products WHERE sku LIKE 'TEST-%';
```

---

## Bước 3: Set Service Role Key cho Cron

Cron schedules ở Bước 1.5 sẽ FAIL nếu chưa có service_role_key. Cách set:

### Cách 1: Qua Supabase SQL Editor (recommended)

```sql
-- Lấy service_role_key từ Supabase Dashboard → Project Settings → API → service_role
-- Copy value (bắt đầu bằng "eyJ...")
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0dXlvcGx5dWhiZHhraGFiY3B5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzU5OTk0OSwiZXhwIjoyMDUzMTc1OTQ5fQ.xxxxx';

-- Sau đó chạy lại cron_schedules migration (hoặc schedule manually)
```

### Cách 2: Re-schedule manually qua SQL

```sql
-- Unschedule cũ (nếu đã schedule với placeholder)
SELECT cron.unschedule('auto-expire-lots') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-expire-lots'
);
SELECT cron.unschedule('check-lot-expirations') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-lot-expirations'
);

-- Schedule mới với URL thật
SELECT cron.schedule(
  'auto-expire-lots',
  '30 0 * * *',
  $$SELECT net.http_post(
    url := 'https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/auto-expire-lots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIs...'  -- paste service_role_key
    ),
    body := '{}'::jsonb
  )$$
);

SELECT cron.schedule(
  'check-lot-expirations',
  '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/check-lot-expirations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIs...'
    ),
    body := '{}'::jsonb
  )$$
);

-- Verify
SELECT jobname, schedule, active FROM cron.job
WHERE jobname IN ('auto-expire-lots', 'check-lot-expirations');
```

---

## Bước 4: Deploy 2 Edge Functions

```bash
# Từ thư mục gốc repo
supabase functions deploy auto-expire-lots --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
supabase functions deploy check-lot-expirations --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
```

Hoặc qua Dashboard → Edge Functions → Deploy manually.

---

## Bước 5: Manual Test Edge Functions

```bash
# Test auto-expire-lots
curl -X POST "https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/auto-expire-lots" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"success": true, "total_expired": <n>, "total_disposal_created": <n>}

# Test check-lot-expirations
curl -X POST "https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/check-lot-expirations" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"success": true, "total_alerts": <n>, "inserted": <n>, "skipped": <n>}
```

---

## Bước 6: Test trên UI (optional)

Sau khi deploy code lên Cloudflare Pages (hoặc dev local):
1. Login với user có role KEEPER_BULK_HC_SP + QC_OFFICER
2. Vào `/lots` - xem dashboard alerts
3. Click vào lô PENDING_QC → "QC" → complete QC PASS
4. Click lô APPROVED → "Mở nắp" → ghi nhận + in nhãn (sẽ add to print queue)
5. Vào `/admin/users` - verify user có role đúng

---

## Báo cáo kết quả

Sau khi test, bác gửi lại em:
1. **PASS/FAIL** cho 9 test scenarios
2. Nếu FAIL: copy error message từ Supabase
3. **Cron schedules** đã chạy thành công chưa? (verify bằng `SELECT * FROM cron.job;`)
4. **Edge functions** test manual OK không?

Em sẽ fix thêm issues nếu phát sinh, rồi tiếp tục Module 3.

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `extension pg_cron does not exist` | Supabase free tier không enable pg_cron | Bỏ qua cron, dùng GitHub Actions / Vercel Cron thay thế |
| `permission denied for schema net` | Service role chưa có quyền net.http_post | Check Supabase logs → Dashboard → Database → Roles |
| `function fn_complete_lot_qc does not exist` | Migration #4 chưa apply OK | Re-apply migration #4 |
| Edge function 401 Unauthorized | Service role key sai | Verify key từ Dashboard → Project Settings → API |
| `auth.uid() is null` trong test scenarios | Test chạy ngoài session | OK trong test, sẽ work với user login thật |

---

**Tác giả hướng dẫn**: Claude
**Ngày**: 2026-06-14
**File liên quan**:
- `supabase/migrations/20260615090000_khoa_xn_lots.sql`
- `supabase/migrations/20260615100000_khoa_xn_open_vial_recall.sql`
- `supabase/migrations/20260615110000_khoa_xn_disposal_alerts.sql`
- `supabase/migrations/20260615120000_khoa_xn_lot_functions.sql`
- `supabase/migrations/20260615130000_khoa_xn_cron_schedules.sql`
- `supabase/migrations/20260615999999_khoa_xn_lot_test_scenarios.sql`
- `supabase/functions/auto-expire-lots/index.ts`
- `supabase/functions/check-lot-expirations/index.ts`
