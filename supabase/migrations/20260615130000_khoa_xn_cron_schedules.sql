-- =============================================================================
-- Khoa XN — Module 2: pg_cron schedule cho lot expiration jobs
-- File: supabase/migrations/20260615130000_khoa_xn_cron_schedules.sql
--
-- Setup pg_cron để gọi 2 edge functions:
-- - auto-expire-lots: 00:30 sáng hàng ngày
-- - check-lot-expirations: 06:00 sáng hàng ngày
--
-- Lưu ý: Cần enable pg_cron + pg_net extensions trên Supabase.
-- URL và SERVICE_ROLE_KEY sẽ được set qua env vars.
-- =============================================================================

-- Enable extensions (nếu chưa có)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Lấy URL và SERVICE_ROLE_KEY từ env (Supabase tự động set)
-- Nếu chưa có, dùng defaults
DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Lấy URL từ settings (Supabase set tự động)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'http://localhost:54321';  -- Local dev fallback
  END IF;

  v_service_key := current_setting('app.settings.service_role_key', true);
  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := 'placeholder-key';  -- Local dev fallback
  END IF;

  -- Unschedule cũ nếu có
  PERFORM cron.unschedule('auto-expire-lots');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.unschedule('check-lot-expirations');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Schedule auto-expire-lots: 00:30 sáng hàng ngày
  PERFORM cron.schedule(
    'auto-expire-lots',
    '30 0 * * *',
    format(
      $$SELECT net.http_post(
        url := '%s/functions/v1/auto-expire-lots',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      )$$,
      v_supabase_url,
      v_service_key
    )
  );

  -- Schedule check-lot-expirations: 06:00 sáng hàng ngày
  PERFORM cron.schedule(
    'check-lot-expirations',
    '0 6 * * *',
    format(
      $$SELECT net.http_post(
        url := '%s/functions/v1/check-lot-expirations',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      )$$,
      v_supabase_url,
      v_service_key
    )
  );

  RAISE NOTICE '[khoa-xn-cron] Scheduled auto-expire-lots (00:30) and check-lot-expirations (06:00)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[khoa-xn-cron] Failed to schedule: %', SQLERRM;
END $$;

-- Verify schedules
SELECT
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname IN ('auto-expire-lots', 'check-lot-expirations');
