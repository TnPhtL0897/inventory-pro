-- Migration: Auth Hook inject tenant_id vào JWT
-- Bật "Custom Access Token" hook trong Supabase Dashboard:
-- Authentication → Hooks → Custom Access Token → chọn public.custom_access_token_hook → Enable
--
-- Sau khi enable, mọi login (mới + refresh) sẽ có claim tenant_id trong JWT.
-- RPC auth_tenant_id() sẽ trả về tenant hợp lệ → RLS policies hoạt động đúng.
--
-- Reference: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
 claims jsonb;
 user_tenant_id uuid;
 user_branch_ids uuid[];
 user_role_codes text[];
 v_user_id uuid;
BEGIN
 -- Lấy user_id từ event (Supabase truyền vào khi hook chạy)
 v_user_id := (event ->> 'user_id')::uuid;
 IF v_user_id IS NULL THEN
 RETURN event;
 END IF;

 -- Lấy tenant_id + branches + roles từ bảng users + user_roles + roles
 SELECT
 u.tenant_id,
 COALESCE(array_agg(DISTINCT ur.branch_id) FILTER (WHERE ur.branch_id IS NOT NULL), '{}'),
 COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}')
 INTO user_tenant_id, user_branch_ids, user_role_codes
 FROM users u
 LEFT JOIN user_roles ur ON ur.user_id = u.id
 LEFT JOIN roles r ON r.id = ur.role_id
 WHERE u.id = v_user_id
 GROUP BY u.tenant_id;

 -- Build claims mới, giữ nguyên mọi claim cũ + inject tenant_id, branch_ids, role_codes
 claims := event -> 'claims';
 IF claims IS NULL THEN
 claims := '{}'::jsonb;
 END IF;

 IF user_tenant_id IS NOT NULL THEN
 claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
 claims := jsonb_set(claims, '{branch_ids}', to_jsonb(user_branch_ids));
 claims := jsonb_set(claims, '{role_codes}', to_jsonb(user_role_codes));
 END IF;

 event := jsonb_set(event, '{claims}', claims);
 RETURN event;
END;
$$;

-- Hook chỉ được gọi bởi supabase_auth_admin
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Cho phép role authenticated gọi để test (optional)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO anon;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
 'Auth Hook: inject tenant_id, branch_ids, role_codes từ bảng users/user_roles/roles vào JWT claims. Enable qua Dashboard → Auth → Hooks → Custom Access Token.';
