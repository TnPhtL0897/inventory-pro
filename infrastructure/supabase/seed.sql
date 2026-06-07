-- =============================================================================
-- Seed data for development
-- CHỈ chạy trên local/staging. Production dùng onboarding flow.
-- =============================================================================

-- Insert demo tenant (Supabase auth user phải tạo qua Dashboard trước)
-- Tenant trigger sẽ tự động tạo system roles

-- Ví dụ: tạo tenant qua service role
-- SELECT * FROM create_tenant('Demo Company', 'demo', 'user-uuid-from-supabase-auth');

-- Function tiện ích: tạo tenant mới
CREATE OR REPLACE FUNCTION create_tenant(
    p_name VARCHAR,
    p_slug VARCHAR,
    p_admin_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_tenant_id UUID;
    v_default_branch_id UUID;
BEGIN
    -- Tạo tenant
    INSERT INTO tenants (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_tenant_id;

    -- Tạo default branch
    INSERT INTO branches (tenant_id, name, code, is_default)
    VALUES (v_tenant_id, 'Main Branch', 'MAIN', TRUE)
    RETURNING id INTO v_default_branch_id;

    -- Tạo user profile
    INSERT INTO users (id, tenant_id, full_name, email, status)
    VALUES (p_admin_user_id, v_tenant_id, 'Admin', 'admin@' || p_slug || '.vn', 'ACTIVE');

    -- Gán ADMIN role cho user ở default branch
    INSERT INTO user_roles (user_id, role_id, branch_id)
    SELECT p_admin_user_id, r.id, v_default_branch_id
    FROM roles r
    WHERE r.tenant_id = v_tenant_id AND r.code = 'ADMIN';

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_tenant IS 'Tạo tenant + default branch + admin user. Dùng cho onboarding.';
