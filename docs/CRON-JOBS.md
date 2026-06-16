# ⏰ Cron Jobs - Setup & Monitoring

> Hệ thống tự động cho Quản kho Khoa XN
> Setup trên Supabase Cloud (pg_cron + Edge Functions)

---

## Tổng quan

| Cron | Thời gian | Mục đích | Edge Function |
|------|-----------|----------|---------------|
| `khoaxn-auto-expire-lots` | 00:30 hàng ngày | Tự động EXPIRED lô hết hạn + tạo phiếu hủy | `auto-expire-lots` |
| `khoaxn-check-lot-expirations` | 06:00 hàng ngày | Cảnh báo 30/15/7 ngày hết hạn | `check-lot-expirations` |
| `khoaxn-open-vial-expiring-alerts` | 06:30 hàng ngày | Cảnh báo open-vial sắp hết hạn | `open-vial-action/expiring` |
| `khoaxn-weekly-replenishment` | 02:00 T2 hàng tuần | Tính dự trù tuần cho BULK | `compute-weekly-replenishment` |
| `khoaxn-monthly-replenishment` | 02:00 ngày 25 hàng tháng | Tính dự trù cuối tháng | `replenishment/run` |
| `khoaxn-fefo-monthly-compliance` | 23:00 ngày cuối tháng | FEFO compliance report | `fefo-pick/compliance` |
| `khoaxn-archive-audit-logs` | 00:00 01/01 hàng năm | Xóa audit logs > 5 năm | `fn_archive_old_audit_logs()` |

## Setup

### Bước 1: Enable pg_cron + pg_net trên Supabase

1. Vào https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/database/extensions
2. Tìm `pg_cron` → Click "Enable"
3. Tìm `pg_net` → Click "Enable"

### Bước 2: Set biến session cho supabase URL + service role key

Vào SQL Editor → chạy:

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://ituyoplyuhbdxkhabcpy.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = '<YOUR_SERVICE_ROLE_KEY>';
```

Lấy service_role_key từ:
- Dashboard → Settings → API → `service_role` (secret)

### Bước 3: Apply cron jobs migration

Cách A: Qua CLI (đã linked project)
```bash
cd "D:/Tự động hóa/Quản kho vật tư Pro"
supabase db push --include-all
```

Cách B: Manual qua Dashboard
1. Vào SQL Editor
2. Mở file `supabase/migrations/20260621100000_khoa_xn_cron_jobs.sql`
3. Copy toàn bộ SQL → paste vào Editor → Run

## Monitoring

### Qua UI web
- Truy cập https://quankho.pages.dev/admin/cron-monitor
- Xem danh sách jobs, lịch sử chạy, failed/succeeded 24h

### Qua SQL Editor
```sql
-- Xem tất cả jobs
SELECT * FROM cron.job ORDER BY jobname;

-- Xem lịch sử chạy gần nhất
SELECT
  j.jobname,
  jr.start_time,
  jr.end_time,
  jr.status,
  EXTRACT(EPOCH FROM (jr.end_time - jr.start_time)) AS duration_sec,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
ORDER BY jr.start_time DESC
LIMIT 50;

-- Job failed 24h qua
SELECT
  j.jobname,
  jr.start_time,
  jr.status,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE jr.status = 'failed'
  AND jr.start_time > NOW() - INTERVAL '1 day'
ORDER BY jr.start_time DESC;
```

### Qua Dashboard
- https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/database/cron-jobs

## Troubleshooting

### Job không chạy
1. Check `app.supabase_url` + `app.service_role_key` đã set chưa:
   ```sql
   SHOW app.supabase_url;
   SHOW app.service_role_key;
   ```
2. Check pg_cron + pg_net đã enable
3. Check log lỗi: `SELECT * FROM cron.job_run_details WHERE status = 'failed' ORDER BY start_time DESC LIMIT 5;`

### Job chạy nhưng Edge Function fail
1. Test Edge Function manual trước:
   ```bash
   curl -X POST https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/auto-expire-lots \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
2. Check log Edge Function trong Dashboard → Edge Functions → Logs

### Unschedule job
```sql
SELECT cron.unschedule('khoaxn-auto-expire-lots');
```

### Update schedule
```sql
-- Unschedule + schedule lại
SELECT cron.unschedule('khoaxn-auto-expire-lots');
SELECT cron.schedule(
  'khoaxn-auto-expire-lots',
  '0 1 * * *',  -- 01:00 thay vì 00:30
  $$ ... $$
);
```

## Tùy chỉnh theo môi trường

### Production (recommended)
- Giữ nguyên schedule như trên
- Monitor `/admin/cron-monitor` mỗi ngày
- Setup email alert cho job failed

### Development
- Disable hết: `SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'khoaxn-%';`
- Hoặc chỉ enable 1-2 job cần test

## Performance tips

1. **Job EXPIRED (00:30)**: chạy giờ thấp điểm → tránh conflict
2. **Job cảnh báo (06:00, 06:30)**: chạy sau khi EXPIRED → xử lý lô mới cập nhật
3. **Job dự trù (02:00 T2/25)**: chạy đêm CN/T7 → không ảnh hưởng user
4. **Job archive (00:00 01/01)**: chạy 1 lần/năm → backup trước khi xóa

## Tham khảo

- Supabase pg_cron docs: https://supabase.com/docs/guides/database/extensions/pg_cron
- Edge Function docs: https://supabase.com/docs/guides/functions
- Source SQL: `supabase/migrations/20260621100000_khoa_xn_cron_jobs.sql`
