-- Migration: Fix Auth Hook permissions sau khi apply các migration trước
-- Lỗi: "Error running hook URI: pg-functions://postgres/public/custom_access_token_hook"
-- Nguyên nhân: supabase_auth_admin không có SELECT permission trên public.users / public.roles / public.user_roles
-- sau khi các RLS migration strip permissions của role này.

-- Grant permissions cho supabase_auth_admin (role chạy Auth Hook)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;

-- Specific tables cần cho Auth Hook
GRANT SELECT ON public.users TO supabase_auth_admin;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
GRANT SELECT ON public.roles TO supabase_auth_admin;

-- Grant EXECUTE lại cho Auth Hook function (defensive)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Test query: Verify function accessible
DO $$
BEGIN
  PERFORM 1 FROM public.users LIMIT 1;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Auth Hook may still have issues: %', SQLERRM;
END $$;