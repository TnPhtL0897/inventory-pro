# 🚀 Hướng dẫn Deploy lên Vercel (5 phút)

## Tại sao chọn Vercel?

- ✅ **Native Next.js** - không cần adapter (CF Pages đã thử nhiều cách fail)
- ✅ **Free tier** - 100GB bandwidth, đủ cho internal app
- ✅ **Auto-deploy** - push code → Vercel tự build
- ✅ **Edge runtime support** - giữ nguyên được `runtime = "edge"`

## Setup 1 lần (qua browser)

### Bước 1: Vào Vercel
- Truy cập: **https://vercel.com/new**

### Bước 2: Sign in
- Click **"Sign Up"** hoặc **"Login"**
- Chọn **"Continue with GitHub"**
- Authorize Vercel truy cập GitHub account `TnPhtL0897`

### Bước 3: Import Repository
- Tìm repo **`inventory-pro`** trong danh sách
- Click **"Import"** bên phải

### Bước 4: Configure Project
| Field | Value |
|---|---|
| **Project Name** | `quankho` (sẽ có URL `quankho.vercel.app`) |
| **Framework Preset** | `Next.js` (auto-detect) |
| **Root Directory** | Click `Edit` → chọn `apps/web` |
| **Build Command** | (để trống - dùng default `next build`) |
| **Output Directory** | (để trống - dùng default `.next`) |
| **Install Command** | (để trống - dùng default `npm install`) |

### Bước 5: Environment Variables
Click **"Environment Variables"** và thêm 3 biến sau:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ituyoplyuhbdxkhabcpy.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0dXlvcGx5dWhiZHhraGFiY3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI3NjAsImV4cCI6MjA5NjQ3ODc2MH0.S9DTQEunvApbhhxJUiLvM4IIs8AW1ZfI5jYyLHXgiEU` | Production, Preview, Development |
| `NEXT_PUBLIC_API_BASE_URL` | (để trống hoặc `https://quankho-api.onrender.com` nếu đã deploy API) | Production |

### Bước 6: Deploy
- Click **"Deploy"**
- Đợi 2-3 phút để Vercel clone repo + install + build

### Bước 7: Verify
- Sau khi build xong, click **"Visit"** để mở production URL
- URL: **https://quankho.vercel.app** (hoặc tên khác nếu bạn đổi)
- Test login: `ltphat.bv@ctump.edu.vn` / `Welcome@2026`

## Auto-deploy sau này

Mỗi lần bạn push code lên GitHub `main`:
- Vercel **TỰ ĐỘNG** build + deploy
- Xem trạng thái tại: https://vercel.com/dashboard
- Mỗi deploy có URL riêng (preview)
- Deploy lên `main` = production URL

## Rollback nếu cần

- Vào **Deployments** tab
- Click deployment cũ OK
- Click **"Promote to Production"**

## Tại sao CF Pages bỏ?

| CF Pages | Vercel |
|---|---|
| Cần `@cloudflare/next-on-pages` (cũ, dùng Vercel CLI nội bộ → fail) | Native Next.js |
| Hoặc `@opennextjs/cloudflare` (edge runtime conflict) | Edge runtime works out of box |
| Build phức tạp, nhiều compatibility flags | Zero config |
| Khó debug log | Log chi tiết + build cache |

## Files thay đổi

- ✅ `apps/web/package.json` - bỏ `@cloudflare/next-on-pages`, `@opennextjs/cloudflare`
- ✅ `apps/web/wrangler.toml` - keep as reference, không dùng để build
- ✅ Code KHÔNG đổi - tất cả pages vẫn có `runtime = "edge"` (Vercel support)
