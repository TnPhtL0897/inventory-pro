# Hướng dẫn Deploy - Quản lý Kho vật tư Pro

Tài liệu này hướng dẫn deploy lên **GitHub + Supabase + Cloudflare** (free tier combo, $0/tháng).

> **Tổng quan stack:**
> - **Frontend (Next.js 15)**: Vercel (miễn phí) hoặc Cloudflare Pages
> - **Backend (ASP.NET Core 8)**: Render / Fly.io / Railway (free tier)
> - **Database (PostgreSQL)**: Supabase (500 MB free)
> - **Storage**: Supabase Storage (1 GB free)
> - **Auth**: Supabase Auth (50k MAU free)

---

## 1. Chuẩn bị

### Tài khoản cần có
- [x] GitHub (repo chứa source code)
- [x] Supabase (database + auth + storage)
- [x] Vercel hoặc Cloudflare Pages (frontend hosting)
- [x] Render / Fly.io / Railway (backend hosting)

### Domain (optional)
Nếu có domain riêng (vd: `quanlykho.example.vn`), trỏ DNS về Vercel/Cloudflare.
Nếu không, dùng subdomain free: `*.vercel.app` hoặc `*.pages.dev`.

---

## 2. Setup Supabase

### 2.1. Tạo project Supabase
1. Vào https://supabase.com → Sign in with GitHub
2. **New project** → đặt tên `inventory-pro`, chọn region gần VN nhất (Singapore `ap-southeast-1`)
3. Lưu **Database Password** (sẽ cần cho connection string)

### 2.2. Apply migrations (theo thứ tự)

Mở **Supabase Dashboard → SQL Editor → New query**, chạy tuần tự:

```bash
# 0001: tạo bảng tenants, users, RLS
# Copy nội dung file infrastructure/supabase/migrations/0001_init_tenants_users_rls.sql
# Paste vào SQL Editor → Run

# 0002-0010: tương tự - chạy lần lượt từng file theo thứ tự số
# (KHÔNG chạy 0010_bidding.sql nếu chưa có data mẫu - chỉ cần chạy cho production đầy đủ)
```

**Lưu ý quan trọng:** Migration `0011_replenishment.sql` (cho tính năng Dự trù cuối tháng) **BẮT BUỘC** phải apply nếu muốn dùng tính năng này. Nếu chưa apply, các API endpoint `/api/v1/replenishment/*` sẽ trả 500.

### 2.3. Lấy connection string
Vào **Project Settings → Database → Connection string → URI**:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

### 2.4. Lấy API keys
Vào **Project Settings → API**:
- `Project URL` (vd: `https://abcdefgh.supabase.co`)
- `anon public` key (cho frontend)
- `service_role` key (cho backend - BẢO MẬT, không public!)

---

## 3. Setup GitHub repo

### 3.1. Push code lên GitHub

```bash
cd "D:/Tự động hóa/Quản kho vật tư Pro"
git init  # nếu chưa có
git add .
git commit -m "Initial commit: bidding + replenishment modules"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/inventory-pro.git
git push -u origin main
```

### 3.2. Setup GitHub Secrets (cho CI/CD)

Vào **GitHub → repo → Settings → Secrets and variables → Actions**, thêm:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | `https://abcdefgh.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` (anon public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role key) |
| `SUPABASE_DB_URL` | `postgresql://postgres.[ref]:[pwd]@...pooler.supabase.com:6543/postgres` |
| `SUPABASE_JWT_SECRET` | (JWT secret từ Supabase Settings → API → JWT Settings) |

---

## 4. Setup Backend (ASP.NET Core 8)

### Option A: Render.com (Recommended - free tier)

1. Vào https://render.com → Sign in with GitHub
2. **New → Web Service** → chọn repo `inventory-pro`
3. **Settings**:
   - **Root Directory**: `apps/api/src/InventoryPro.API`
   - **Runtime**: Docker
   - **Build Command**: (để trống - Docker tự xử lý)
   - **Dockerfile Path**: `apps/api/src/InventoryPro.API/Dockerfile`
4. **Environment Variables** (thêm các biến):
   ```
   ASPNETCORE_ENVIRONMENT=Production
   ASPNETCORE_URLS=http://+:10000
   Supabase__Url=<SUPABASE_URL>
   Supabase__JwtSecret=<JWT_SECRET>
   Supabase__AnonKey=<ANON_KEY>
   Supabase__ServiceRoleKey=<SERVICE_ROLE_KEY>
   ConnectionStrings__Supabase=<DATABASE_URL>
   Replenishment__Enabled=true
   Replenishment__Cron=0 2 25 * *
   RateLimit__PerMinute=100
   RateLimit__PerHour=1000
   Cors__AllowedOrigins__0=https://your-frontend.vercel.app
   ```
5. **Instance Type**: Free
6. **Deploy** → đợi 5-10 phút

### Option B: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth signup  # hoặc fly auth login

# Deploy (đã có fly.toml sẵn)
cd apps/api
fly launch --name inventory-pro-api --region sin
fly secrets set \
  Supabase__Url="..." \
  Supabase__JwtSecret="..." \
  Supabase__ServiceRoleKey="..." \
  ConnectionStrings__Supabase="..." \
  Replenishment__Enabled=true
fly deploy
```

### Option C: Railway.app

1. https://railway.app → New Project → Deploy from GitHub repo
2. Chọn `apps/api/src/InventoryPro.API` làm root
3. Thêm Environment Variables (giống Render)
4. Railway tự detect Dockerfile

---

## 5. Setup Frontend (Next.js 15)

### Option A: Vercel (Recommended)

1. Vào https://vercel.com → Sign in with GitHub
2. **New Project** → Import repo `inventory-pro`
3. **Settings**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm install && cd apps/web && pnpm build`
   - **Output Directory**: `.next`
4. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_BASE_URL=https://inventory-pro-api.onrender.com
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
5. **Deploy** → đợi 3-5 phút
6. Sau khi deploy xong, copy URL (vd: `https://inventory-pro.vercel.app`)

### Option B: Cloudflare Pages

```bash
# Install wrangler
npm install -g wrangler
wrangler login

# Build trước
cd apps/web
pnpm build

# Deploy
wrangler pages deploy .next --project-name=inventory-pro
```

---

## 6. Cấu hình CORS

Sau khi deploy frontend, cập nhật CORS trong backend:

1. Vào Render Dashboard → service → Environment
2. Cập nhật biến `Cors__AllowedOrigins__0` = URL frontend (vd: `https://inventory-pro.vercel.app`)
3. Restart service

---

## 7. Post-deploy verification

### 7.1. Smoke test (chạy trên local)

```bash
cd apps/web
pnpm smoke:prod  # test routes on production URL
```

### 7.2. Manual test checklist

- [ ] Mở frontend URL → redirect đến `/login`
- [ ] Đăng nhập với user đã tạo trong Supabase Auth
- [ ] Click "Tổng quan" → dashboard render với counters
- [ ] Click "Kho" → thấy danh sách kho (RECEIVING/ISSUE)
- [ ] Click "Đấu thầu" → "Hợp đồng thầu" → thấy HĐ
- [ ] Click "Dự trù cuối tháng" → mở dialog preview
- [ ] Tạo 1 dự trù tháng → verify toast success
- [ ] Mở DevTools → Network tab → verify API calls trả 200

### 7.3. Health check

```bash
# Backend
curl https://inventory-pro-api.onrender.com/health
# Expect: {"status":"Healthy","checks":[...]}

# Frontend
curl -I https://inventory-pro.vercel.app
# Expect: HTTP/1.1 200 OK
```

---

## 8. Auto-Replenishment job

Sau khi deploy production, **BackgroundService** sẽ tự chạy theo cron `0 2 25 * *` (2h sáng ngày 25 hàng tháng).

**Kiểm tra job đang chạy:**

1. Vào Render Dashboard → service → Logs
2. Tìm dòng: `ReplenishmentBackgroundService started. Cron: 0 2 25 * *`
3. Sau khi chạy: `Replenishment: tenant {id} completed. Lines=X, TotalValue=Y, PRs=Z`

**Disable auto job** (chạy manual only):
- Set `Replenishment__Enabled=false` trong Environment Variables → Restart

---

## 9. Backup & Monitoring

### 9.1. Database backup
Supabase tự động backup daily (free tier: 7 days retention). Production tier: 30 days.

### 9.2. Monitoring
- **Backend**: Render Dashboard (CPU, memory, requests)
- **Frontend**: Vercel Analytics
- **Database**: Supabase Dashboard → Database → Metrics

---

## 10. Tổng kết

| Service | Provider | Free tier | URL |
|---|---|---|---|
| Frontend | Vercel | 100 GB bandwidth | https://inventory-pro.vercel.app |
| Backend | Render | 750 hrs/month | https://inventory-pro-api.onrender.com |
| Database | Supabase | 500 MB | (Supabase Dashboard) |
| Auth | Supabase | 50k MAU | (built-in) |

**Tổng chi phí: $0/tháng** ✅

---

## 11. Troubleshooting

### Lỗi: CORS khi gọi API từ frontend
- Verify `Cors__AllowedOrigins__0` trong backend env đúng URL frontend
- Restart backend sau khi đổi

### Lỗi: 401 Unauthorized
- Verify `SUPABASE_JWT_SECRET` trong backend env đúng với Supabase project
- Check token trong DevTools → Application → Cookies

### Lỗi: API trả 500 cho /api/v1/replenishment/*
- Verify migration `0011_replenishment.sql` đã apply
- Check backend logs cho SQL exception

### Lỗi: BackgroundService không chạy
- Verify `Replenishment__Enabled=true` trong backend env
- Check logs cho "ReplenishmentBackgroundService started"

### Lỗi: Build frontend fail trên Vercel
- Verify `NEXT_PUBLIC_API_BASE_URL` đã set
- Check build logs cho TypeScript errors

---

## 12. Local development

```bash
# Backend
cd apps/api
dotnet run  # http://localhost:5000

# Frontend (dev mock mode, không cần backend)
cd apps/web
pnpm dev  # http://localhost:3033

# Smoke test
cd apps/web
pnpm smoke

# E2E test (cần backend chạy)
cd apps/web
pnpm e2e
```

---

**Liên hệ**: Nếu gặp vấn đề, xem `apps/api/DEPLOY-INFO.md` hoặc mở issue trên GitHub.
