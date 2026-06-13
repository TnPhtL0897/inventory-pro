-- =============================================================================
-- Verify yearly_forecast migration applied successfully
-- Run via Supabase Dashboard SQL Editor, OR:
--   psql <conn> -f scripts/verify-yearly-forecast.sql
--   OR via REST: curl ... -d "{\"query\": \"<SQL below>\"}"
-- =============================================================================

-- 1. Tables exist
SELECT
    'TABLE' as object_type,
    tablename as name,
    'OK' as status
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'yearly_forecast%'
UNION ALL

-- 2. View exists
SELECT
    'VIEW' as object_type,
    viewname as name,
    'OK' as status
FROM pg_views
WHERE schemaname = 'public' AND viewname = 'v_product_consumption_yearly'
UNION ALL

-- 3. Enums created
SELECT
    'ENUM' as object_type,
    t.typname as name,
    'OK' as status
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname LIKE 'yearly_forecast%'
GROUP BY t.typname
ORDER BY object_type, name;

-- 4. RLS policies
SELECT
    schemaname || '.' || tablename as table_name,
    policyname as policy_name,
    cmd as command,
    roles::text as roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'yearly_forecast%'
ORDER BY tablename, policyname;

-- 5. Try SELECT (smoke test)
SELECT 'yearly_forecast_runs' as tbl, count(*) as row_count FROM yearly_forecast_runs
UNION ALL
SELECT 'yearly_forecast_lines', count(*) FROM yearly_forecast_lines
UNION ALL
SELECT 'v_product_consumption_yearly', count(*) FROM v_product_consumption_yearly;

-- 6. Show table structure (sample)
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'yearly_forecast_runs'
ORDER BY ordinal_position;

SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'yearly_forecast_lines'
ORDER BY ordinal_position;
