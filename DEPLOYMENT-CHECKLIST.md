# 🚀 DEPLOYMENT CHECKLIST - Quản lý Kho vật tư Pro v1.0.0

> **Trạng thái**: ✅ SẴN SÀNG DEPLOY
> **Commit**: `1cf78fb` - feat: initial production release v1.0.0
> **Ngày**: 2026-06-07

---

## ✅ FINAL AUDIT (Pre-deploy)

| Hạng mục | Trạng thái | Chi tiết |
|----------|-----------|---------|
| TypeScript type-check | ✅ PASS | 3/3 packages (web, shared-types, validation) - 0 errors |
| Production build (web) | ✅ PASS | 25/25 routes, 0 errors |
| Smoke test 16 routes | ✅ **16/16 PASS** | /dashboard, /inventory/*, /bidding/*, /replenishment, /transfers, /stock-takes, /warehouses, /parties, /purchase-orders, /goods-receipts, /stock-issues |
| Git repo | ✅ Initialized | Commit `1cf78fb` với 331 files |
| Sensitive data | ✅ Excluded | `Dữ liệu Demo/` (BV data) + `.turbo/` đã bị ignore |
| Env files | ✅ Templates ready | `.env.example`, `.env.production.example` |
| Deploy configs | ✅ Ready | Dockerfile, fly.toml, vercel.json |
| Documentation | ✅ Complete | DEPLOY-GUIDE.md, CHANGELOG.md, README.md |

### Lỗi đã fix trong audit:
- ✅ Fixed `packages/shared-types/tsconfig.json` - thêm `rootDir: "./src"` để type-check pass
- ✅ Smoke test chạy đúng port 3000 (dev server mặc định của Next.js)
- ✅ Loại bỏ `Dữ liệu Demo/` (data BV thật) + `.turbo/` cache khỏi git

---

## 📦 STACK TRIỂN KHAI

| Service | Provider | Free tier | URL mẫu |
|---------|----------|-----------|---------|
| **Frontend** (Next.js 15) | Vercel | 100 GB bandwidth | `https://inventory-pro.vercel.app` |
| **Backend** (ASP.NET Core 8) | Render / Fly.io | 750 hrs/month | `https://inventory-pro-api.onrender.com` |
| **Database** (PostgreSQL) | Supabase | 500 MB | (Supabase Dashboard) |
| **Auth + Storage** | Supabase | 50k MAU + 1 GB | (built-in) |
| **Git** | GitHub | Unlimited public repos | `https://github.com/YOUR-USER/inventory-pro` |

**Tổng chi phí: $0/tháng** ✅

---

## 🔧 BƯỚC TRIỂN KHAI (3 options)

### **Option A: Vercel + Render (Khuyến nghị - dễ nhất)**

#### A1. GitHub (1 phút)
```bash
# 1. Tạo repo trống trên GitHub: https://github.com/new
#    Tên: inventory-pro, Public, KHÔNG init README

# 2. Push code lên
cd "D:/Tự động hóa/Quản kho vật tư Pro"
git remote add origin https://github.com/YOUR-USER/inventory-pro.git
git push -u origin main
```

#### A2. Supabase (5 phút)
1. Vào https://supabase.com → Sign in with GitHub
2. **New project** → tên `inventory-pro`, region Singapore
3. Lưu **Database Password** + copy **Project URL** + **anon key** + **service_role key**
4. **SQL Editor → New query**, chạy tuần tự:
   ```
   infrastructure/supabase/migrations/0001_*.sql
   0002_*.sql
   0003_*.sql
   0004_*.sql
   0005_transfers.sql
   0006_stock_takes.sql
   0007_warehouse_type.sql
   0008_bidding.sql
   0011_replenishment.sql
   ```
   (Bỏ qua 0009, 0010 nếu có - chỉ cần các file tồn tại)
5. (Optional) **Authentication → Users → Add user** để có account test

#### A3. Backend lên Render (10 phút)
1. Vào https://render.com → Sign in with GitHub
2. **New → Web Service** → chọn repo `inventory-pro`
3. Settings:
   - **Root Directory**: `apps/api/src/InventoryPro.API`
   - **Runtime**: Docker
   - **Dockerfile Path**: `apps/api/src/InventoryPro.API/Dockerfile`
   - **Instance Type**: Free
4. Environment Variables:
   ```
   ASPNETCORE_ENVIRONMENT=Production
   ASPNETCORE_URLS=http://+:10000
   Supabase__Url=<URL từ A2>
   Supabase__JwtSecret=<JWT secret>
   Supabase__ServiceRoleKey=<service_role key>
   ConnectionStrings__Supabase=<database connection string>
   Cors__AllowedOrigins__0=https://inventory-pro.vercel.app
   Replenishment__Enabled=true
   ```
5. **Deploy** → đợi 5-10 phút

#### A4. Frontend lên Vercel (5 phút)
1. Vào https://vercel.com → Sign in with GitHub
2. **New Project** → Import `inventory-pro`
3. Settings:
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm install && cd apps/web && pnpm build`
   - **Output Directory**: `.next`
4. Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<URL từ A2>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   NEXT_PUBLIC_API_BASE_URL=<URL Render từ A3>
   ```
5. **Deploy** → đợi 3-5 phút

#### A5. Verify (2 phút)
- Mở `https://inventory-pro.vercel.app` → login
- Click "Tổng quan" → dashboard render
- Click "Dự trù cuối tháng" → mở dialog

---

### **Option B: Fly.io + Cloudflare Pages (1 platform cho cả 2)**

Xem chi tiết trong `DEPLOY-GUIDE.md` section "Option B".

---

### **Option C: Tự host (Docker)**

```bash
# Backend
cd apps/api/src/InventoryPro.API
docker build -t inventory-api .
docker run -p 8080:8080 --env-file .env inventory-api

# Frontend  
cd apps/web
pnpm build
pnpm start  # port 3000
```

---

## 🔐 ENVIRONMENT VARIABLES (tổng hợp)

### Frontend (Vercel/Cloudflare)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_BASE_URL=https://api-xxx.onrender.com
```

### Backend (Render/Fly)
```bash
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://+:10000

# Supabase
Supabase__Url=https://xxx.supabase.co
Supabase__JwtSecret=super-long-secret-from-supabase
Supabase__ServiceRoleKey=eyJ...

# Database
ConnectionStrings__Supabase=postgresql://postgres.[ref]:[pwd]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# CORS
Cors__AllowedOrigins__0=https://inventory-pro.vercel.app

# Replenishment (optional)
Replenishment__Enabled=true
Replenishment__Cron=0 2 25 * *
```

### GitHub Secrets (nếu dùng CI/CD)
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_JWT_SECRET
```

---

## 🧪 POST-DEPLOY VERIFICATION

### 1. Health check
```bash
# Backend
curl https://inventory-pro-api.onrender.com/health
# Expect: {"status":"Healthy","checks":[...]}

# Frontend
curl -I https://inventory-pro.vercel.app
# Expect: HTTP/1.1 200 OK
```

### 2. Smoke test (chạy local)
```bash
cd apps/web
pnpm smoke:prod https://inventory-pro.vercel.app
```

### 3. Manual checklist
- [ ] Login với user Supabase
- [ ] Dashboard render với 4 KPI cards
- [ ] Click "Dự trù cuối tháng" → mở dialog
- [ ] Click "Tạo dự trù tháng mới" → preview mock data
- [ ] Click "Lưu thành PR" → toast success
- [ ] Mở DevTools → Network → API calls trả 200

### 4. Auto-replenishment job
- Check Render logs: `ReplenishmentBackgroundService started. Cron: 0 2 25 * *`
- Test: Set `Replenishment__Cron=*/5 * * * *` → đợi 5 phút → check logs

---

## 🔄 ROLLBACK (nếu cần)

```bash
# Vercel: Vào Project → Deployments → click "..." → Promote to Production
# Render: Vào Service → Manual Deploy → chọn commit cũ
# Supabase: SQL Editor → chạy rollback script (nếu có)
```

---

## 📞 SUPPORT

- **DEPLOY-GUIDE.md**: Chi tiết từng bước + troubleshooting
- **CHANGELOG.md**: Lịch sử versions
- **README.md**: Tổng quan project
- **GitHub Issues**: Tạo issue nếu gặp vấn đề

---

## ✅ CHECKLIST CUỐI CÙNG

- [ ] GitHub repo created + pushed (commit `1cf78fb`)
- [ ] Supabase project created + 9 migrations applied
- [ ] Backend deployed trên Render/Fly → URL có /health = Healthy
- [ ] Frontend deployed trên Vercel → URL load được
- [ ] CORS configured (frontend URL allow)
- [ ] Smoke test 16/16 routes pass
- [ ] Login thành công
- [ ] Manual checklist ở trên đều pass
- [ ] Auto-replenishment job logs OK (nếu enable)

🎉 **Sau khi hoàn thành, hệ thống sẵn sàng production!**
