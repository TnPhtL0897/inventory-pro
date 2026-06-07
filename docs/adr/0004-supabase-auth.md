# ADR-0004: Auth với Supabase + JWT validation trên .NET

## Status
Accepted — 2026-06-06

## Context
Cần auth user, multi-tenant, role-based access. Supabase cung cấp Auth sẵn (battle-tested).
.NET API cần validate JWT do Supabase cấp.

## Decision
**Supabase Auth cho login/register, .NET API validate JWT + extract claims**.

### Flow:
1. **Web client** login trực tiếp với Supabase (`supabase.auth.signInWithPassword`).
2. Supabase trả về `access_token` (JWT) + `refresh_token`.
3. Token lưu trong httpOnly cookie (qua `@supabase/ssr`).
4. Mỗi request API: cookie tự động attach, hoặc web gọi API với `Authorization: Bearer <token>`.
5. **.NET API** validate JWT signature với Supabase secret + extract claims:
   - `sub` (user_id)
   - `email`
   - `tenant_id`
   - `branch_id` (có thể nhiều)
   - `role` (ADMIN/MANAGER/STAFF)
   - `full_name`

### Custom claims:
- Supabase không cho set custom claims trực tiếp. Dùng cách:
  - Trigger trên `auth.users` INSERT/UPDATE → gọi Edge Function update user metadata.
  - Hoặc: khi login, web gọi `GET /api/v1/auth/me` để lấy profile từ bảng `users` (join roles, branches).
- Cho phase 0: chấp nhận chỉ có `sub` + `email` trong JWT. Backend sẽ query DB để lấy
  tenant/role/branch. Phase sau sẽ thêm custom claims.

### Middleware:
- `UseAuthentication` (JWT bearer)
- `UseTenantScope` (extract → inject vào `TenantContext` scoped service)
- `UseAuthorization` (policy-based)

### Authorization policies:
- `RequireAdmin` - claim role = ADMIN
- `RequireManager` - role = ADMIN hoặc MANAGER
- Resource-level (vd: chỉ thấy branch mình): check trong handler/query

### Refresh token:
- Web client tự động refresh qua `@supabase/ssr`.
- API không cần endpoint refresh (web handle).

## Consequences
- Login flow ở web là Supabase-managed → bảo mật cao, ít code.
- API stateless, không cần session store.
- Khi revoke user (xóa khỏi `users` table): JWT vẫn valid đến khi hết hạn.
  → Phase sau: dùng Supabase Auth Hook để check `users.status` mỗi request.
- Custom claims: cần setup Edge Function. Phase 0 tạm bỏ qua.
