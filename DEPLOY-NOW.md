# 🚀 DEPLOY NOW - Hướng dẫn nhanh

> **Bạn cần 5 phút để chuẩn bị tokens, sau đó chạy 1 lệnh duy nhất để deploy toàn bộ hệ thống.**

---

## Bước 1: Tạo tokens (5 phút)

### GitHub Personal Access Token
1. Vào https://github.com/settings/tokens
2. **Generate new token → Classic**
3. Scope: chọn **`repo`** (full control)
4. Expiration: 90 days (hoặc No expiration)
5. **Copy token** (chỉ hiện 1 lần)

### Supabase Access Token
1. Vào https://supabase.com/dashboard/account/tokens
2. **Generate new token** → tên "deploy-bot"
3. **Copy token**

### Supabase Org Slug
1. Vào https://supabase.com/dashboard/organizations
2. Click vào org của bạn → URL có dạng `https://supabase.com/dashboard/org/<slug>`
3. **Copy slug** (vd: `acme-hospital`)

### Supabase DB Password
- Đặt password mạnh cho project mới (vd: `MyP@ssw0rd_2026!`)

### Render API Key
1. Vào https://dashboard.render.com/u/account#api-keys
2. **Create API Key** → tên "deploy-bot"
3. **Copy API key**

### Vercel Token
1. Vào https://vercel.com/account/tokens
2. **Create Token** → tên "deploy-bot", scope Full
3. **Copy token**

---

## Bước 2: Set tokens (30 giây)

Mở PowerShell tại thư mục project:

```powershell
cd "D:\Tự động hóa\Quản kho vật tư Pro"

$env:GH_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxx"
$env:GH_USER = "your-github-username"
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxxxxxxxxxxxxxxxxxxx"
$env:SUPABASE_ORG = "your-org-slug"
$env:SUPABASE_DB_PASSWORD = "MyP@ssw0rd_2026!"
$env:RENDER_API_KEY = "rnd_xxxxxxxxxxxxxxxxxxxx"
$env:VERCEL_TOKEN = "xxxxxxxxxxxxxxxxxxxx"
```

> 💡 **Tip**: Lưu file này thành `deploy-secrets.ps1` (KHÔNG commit) để dùng lại.

---

## Bước 3: Test với dry-run (1 phút)

```powershell
powershell -ExecutionPolicy Bypass -File deploy-auto.ps1 -DryRun
```

Output mong đợi:
```
=== Pre-check ===
[OK] git found
[OK] pnpm found
[OK] node v24.x
[OK] curl found
[OK] All required tokens present

=== Step 1/5: Push to GitHub ===
[WARN] [DRY-RUN] Would create repo inventory-pro
...
```

---

## Bước 4: Deploy thật (5-10 phút)

```powershell
powershell -ExecutionPolicy Bypass -File deploy-auto.ps1
```

Script sẽ tự động:
1. ✅ Tạo GitHub repo `inventory-pro` + push code
2. ✅ Tạo Supabase project + apply 9 migrations
3. ✅ Deploy backend lên Render (Docker, free tier)
4. ✅ Deploy frontend lên Vercel (free tier)
5. ✅ Smoke test cả 2 URLs

---

## Bước 5: Hoàn tất cấu hình (3 phút)

Sau khi script xong, bạn cần copy Supabase keys vào Render + Vercel:

### Render Dashboard (backend)
1. Vào https://dashboard.render.com
2. Click service `inventory-pro-api` → Environment
3. Set thêm các biến:
   ```
   Supabase__Url = https://<project-ref>.supabase.co
   Supabase__JwtSecret = <copy từ Supabase Settings → API → JWT Secret>
   Supabase__ServiceRoleKey = <copy từ Supabase Settings → API → service_role>
   ConnectionStrings__Supabase = postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   Cors__AllowedOrigins__0 = https://inventory-pro-web.vercel.app
   ```
4. **Save → Trigger Deploy**

### Vercel Dashboard (frontend)
1. Vào https://vercel.com/dashboard
2. Click project `inventory-pro-web` → Settings → Environment Variables
3. Set:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = <copy từ Supabase Settings → API → anon public>
   NEXT_PUBLIC_API_BASE_URL = https://inventory-pro-api.onrender.com
   ```
4. **Save → Redeploy**

---

## Bước 6: Verify (1 phút)

```powershell
# Chạy smoke test trên production
cd apps/web
pnpm smoke:prod https://inventory-pro-web.vercel.app
```

Expected: **16/16 routes PASS** ✅

---

## 🎉 Hoàn tất!

| Service | URL | Status |
|---------|-----|--------|
| GitHub | https://github.com/your-username/inventory-pro | ✅ |
| Supabase | (Dashboard) | ✅ |
| Backend | https://inventory-pro-api.onrender.com | ✅ |
| Frontend | https://inventory-pro-web.vercel.app | ✅ |

**Chi phí: $0/tháng** (free tier combo)

---

## 🔄 Tái deploy (lần sau)

Sau khi đã setup xong, mỗi lần muốn update:

```powershell
# Update code
git add .
git commit -m "feat: new feature"
git push origin main

# Render + Vercel tự động rebuild + deploy
# (CD/CD đã enable khi connect GitHub repo)
```

---

## 🆘 Troubleshooting

### Lỗi: "Failed to create repo"
- Check GH_TOKEN có scope `repo`
- Check GH_USER đúng (không phải email)

### Lỗi: "Failed to create Supabase project"
- Check SUPABASE_ACCESS_TOKEN còn hiệu lực
- Check SUPABASE_ORG slug đúng
- Check region `ap-southeast-1` available cho org của bạn

### Lỗi: Render deploy fail
- Check Dockerfile path đúng: `apps/api/src/InventoryPro.API/Dockerfile`
- Check rootDir: `apps/api/src/InventoryPro.API`

### Lỗi: Vercel build fail
- Check env vars đã set
- Check `pnpm install` trong build command

### Lỗi: API trả 500
- Check backend logs: https://dashboard.render.com
- Check Supabase env vars đã set
- Check connection string đúng format

Xem thêm: `DEPLOY-GUIDE.md` section 11 (Troubleshooting)
