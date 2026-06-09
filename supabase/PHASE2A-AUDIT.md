# Phase 2a: Schema Audit Report

Dump từ Supabase project `ituyoplyuhbdxkhabcpy` ngày 2026-06-09.

## Thống kê

- **25 tables** trong schema `public`
- **25/25 tables có RLS = ON** ✅
- **70 RLS policies** (3/bảng trung bình)
- **95 functions, 98 triggers, 92 foreign keys, 138 indexes**
- **0 views** hiện có

## Tables (25)

```
audit_logs, branches, categories, goods_receipt_lines, goods_receipts,
locations, month_end_forecast_runs, parties, product_units, products,
purchase_order_lines, purchase_orders, roles, stock_issue_lines,
stock_issues, stock_take_lines, stock_takes, stock_transfer_lines,
stock_transfers, supplier_products, tenants, units_of_measure,
user_roles, users, warehouses
```

## GRANTs

✅ **ĐÃ ĐẦY ĐỦ** - anon, authenticated, service_role đều có full quyền
(SELECT, INSERT, UPDATE, DELETE) trên tất cả 25 bảng. Không cần action thêm.

## RLS Policy pattern

Mỗi bảng có 3 policies:
1. `<table>_service_role [ALL]`: `true` — bypass cho service_role key
2. `<table>_tenant_isolation [SELECT]`: `tenant_id = auth_tenant_id()`
3. `<table>_tenant_write [ALL]`: `tenant_id = auth_tenant_id()`

Bảng `users` thêm:
- `users_self_update [UPDATE]`: `id = auth.uid()` — user tự update profile

Bảng `tenants`:
- `tenant_isolation_select [SELECT]`: `id = auth_tenant_id()`
- `tenant_service_role [ALL]`: `true`

## Auth helper functions (đã có sẵn)

```sql
public.auth_tenant_id() RETURNS uuid
-- Đọc tenant_id từ JWT claim 'request.jwt.claims'
-- NULLIF(... , '')::uuid
```

Đây là pattern Supabase chuẩn. Khi frontend gọi PostgREST với Bearer token,
PostgREST tự attach claim vào `request.jwt.claims` → RLS filter tự động.

## ⚠️ Schema thiếu (so với C# code)

C# code có nhưng **CHƯA có** trên Supabase:
- `stock_movements` (event-sourcing core)
- `stock` (materialized tồn kho)
- `bid_plans`, `bid_packages`, `bid_lots`, `bid_lot_lines`, `bid_bidders`, `bid_contracts`

→ Cần tạo migration SQL cho các bảng này (Phase 3 sẽ generate kèm Edge Functions).

## Kết luận Phase 2a

**KHÔNG CẦN ACTION**. Schema đã sẵn sàng cho PostgREST. Tiếp tục Phase 2c (tạo view).
