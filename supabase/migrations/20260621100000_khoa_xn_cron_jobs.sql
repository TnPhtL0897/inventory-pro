-- =============================================================================
-- Khoa XN — Cron Jobs Setup
-- File: supabase/migrations/20260621100000_khoa_xn_cron_jobs.sql
--
-- Setup pg_cron jobs trên Supabase (chạy qua Dashboard Database → Cron Jobs)
-- Hoặc paste SQL này vào SQL Editor sau khi apply các migrations trước.
--
-- Lưu ý: pg_cron PHẢI enable trên Supabase Dashboard → Database → Extensions
-- =============================================================================

-- =============================================================================
-- 1. Enable pg_cron + pg_net extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================================
-- 2. Helper: gọi Edge Function qua HTTP
-- =============================================================================
-- Supabase Edge Function URL format: <SUPABASE_URL>/functions/v1/<name>
-- Service role key từ Dashboard → Settings → API
-- =============================================================================

-- Cấu hình URL + service role key (lấy từ Dashboard)
-- LƯU Ý: KHÔNG hardcode vào SQL. Dùng biến session.
-- ALTER DATABASE postgres SET app.supabase_url = 'https://ituyoplyuhbdxkhabcpy.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';

-- =============================================================================
-- 3. Cron job definitions
-- =============================================================================

-- Job 1: Auto EXPIRED lô hết hạn (00:30 sáng hàng ngày)
-- Gọi Edge Function auto-expire-lots
SELECT cron.schedule(
  'khoaxn-auto-expire-lots',
  '30 0 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/auto-expire-lots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 2: Cảnh báo lô sắp hết hạn (06:00 sáng hàng ngày)
-- Gọi Edge Function check-lot-expirations
SELECT cron.schedule(
  'khoaxn-check-lot-expirations',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/check-lot-expirations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 3: Cảnh báo open-vial sắp hết hạn (06:30 sáng hàng ngày)
-- Gọi Edge Function open-vial-action với action=expiring
SELECT cron.schedule(
  'khoaxn-open-vial-expiring-alerts',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/open-vial-action/expiring',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 4: Tính dự trù tuần (02:00 sáng T2 hàng tuần)
-- Gọi Edge Function compute-weekly-replenishment
SELECT cron.schedule(
  'khoaxn-weekly-replenishment',
  '0 2 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/compute-weekly-replenishment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := jsonb_build_object('weekStart', (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INT + 1)::TEXT)
  ) AS request_id;
  $$
);

-- Job 5: Tính dự trù cuối tháng (02:00 sáng ngày 25 hàng tháng)
-- Gọi Edge Function replenishment với action=run
SELECT cron.schedule(
  'khoaxn-monthly-replenishment',
  '0 2 25 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/replenishment/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := jsonb_build_object(
      'fiscalYear', EXTRACT(YEAR FROM CURRENT_DATE)::INT,
      'fiscalMonth', EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 month'))::INT,
      'saveAsPurchaseRequest', true
    )
  ) AS request_id;
  $$
);

-- Job 6: FEFO compliance report cuối tháng (23:00 ngày 28 hàng tháng)
-- (pg_cron không hỗ trợ 'L' = last day, dùng 28 là ngày an toàn)
-- Gọi Edge Function fefo-pick/compliance
SELECT cron.schedule(
  'khoaxn-fefo-monthly-compliance',
  '0 23 28 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', TRUE) || '/functions/v1/fefo-pick/compliance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', TRUE)
    ),
    body := jsonb_build_object(
      'year', EXTRACT(YEAR FROM CURRENT_DATE)::INT,
      'month', EXTRACT(MONTH FROM CURRENT_DATE)::INT
    )
  ) AS request_id;
  $$
);

-- Job 7: Archive audit logs > 5 năm (00:00 01/01 hàng năm)
-- Gọi SQL function trực tiếp (không qua Edge Function)
SELECT cron.schedule(
  'khoaxn-archive-audit-logs',
  '0 0 1 1 *',
  $$
  SELECT fn_archive_old_audit_logs(5);
  $$
);

-- =============================================================================
-- 4. Verify
-- =============================================================================

-- Xem tất cả cron jobs đã tạo
-- SELECT * FROM cron.job ORDER BY jobname;

-- Xem lịch sử chạy
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;

-- =============================================================================
-- 5. Unschedule (nếu cần xóa)
-- =============================================================================

-- SELECT cron.unschedule('khoaxn-auto-expire-lots');
-- SELECT cron.unschedule('khoaxn-check-lot-expirations');
-- SELECT cron.unschedule('khoaxn-open-vial-expiring-alerts');
-- SELECT cron.unschedule('khoaxn-weekly-replenishment');
-- SELECT cron.unschedule('khoaxn-monthly-replenishment');
-- SELECT cron.unschedule('khoaxn-fefo-monthly-compliance');
-- SELECT cron.unschedule('khoaxn-archive-audit-logs');

-- =============================================================================
-- Setup complete!
-- Cron jobs đã được đăng ký. Để monitor, truy cập /admin/cron-monitor
-- hoặc Dashboard Database → Cron Jobs.
-- =============================================================================
