# Deployment Guide — Cost = $0

Hướng dẫn deploy InventoryPro lên production **hoàn toàn miễn phí** (free tiers).

## Kiến trúc (100% free tier)

```
Internet
  ↓
[Vercel Free]   ← Web (Next.js 15)         Region: sin1 — KHÔNG pause
  ↓ /api/proxy/*
[Fly.io Free]   ← API (ASP.NET Core 8)    Region: sin — scale-to-zero, cold start ~5-15s
  ↓ PostgreSQL wire protocol
[Supabase Free] ← Database (Postgres 15)  Region: ap-southeast-1 — PAUSE sau 7 ngày không dùng
```

## Free tier limits (đã verify 2026-06)

| Service | Free tier | Hạn chế | Cách mitigate |
|---------|-----------|---------|---------------|
| **Supabase** | 500MB DB, 1GB storage, 2GB egress, 50k MAU | **Pause sau 7 ngày không có API request** | Tạo cron job (GitHub Actions) gọi `/health` mỗi 5 ngày |
| **Fly.io** | 3 shared VMs (256MB RAM mỗi), 3GB storage, 160GB egress | **Scale-to-zero sau 5 phút idle → cold start ~5-15s** | Accept (warming service qua UptimeRobot), hoặc dùng 1 VM 24/7 (free allowance đủ) |
| **Vercel** | 100GB bandwidth, 6000 build-min/tháng, 100GB-h function exec | Không pause, không có hạn chế cold start | OK cho production |

**Tổng: $0/tháng** cho đến khi vượt free tier limits (~500MB DB / 100GB BW / 3 VM). Phù hợp MVP, pilot, doanh nghiệp nhỏ.

## Yêu cầu

- Tài khoản Supabase (https://supabase.com)
- Tài khoản Fly.io (https://fly.io) — free credit $5/tháng cho VMs mới
- Tài khoản Vercel (https://vercel.com) — GitHub login OK
- Tài khoản GitHub (cho CI/CD)
- Supabase CLI, Fly CLI, Vercel CLI

---

## Bước 1: Setup Supabase (free)

### 1.1 Tạo project

1. Vào https://app.supabase.com → New project
2. Đặt tên `inventory-prod`, region **Singapore (ap-southeast-1)**
3. Đặt database password mạnh (LƯU LẠI)
4. Free plan: 500MB DB, đủ cho ~50k sản phẩm + 1M stock movements
5. Đợi provision (~2 phút)

### 1.2 Lấy credentials (Settings → API)

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ CHỈ dùng backend
- `JWT Secret` → `SUPABASE_JWT_SECRET`

Connection string (Settings → Database → Direct connection):
- `DATABASE_URL` = `postgresql://postgres:YOUR-PASSWORD@db.YOUR-REF.supabase.co:5432/postgres`

### 1.3 Apply migrations

**Cách 1: CLI (khuyến nghị)**
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push  # apply tất cả 9 migrations theo thứ tự
```

**Cách 2: Dashboard SQL Editor**
Copy nội dung từng file `infrastructure/supabase/migrations/*.sql` (0001 → 0009) vào SQL Editor chạy tuần tự.

### 1.4 Cấu hình Auth

Vào **Authentication → URL Configuration**:
- `Site URL`: `https://inventory-prod.vercel.app` (sau khi deploy Vercel)
- `Additional Redirect URLs`:
  - `https://inventory-prod.vercel.app/auth/callback`
  - `https://inventory-prod.vercel.app/login`

Tắt "Enable sign up" (chỉ admin tạo user qua Dashboard).

### 1.5 Tạo tenant đầu tiên (qua SQL Editor)

Trước tiên tạo user qua **Authentication → Users → Add user** (chọn "Auto Confirm User"). Copy `user_id` UUID.

```sql
SELECT * FROM create_tenant(
    p_name := 'Công ty Demo',
    p_slug := 'demo',
    p_admin_user_id := 'UUID-USER-VUA-TAO'
);
```

### 1.6 Chống pause: tạo GitHub Action cron (optional, recommended)

Vì Supabase free pause sau 7 ngày không dùng, tạo ping:

`.github/workflows/keep-supabase-alive.yml`:
```yaml
name: Keep Supabase alive
on:
  schedule:
    - cron: "0 */5 * * *"  # mỗi 5 ngày
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: curl -fsS "${{ secrets.SUPABASE_URL }}/rest/v1/" -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

## Bước 2: Deploy Web lên Vercel (free)

### 2.1 Kết nối GitHub (khuyến nghị)

1. Push code lên GitHub
2. Vào https://vercel.com/new → Import repo
3. Framework: Next.js (auto-detect)
4. Root Directory: để mặc định (`./`) — Vercel đọc `vercel.json` ở root
5. Build Command: `pnpm turbo run build --filter=web` (đã set trong vercel.json)
6. Click "Deploy"

### 2.2 Environment Variables

Vercel Dashboard → Project → Settings → Environment Variables, thêm (cả 3 môi trường):

```
NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY = eyJ...
SUPABASE_JWT_SECRET = ...
NEXT_PUBLIC_API_BASE_URL = https://inventory-prod.fly.dev
```

Lưu → tự động redeploy.

### 2.3 Custom domain (optional, free)

Vercel → Project → Settings → Domains → Add `inventory.vn` → follow DNS (CNAME → `cname.vercel-dns.com`).

---

## Bước 3: Deploy API lên Fly.io (free)

### 3.1 Cài Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
fly auth signup  # hoặc fly auth login
```

### 3.2 Launch app

```bash
cd /path/to/repo

# Set secrets (KHÔNG echo, KHÔNG commit)
fly secrets set \
    Supabase__Url="https://xxxxx.supabase.co" \
    Supabase__JwtSecret="your-jwt-secret" \
    Supabase__AnonKey="eyJ..." \
    Supabase__ServiceRoleKey="eyJ..." \
    ConnectionStrings__Supabase="Host=db.xxxxx.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=YOUR-PASSWORD;SslMode=Require;TrustServerCertificate=true"

# Deploy (build image từ apps/api/Dockerfile)
fly deploy
```

### 3.3 Verify

```bash
# Self check
fly curl https://inventory-prod.fly.dev/health/live
# → {"status":"Healthy"}

# DB check
fly curl https://inventory-prod.fly.dev/health/ready
```

### 3.4 Cold start mitigation (optional)

Để tránh cold start 5-15s, dùng 1 service ping từ Vercel Cron hoặc GitHub Action mỗi 3 phút (giữ VM warm).

---

## Bước 4: Wire lại URLs

Sau khi deploy xong cả 2:

1. **Update CORS** trong `apps/api/appsettings.Production.json` (commit + `fly deploy`)
2. **Update NEXT_PUBLIC_API_BASE_URL** trong Vercel (redeploy)
3. **Update Supabase Auth Site URL** trỏ về Vercel URL thật

---

## Bước 5: Setup CI/CD (optional, vẫn free)

GitHub Actions free cho public repos. Cần secrets:

```
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
FLY_API_TOKEN
SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET
```

Workflow `.github/workflows/deploy-prod.yml` (đã có) sẽ:
1. Chạy test
2. Vercel deploy
3. Fly.io deploy (bluegreen)
4. Supabase migrations
5. Smoke test

---

## Khi nào phải trả tiền?

| Trigger | Cost upgrade |
|---------|--------------|
| DB > 500MB | Supabase Pro $25/tháng (8GB) |
| Vercel BW > 100GB/tháng | Vercel Pro $20/tháng (1TB) |
| Fly VM > 3 (256MB shared) | $1.94/VM/tháng |
| Yêu cầu no-pause, no-cold-start | Cần Pro tiers |

**Khi nào KHÔNG cần trả**:
- Doanh nghiệp < 50 users
- DB < 500MB (≈ 50k products + 1M stock movements)
- < 100GB BW/tháng
- Accept cold start ~10s cho API

---

## Backup & Recovery (free)

### Manual backup

```bash
# Dump DB
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql

# Restore
psql "$DATABASE_URL" < backup-2026-06-06.sql
```

### Supabase built-in backup

Supabase free **KHÔNG có** automatic backup. Nếu cần, upgrade Pro hoặc tự setup cron với pg_dump → upload lên S3/R2 free tier.

### Recovery RPO/RTO

- RPO: 0 nếu bạn backup manual hàng ngày
- RTO: 30 phút (restore + redeploy)

---

## Troubleshooting

### API không start

```bash
fly logs -a inventory-prod
# Check:
# - ConnectionStrings__Supabase đúng chưa?
# - Supabase project còn active không (paused)?
```

### Supabase bị pause

Vào https://app.supabase.com → project → "Restore" (free, mất ~1 phút). Sau đó redeploy API.

### CORS errors

Update `apps/api/appsettings.Production.json` thêm Vercel domain vào `Cors.AllowedOrigins`, commit + `fly deploy`.

### Web không call được API

Check `NEXT_PUBLIC_API_BASE_URL` đúng. Nếu dùng `/api/proxy/*` rewrite trong `vercel.json` thì không cần env var này.

### Cold start timeout

Cold start Fly.io ~5-15s. Set Vercel fetch timeout 30s trong `next.config.ts` rewrites.

---

## Kết luận

**Cost = $0 tuyệt đối** nếu:
- DB < 500MB (~50k records)
- BW < 100GB/tháng (~10k users/tháng)
- Accept Supabase pause sau 7 ngày (workaround: ping cron)
- Accept Fly.io cold start ~10s

Nếu vượt limits → upgrade lên Pro từng service độc lập, vẫn rẻ hơn nhiều so với AWS/Cloud full-managed.
