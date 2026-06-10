# 🚀 Final Deployment Checklist

Stack sau migration: **2 services** (Supabase + Cloudflare)

```
[User] → Cloudflare (DNS + Pages + CDN)
            ↓
       Supabase (Postgres + Auth + Edge Functions + Storage + pg_cron)
```

## ✅ Hoàn tất (5/8 phase)

| Phase | Status | Commit |
|---|---|---|
| Phase 0: Supabase CLI + link | ✅ | 180a3b4 |
| Phase 1: Phân loại 20 controllers | ✅ | 180a3b4 |
| Phase 2a: Audit GRANT/RLS | ✅ | 180a3b4 |
| Phase 2c: Tạo 3 views | ✅ | 180a3b4 |
| Phase 3: Port 10 Edge Functions | ✅ | 1dee6ef |
| Phase 4: Data-access + page runtime=edge | ✅ | a59c203, 3d2fe68 |
| Phase 5: pg_cron migration file | ✅ | 61cf1fa (DNS fail, cần apply thủ công) |
| Phase 6: Cleanup Render + Vercel | ⏳ | (chưa làm) |

## 🌐 Cloudflare Pages — Setup Guide (đang thực hiện)

### URL tham chiếu
- Repo: `https://github.com/TnPhtL0897/inventory-pro`
- Branch: `main`
- Latest commit: `61cf1fa` (đã push)

### Bước thực hiện (lần lượt)

#### 1. Set Environment Variables (TRƯỚC khi build)
Vào **Workers & Pages** → `inventorypro-web` → **Settings** → **Environment variables**:

| Variable | Value | Production | Preview |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ituyoplyuhbdxkhabcpy.supabase.co` | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0dXlvcGx5dWhiZHhraGFiY3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI3NjAsImV4cCI6MjA5NjQ3ODc2MH0.S9DTQEunvApbhhxJUiLvM4IIs8AW1ZfI5jYyLHXgiEU` | ✓ | ✓ |
| `NODE_VERSION` | `20` | ✓ | ✓ |

#### 2. Set Build Configuration
- **Build command**: `npx @cloudflare/next-on-pages@1`
- **Build output directory**: `.vercel/output/static`
- **Root directory**: `apps/web`

#### 3. Set Compatibility
- **Compatibility date**: `2024-09-23` (hoặc mới hơn)
- **Compatibility flags**: `nodejs_compat` (cả Production + Preview)

#### 4. Deploy
- **Deployments** → click **Retry** trên build fail, hoặc **Create deployment** → chọn commit mới nhất
- Đợi build 3-5 phút

#### 5. Verify
Sau khi deploy success, mở URL `inventorypro-web.pages.dev`:
- Trang login hiển thị
- Đăng nhập với 1 user test → load dashboard
- Vào `/inventory/products` → hiển thị data từ Supabase PostgREST
- Vào `/warehouses` → hiển thị data

### Common errors
| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `Configuration file for Pages projects does not support "build"` | wrangler.toml có `[build]` (đã fix commit 3d2fe68) | Pull main, redeploy |
| Build fail với `Cannot find module 'tailwindcss'` | Cache pnpm corrupt | Trên Cloudflare: tự reinstall |
| API call trả 401 | Env vars chưa set | Set trong Dashboard, redeploy |
| CORS error | Edge Function CORS chưa handle origin | OK vì Edge Functions đã có `*` |

## 🗄️ Supabase pg_cron — Apply thủ công

DNS từ session hiện tại không resolve được `db.ituyoplyuhbdxkhabcpy.supabase.co`. Bạn cần apply migration thủ công:

### Cách 1: Supabase Dashboard SQL Editor
1. Vào https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/sql
2. Mở file `supabase/migrations/20260610100000_pg_cron_replenishment.sql`
3. Copy nội dung → paste vào SQL Editor → Run
4. Nếu lỗi `extension pg_cron is not allow-listed`, trước tiên:
   - Vào **Database** → **Extensions** → search `pg_cron` → Enable
   - Cũng enable `pg_net`
   - Quay lại SQL Editor → chạy lại

### Cách 2: psql từ máy local (nếu có)
```bash
psql "postgresql://postgres.ituyoplyuhbdxkhabcpy:Khongthanhke%40113a@db.ituyoplyuhbdxkhabcpy.supabase.co:5432/postgres" -f supabase/migrations/20260610100000_pg_cron_replenishment.sql
```

### Sau khi apply
```sql
-- Set cron token (one-time)
ALTER DATABASE postgres SET app.settings.cron_token = '<service_role_key>';
-- Get service_role key: Dashboard > Settings > API > service_role (secret)

-- Verify job scheduled
SELECT * FROM cron.job WHERE jobname = 'replenishment-month-end';

-- Test run (optional)
SELECT cron.run_job('replenishment-month-end');

-- View history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

## 🧹 Phase 6: Cleanup (sau khi Cloudflare Pages hoạt động ổn)

### Xóa Render service
1. Vào https://dashboard.render.com
2. Tìm `inventory-pro-api` (id: `srv-d8j8h248aovs73929qng`)
3. Settings → Delete service

### Xóa Vercel project
1. Vào https://vercel.com/dashboard
2. Tìm `inventory-pro-web` (hoặc `quan-ly-kho-vat-tu-pro`)
3. Settings → Delete Project

### (Optional) Xóa C# code
- `apps/api/` không còn dùng (Phase 3 đã port sang TypeScript Edge Functions)
- Có thể xóa nguyên thư mục `apps/api/` để giảm size repo
- Lưu ý: Unit tests C# (`apps/api/tests/`) cũng có thể xóa

## 📋 Final inventory

### Services (2)
1. **Supabase** (project `ituyoplyuhbdxkhabcpy`): Postgres + Auth + 10 Edge Functions + 3 Views + pg_cron + 35 tables
2. **Cloudflare Pages** (sắp có): Next.js frontend

### Repos (1)
- `github.com/TnPhtL0897/inventory-pro` (monorepo)
  - `apps/web/` — Next.js 15 frontend (Next.js 15.5.19, React 19)
  - `supabase/` — Migration files + Edge Functions + config
  - `apps/api/` — C# (legacy, có thể xóa sau Phase 6)

### Edge Functions deployed (10)
1. `auth-me` — JWT info
2. `goods-receipts` — GRN + stock_movements IN
3. `stock-issues` — Issue + stock_movements OUT
4. `stock-transfers` — Transfer + TRANSFER_IN/OUT + cancel compensation
5. `stock-takes` — Snapshot + ADJUST
6. `purchase-orders` — PO + BidContract validation + used_value
7. `purchase-requests` — PR + submit/approve
8. `replenishment` — Forecast V4
9. `bid-lots` — Lot + publish + bidders + award → contract
10. `bid-contracts` — Contract + terminate

### Tables (35) + Views (3) + Partitions (13)
- 25 cũ + 10 mới (stock, stock_movements, 6 bid_*, 2 purchase_request_*)
- v_stock_levels, v_stock_movements_history, v_low_stock_products
- stock_movements partitioned by month (2025-12 to 2026-11 + default)
