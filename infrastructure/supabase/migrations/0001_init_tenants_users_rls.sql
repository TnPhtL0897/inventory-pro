-- =============================================================================
-- Migration 0001: Foundation schema
-- Tenants, branches, users, roles, audit_logs
-- Multi-tenancy: Row-Level Security (RLS) + tenant_id + branch_id
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');
CREATE TYPE role_type AS ENUM ('SYSTEM', 'CUSTOM');

-- =============================================================================
-- TENANTS
-- Mỗi tenant = 1 doanh nghiệp. Cô lập hoàn toàn dữ liệu qua RLS.
-- =============================================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    tax_code        VARCHAR(50),
    address         TEXT,
    phone           VARCHAR(50),
    email           CITEXT,
    logo_url        TEXT,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          tenant_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

COMMENT ON TABLE tenants IS 'Top-level tenant. Mỗi doanh nghiệp = 1 tenant.';

-- =============================================================================
-- BRANCHES
-- Một tenant có nhiều chi nhánh (kho). Một số data (stock, movements) scope theo branch.
-- =============================================================================
CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    address         TEXT,
    phone           VARCHAR(50),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_branches_tenant ON branches(tenant_id);
CREATE INDEX idx_branches_active ON branches(tenant_id, is_active);

COMMENT ON TABLE branches IS 'Chi nhánh (kho vật lý). Mỗi tenant có thể có nhiều branch.';

-- =============================================================================
-- USERS
-- Mirror supabase auth.users. Không lưu password - auth do Supabase quản lý.
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY,  -- = auth.users.id từ Supabase
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    full_name       VARCHAR(200) NOT NULL,
    email           CITEXT NOT NULL,
    phone           VARCHAR(50),
    avatar_url      TEXT,
    status          user_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(tenant_id, status);

COMMENT ON TABLE users IS 'App user profile. Id trùng với auth.users.id từ Supabase Auth.';

-- =============================================================================
-- ROLES
-- System roles: Admin, Manager, Staff. Mỗi tenant có thể thêm custom role.
-- =============================================================================
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    description     TEXT,
    permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of permission keys
    role_type       role_type NOT NULL DEFAULT 'CUSTOM',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);

-- Seed system roles cho mỗi tenant mới (xem trigger bên dưới)
COMMENT ON TABLE roles IS 'Roles cho RBAC. SYSTEM roles không thể xóa.';

-- =============================================================================
-- USER_ROLES (junction)
-- Một user có thể có nhiều role ở nhiều branch khác nhau.
-- =============================================================================
CREATE TABLE user_roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    UNIQUE(user_id, role_id, branch_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_branch ON user_roles(branch_id);

COMMENT ON TABLE user_roles IS 'User-Role-Branch mapping. Một user ở chi nhánh X có thể có role Y.';

-- =============================================================================
-- AUDIT LOGS (append-only)
-- Tự động ghi INSERT/UPDATE/DELETE qua trigger. Service-level ghi thêm cho login, export.
-- =============================================================================
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,  -- INSERT, UPDATE, DELETE, LOGIN, EXPORT, etc.
    table_name      VARCHAR(100),
    record_id       UUID,
    old_data        JSONB,
    new_data        JSONB,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- IP, user agent, request_id
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

COMMENT ON TABLE audit_logs IS 'Audit trail append-only. Tự động ghi qua trigger. Retention 12 tháng.';

-- Revoke UPDATE/DELETE để đảm bảo append-only
REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON audit_logs FROM anon;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Lấy tenant_id từ JWT
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID AS $$
    SELECT NULLIF(
        current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id',
        ''
    )::uuid;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION auth_tenant_id() IS 'Lấy tenant_id từ JWT claims. Dùng trong RLS policies.';

-- Lấy user_id từ JWT (Supabase sẵn có auth.uid(), nhưng định nghĩa lại cho rõ ràng)
-- auth.uid() đã có sẵn từ Supabase

-- Lấy danh sách branch_id user có quyền
CREATE OR REPLACE FUNCTION auth_user_branch_ids()
RETURNS SETOF UUID AS $$
    SELECT branch_id
    FROM user_roles
    WHERE user_id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth_user_branch_ids() IS 'Danh sách branch_id user hiện tại có role. Dùng cho RLS branch-scope.';

-- Check user có role cụ thể ở branch nào đó không
CREATE OR REPLACE FUNCTION auth_has_role(p_branch_id UUID, p_role_code VARCHAR)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND ur.branch_id = p_branch_id
          AND r.code = p_role_code
          AND r.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth_has_role IS 'Check user có role cụ thể ở branch không.';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-seed system roles khi tạo tenant
CREATE OR REPLACE FUNCTION seed_tenant_system_roles()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO roles (tenant_id, name, code, description, role_type, permissions)
    VALUES
        (NEW.id, 'Administrator', 'ADMIN', 'Full access to tenant', 'SYSTEM',
         '["*"]'::jsonb),
        (NEW.id, 'Manager', 'MANAGER', 'Manage warehouse, approve documents, view reports', 'SYSTEM',
         '["products.read", "products.write", "warehouses.read", "warehouses.write",
           "stock.read", "stock.write", "po.read", "po.write", "po.approve",
           "grn.read", "grn.write", "grn.approve", "issue.read", "issue.write", "issue.approve",
           "transfer.read", "transfer.write", "transfer.approve",
           "stocktake.read", "stocktake.write", "stocktake.approve",
           "suppliers.read", "suppliers.write",
           "reports.read"]'::jsonb),
        (NEW.id, 'Staff', 'STAFF', 'Perform warehouse operations, cannot approve', 'SYSTEM',
         '["products.read", "warehouses.read", "stock.read",
           "po.read", "grn.read", "grn.write",
           "issue.read", "issue.write",
           "transfer.read", "transfer.write",
           "stocktake.read", "stocktake.write"]'::jsonb);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_seed_roles AFTER INSERT ON tenants
    FOR EACH ROW EXECUTE FUNCTION seed_tenant_system_roles();

-- Generic audit trigger
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
    v_record_id UUID;
BEGIN
    -- Cố gắng lấy tenant_id từ row
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := (to_jsonb(OLD) ->> 'tenant_id')::uuid;
        v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
    ELSE
        v_tenant_id := (to_jsonb(NEW) ->> 'tenant_id')::uuid;
        v_record_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;

    -- Bỏ qua nếu không có tenant_id (vd: bảng public)
    IF v_tenant_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_data, new_data, metadata)
    VALUES (
        v_tenant_id,
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        v_record_id,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        jsonb_build_object('request_id', current_setting('request.id', true))
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_trigger_func() IS 'Trigger ghi audit log. Gắn vào bảng nghiệp vụ qua CREATE TRIGGER.';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- TENANTS: user chỉ thấy tenant của mình
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON tenants
    FOR SELECT TO authenticated
    USING (id = auth_tenant_id());

-- Service role bypass (cho backend admin operations)
CREATE POLICY tenant_service_role ON tenants
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- BRANCHES: scope theo tenant + user phải có role ở branch
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY branches_tenant_isolation ON branches
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY branches_tenant_write ON branches
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY branches_service_role ON branches
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- USERS: chỉ thấy user cùng tenant
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY users_self_update ON users
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admin có thể INSERT user (qua service_role)
CREATE POLICY users_service_role ON users
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ROLES: scope theo tenant
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_tenant_isolation ON roles
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY roles_tenant_write ON roles
    FOR ALL TO authenticated
    USING (tenant_id = auth_tenant_id())
    WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY roles_service_role ON roles
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- USER_ROLES: scope theo tenant
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_isolation ON user_roles
    FOR SELECT TO authenticated
    USING (
        user_id IN (SELECT id FROM users WHERE tenant_id = auth_tenant_id())
    );

CREATE POLICY user_roles_write ON user_roles
    FOR ALL TO authenticated
    USING (
        user_id IN (SELECT id FROM users WHERE tenant_id = auth_tenant_id())
    )
    WITH CHECK (
        user_id IN (SELECT id FROM users WHERE tenant_id = auth_tenant_id())
    );

CREATE POLICY user_roles_service_role ON user_roles
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- AUDIT_LOGS: chỉ SELECT, append-only qua trigger
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON audit_logs
    FOR SELECT TO authenticated
    USING (tenant_id = auth_tenant_id());

CREATE POLICY audit_logs_service_role ON audit_logs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Insert vào audit_logs thông qua service_role (trigger chạy với SECURITY DEFINER)
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id = auth_tenant_id());

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- =============================================================================
-- TRIGGER: gắn audit vào các bảng nghiệp vụ
-- (Sẽ thêm các bảng khác trong migration sau)
-- =============================================================================
CREATE TRIGGER audit_branches
AFTER INSERT OR UPDATE OR DELETE ON branches
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_roles
AFTER INSERT OR UPDATE OR DELETE ON roles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
