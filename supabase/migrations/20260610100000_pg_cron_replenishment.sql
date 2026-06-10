-- =============================================================================
-- Phase 5: pg_cron to call replenishment Edge Function monthly
-- =============================================================================
-- Replaces ReplenishmentBackgroundService (Render HostedService).
-- Runs at 2 AM on the 25th of each month to compute month-end forecast.
--
-- Prerequisite:
--   - supabase_extensions.pg_cron must be enabled (Dashboard > Database > Extensions)
--   - supabase_functions must be accessible (usually is by default)
-- =============================================================================

-- 1. Enable pg_cron and pg_net extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Store the Supabase service role key as a Postgres setting (read by cron)
-- Set via ALTER SYSTEM + restart, OR via Dashboard > Settings > Database > Custom Postgres Config
-- For now, use a placeholder that the user must replace:
--   ALTER DATABASE postgres SET app.settings.cron_token = '<service_role_key>';
-- Or pass via supabase_functions.invoke() which auto-includes service role.

-- 3. Schedule the replenishment run
-- Pattern: '0 2 25 * *' = minute 0, hour 2, day-of-month 25, every month
SELECT cron.schedule(
  'replenishment-month-end',
  '0 2 25 * *',  -- 2 AM on 25th of every month
  $$
  SELECT
    net.http_post(
      url := 'https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/replenishment-run',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_token', true)
      ),
      body := jsonb_build_object(
        'fiscalYear', extract(year from now())::int,
        'fiscalMonth', extract(month from now())::int,
        'triggeredBy', 'pg_cron'
      )
    ) AS request_id;
  $$
);

-- 4. Verify the schedule was created
SELECT
  jobname,
  schedule,
  active,
  database,
  username
FROM cron.job
WHERE jobname = 'replenishment-month-end';

-- =============================================================================
-- Notes for user:
-- =============================================================================
-- 1. Enable pg_cron: Dashboard > Database > Extensions > enable 'pg_cron' + 'pg_net'
-- 2. Set cron token (one-time):
--      ALTER DATABASE postgres SET app.settings.cron_token = '<service_role_key>';
--    Get service_role_key from Dashboard > Settings > API > service_role (secret)
-- 3. To run manually for testing:
--      SELECT cron.run_job('replenishment-month-end');
-- 4. To unschedule:
--      SELECT cron.unschedule('replenishment-month-end');
-- 5. To view history:
--      SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- 6. If Edge Function returns error, the run is logged in cron.job_run_details.
--    The function itself logs to month_end_forecast_runs.error_message.
