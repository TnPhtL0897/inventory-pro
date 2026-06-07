# ADR-0001: Multi-tenancy với Row-Level Security (RLS)

## Status
Accepted — 2026-06-06

## Context
Hệ thống cần phục vụ nhiều doanh nghiệp (tenants), mỗi tenant có nhiều chi nhánh.
Yêu cầu cô lập dữ liệu hoàn toàn giữa các tenants (security) nhưng triển khai đơn giản
và chi phí thấp (free tier Supabase).

## Options considered

### Option 1: Schema-per-tenant
- Mỗi tenant = 1 schema Postgres riêng.
- ✅ Cô lập tuyệt đối.
- ❌ Migration phức tạp (phải apply N lần).
- ❌ Quản lý connection pool khó.
- ❌ Cross-tenant analytics khó.

### Option 2: Database-per-tenant
- Mỗi tenant = 1 database riêng.
- ✅ Cô lập tuyệt đối.
- ❌ Chi phí cao (free tier chỉ có 1 database).
- ❌ Quản lý nhiều DB instances.

### Option 3: Shared database với Row-Level Security (chosen)
- Tất cả tenants dùng chung schema, phân biệt bằng `tenant_id`.
- ✅ Chi phí thấp (1 database, 1 schema).
- ✅ Migration đơn giản.
- ✅ Cross-tenant analytics dễ (cho admin platform).
- ✅ Supabase hỗ trợ RLS native, hiệu năng tốt.
- ⚠️ Phải test kỹ RLS để tránh leak (cross-tenant access test trong CI).

## Decision
**Option 3**: Shared database + RLS.

Mỗi bảng nghiệp vụ có cột `tenant_id`. JWT chứa claim `tenant_id`.
RLS policies check `tenant_id = auth.jwt() ->> ''tenant_id'`.

Một số bảng có thêm `branch_id` và policy kiểm tra user có role ở branch đó không
(via `user_roles` table).

## Consequences
- Mọi query phải đi qua authenticated role (không bao giờ dùng anon).
- Service role key (Supabase) chỉ dùng trong trusted backend (.NET API).
- Test suite tự động verify RLS: mỗi PR chạy "tenant A không thấy data tenant B".
- Performance: thêm index trên `tenant_id` cho mọi bảng.
- Khi migrate: phải test kỹ rằng không có bảng nào quên enable RLS.
