-- Migration: Recreate Auth Hook (simple version - chỉ đọc từ auth.users metadata)
-- Fix lỗi "Error running hook URI: pg-functions://postgres/public/custom_access_token_hook"
-- do function cũ join public.users bị fail khi public.users chưa được migrate.
--
-- Hook mới: Đọc tenant_id từ auth.users.raw_app_meta_data (được set qua Admin API)
-- Fallback: nếu không có metadata thì return event unchanged.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_role_codes text[];
  v_branch_ids uuid[];
  v_email text;
  v_full_name text;
  v_app_meta jsonb;
  v_user_meta jsonb;
BEGIN
  -- Lấy user_id + claims từ event
  v_user_id := (event ->> 'user_id')::uuid;
  claims := event -> 'claims';
  IF claims IS NULL THEN
    claims := '{}'::jsonb;
  END IF;

  -- Đọc app_metadata từ auth.users (chỉ SELECT, không cần public schema)
  SELECT
    raw_app_meta_data,
    raw_user_meta_data,
    email
  INTO v_app_meta, v_user_meta, v_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Extract tenant_id từ app_metadata (đã được set qua admin API)
  IF v_app_meta IS NOT NULL THEN
    v_tenant_id := (v_app_meta ->> 'tenant_id')::uuid;
    -- role_codes + branch_ids có thể là JSON array hoặc null
    IF v_app_meta ? 'role_codes' AND jsonb_typeof(v_app_meta -> 'role_codes') = 'array' THEN
      SELECT array_agg(value::text) INTO v_role_codes
      FROM jsonb_array_elements_text(v_app_meta -> 'role_codes');
    END IF;
    IF v_app_meta ? 'branch_ids' AND jsonb_typeof(v_app_meta -> 'branch_ids') = 'array' THEN
      SELECT array_agg(value::uuid) INTO v_branch_ids
      FROM jsonb_array_elements_text(v_app_meta -> 'branch_ids');
    END IF;
  END IF;

  -- Extract full_name từ user_metadata
  IF v_user_meta IS NOT NULL THEN
    v_full_name := v_user_meta ->> 'full_name';
  END IF;

  -- Inject vào claims
  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  END IF;
  IF v_role_codes IS NOT NULL THEN
    claims := jsonb_set(claims, '{role_codes}', to_jsonb(v_role_codes));
  END IF;
  IF v_branch_ids IS NOT NULL THEN
    claims := jsonb_set(claims, '{branch_ids}', to_jsonb(v_branch_ids));
  END IF;
  IF v_full_name IS NOT NULL THEN
    claims := jsonb_set(claims, '{full_name}', to_jsonb(v_full_name));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
 'Auth Hook v2: đọc tenant_id/role_codes/branch_ids/full_name từ auth.users.raw_app_meta_data + raw_user_meta_data. Set qua Supabase Admin API: supabase.auth.admin.updateUserById(id, { app_metadata: { tenant_id, role_codes, branch_ids } }).';