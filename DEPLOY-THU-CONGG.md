# 🚀 HƯỚNG DẪN DEPLOY THỦ CÔNG (Qua Browser)

> **Dành cho người mới - làm theo từng bước, không cần biết lập trình**

## 📋 Tổng quan

Bạn sẽ làm 5 bước trên browser. Mỗi bước mở 1 tab mới.

| Bước | Làm gì | Thời gian | Cần gì |
|------|--------|-----------|--------|
| 1 | Upload code lên GitHub | 5 phút | Tài khoản GitHub |
| 2 | Tạo database trên Supabase | 7 phút | Tài khoản Supabase |
| 3 | Deploy frontend lên Vercel | 5 phút | Tài khoản Vercel (login bằng GitHub) |
| 4 | Deploy backend lên Render | 5 phút | Tài khoản Render (login bằng GitHub) |
| 5 | Kiểm tra app chạy | 2 phút | - |

**Tổng: ~25 phút, chi phí $0/tháng**

---

## BƯỚC 1: Upload code lên GitHub (5 phút)

### 1.1. Tạo repo mới trên GitHub

1. Mở browser, vào: **https://github.com/new**
2. Đăng nhập nếu chưa (tạo tài khoản GitHub free nếu chưa có)
3. Điền form:
   - **Repository name**: gõ `quan-ly-kho-vat-tu`
   - **Description**: gõ `Quản lý kho vật tư Pro - BV Trường ĐHYD Cần Thơ`
   - Chọn **Public** (miễn phí, ai cũng xem được)
   - **KHÔNG tick** "Add a README file"
   - **KHÔNG tick** "Add .gitignore"
   - **KHÔNG chọn** license
4. Click nút xanh **"Create repository"**

### 1.2. Upload code

Sau khi tạo repo, GitHub sẽ hiện trang trống. Bạn sẽ thấy 1 dòng chữ:

> "uploading an existing file" - click vào link đó

Hoặc click nút **"Add file"** → **"Upload files"**

### 1.3. Kéo thả files

1. Mở File Explorer (Windows + E)
2. Vào folder: `D:\Tự động hóa\Quản kho vật tư Pro\deploy-package`
3. **Chọn tất cả** (Ctrl + A) bên trong folder đó
4. **Kéo thả** vào ô "Drag files here" trên trang GitHub

**Lưu ý**: KHÔNG kéo cả folder `deploy-package`, mà chỉ kéo CÁC FILE bên trong.

### 1.4. Commit

- Kéo xong, GitHub sẽ tự động list tất cả files (~600 files, cuộn xuống xem)
- Ô **"Commit changes"** ở dưới cùng:
  - Message: gõ `Initial commit`
- Click nút xanh **"Commit changes"**

### 1.5. Đợi upload

- Thanh progress sẽ chạy (~2-3 phút cho 3 MB)
- Khi xong, bạn thấy danh sách files - thành công!

**URL repo của bạn sẽ có dạng**:
`https://github.com/TEN-GITHUB-USERNAME/quan-ly-kho-vat-tu`

→ **GHI NHỚ URL NÀY** cho bước sau.

---

## BƯỚC 2: Tạo database trên Supabase (7 phút)

### 2.1. Tạo project

1. Mở: **https://supabase.com**
2. Click **"Start your project"** (hoặc Sign in nếu đã có account)
3. Đăng ký bằng GitHub cho nhanh
4. Click **"New Project"**
5. Điền:
   - **Name**: `inventory-pro`
   - **Database Password**: gõ mật khẩu mạnh (VD: `KhoVatTu@2026!`) → **GHI LẠI MẬT KHẨU NÀY**
   - **Region**: chọn **Singapore** (gần VN)
6. Click **"Create new project"**
7. Đợi ~2 phút (Supabase tạo database)

### 2.2. Lấy connection info

Khi project ready:

1. Vào **Settings** (icon bánh răng ⚙️ ở sidebar trái) → **API**
2. Bạn sẽ thấy 3 thông tin quan trọng:
   - **Project URL**: `https://abcdefghijk.supabase.co` → **COPY**
   - **anon public key**: dãy `eyJ...` rất dài → **COPY**
   - **service_role key**: dãy `eyJ...` khác → **COPY** (click "Reveal" trước)

3. Mở Notepad trên máy, paste 3 thứ này:
```
SUPABASE_URL = https://abcdefghijk.supabase.co
ANON_KEY = eyJhbGc...
SERVICE_ROLE_KEY = eyJhbGc...
```

### 2.3. Apply database schema (9 file SQL)

1. Trong Supabase Dashboard, click **"SQL Editor"** ở sidebar trái
2. Click **"New query"** (nút + bên góc trên)

**Áp dụng TỪNG FILE theo thứ tự**:

3. Mở File Explorer: `D:\Tự động hóa\Quản kho vật tư Pro\deploy-package\infrastructure\supabase\migrations\`

4. Bạn sẽ thấy các file `0001_xxx.sql`, `0002_xxx.sql`, ... Mở file `0001_xxx.sql` bằng Notepad

5. **Ctrl + A** (chọn tất cả) → **Ctrl + C** (copy)

6. Quay lại Supabase SQL Editor → **Ctrl + V** (paste vào ô SQL)

7. Click nút **"Run"** (góc phải) - đợi ~5 giây

8. Khi thấy "Success. No rows returned" → OK, file đó đã apply

9. **Lặp lại** cho file tiếp theo (0002, 0003, ... 0011)

**Danh sách file cần apply (theo thứ tự)**:
- 0001_xxx.sql
- 0002_xxx.sql
- 0003_xxx.sql
- 0004_xxx.sql
- 0005_transfers.sql
- 0006_stock_takes.sql
- 0007_warehouse_type.sql
- 0008_bidding.sql
- 0011_replenishment.sql

(Số file 0009, 0010 có thể không có - bỏ qua)

---

## BƯỚC 3: Deploy frontend lên Vercel (5 phút)

### 3.1. Import project

1. Mở: **https://vercel.com**
2. Click **"Sign Up"** → chọn **"Continue with GitHub"** (dùng cùng account GitHub)
3. Sau khi login, click **"Add New..."** → **"Project"**
4. Bạn sẽ thấy danh sách repo GitHub của bạn
5. Tìm repo **`quan-ly-kho-vat-tu`** → click **"Import"**

### 3.2. Cấu hình project

Trang cấu hình hiện ra:

1. **Project Name**: để mặc định `quan-ly-kho-vat-tu`

2. **Root Directory**: click **"Edit"** → gõ `apps/web` → OK

3. **Build Command**: để trống (Vercel tự detect Next.js)

4. **Output Directory**: để trống

### 3.3. Set environment variables

Kéo xuống phần **"Environment Variables"**, thêm 3 biến:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | (paste SUPABASE_URL từ Notepad) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (paste ANON_KEY từ Notepad) |
| `NEXT_PUBLIC_API_BASE_URL` | `https://PLACEHOLDER.onrender.com` (sẽ sửa sau khi deploy backend) |

**Lưu ý**: `PLACEHOLDER` sẽ sửa sau. Để tạm, deploy trước.

### 3.4. Deploy

- Click nút **"Deploy"**
- Đợi 2-3 phút (Vercel build + deploy)
- Khi thấy 🎉 "Congratulations!" → thành công

### 3.5. Lấy URL

- Click **"Continue to Dashboard"**
- Bạn sẽ thấy URL dạng: **`https://quan-ly-kho-vat-tu.vercel.app`**
- **COPY URL NÀY** cho bước 4

---

## BƯỚC 4: Deploy backend lên Render (5 phút)

### 4.1. Tạo Web Service

1. Mở: **https://render.com**
2. Click **"Get Started for Free"** → Sign up bằng GitHub
3. Dashboard → click **"New +"** → **"Web Service"**
4. Tìm repo **`quan-ly-kho-vat-tu`** → click **"Connect"**

### 4.2. Cấu hình

| Field | Value |
|-------|-------|
| **Name** | `inventory-pro-api` |
| **Region** | `Singapore` |
| **Branch** | `main` |
| **Root Directory** | `apps/api/src/InventoryPro.API` |
| **Runtime** | `Docker` |
| **Instance Type** | `Free` |

### 4.3. Set environment variables

Kéo xuống **"Environment Variables"**, click **"Add Environment Variable"** thêm từng cái:

| Key | Value |
|-----|-------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ASPNETCORE_URLS` | `http://+:10000` |
| `Supabase__Url` | (paste SUPABASE_URL) |
| `Supabase__JwtSecret` | (lấy từ Supabase Settings → API → JWT Secret) |
| `Supabase__ServiceRoleKey` | (paste SERVICE_ROLE_KEY) |
| `ConnectionStrings__Supabase` | (lấy từ Supabase Settings → Database → Connection string) |
| `Cors__AllowedOrigins__0` | (paste URL Vercel từ bước 3.5) |
| `Replenishment__Enabled` | `true` |

**Cách lấy JWT Secret**:
- Quay lại Supabase Dashboard → Settings → API
- Tìm dòng **"JWT Secret"** → click "Reveal" → copy

**Cách lấy Connection String**:
- Supabase Dashboard → Settings → Database
- Tìm **"Connection string"** → chọn tab "URI"
- Copy string dạng: `postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
- **Thay `[YOUR-PASSWORD]`** bằng mật khẩu database bạn đã đặt ở bước 2.1

### 4.4. Deploy

- Click **"Create Web Service"**
- Đợi 5-10 phút (Render build Docker image)
- Khi thấy "Live" màu xanh → thành công!

### 4.5. Lấy URL backend

- URL có dạng: **`https://inventory-pro-api.onrender.com`**
- **COPY URL NÀY**

### 4.6. Update Vercel env var

1. Quay lại **Vercel Dashboard** → project `quan-ly-kho-vat-tu` → **Settings** → **Environment Variables**
2. Sửa `NEXT_PUBLIC_API_BASE_URL` từ `https://PLACEHOLDER.onrender.com` → **`https://inventory-pro-api.onrender.com`** (URL backend vừa copy)
3. Click **"Save"**
4. Vào tab **"Deployments"** → click **"..."** trên deployment mới nhất → **"Redeploy"**

---

## BƯỚC 5: Kiểm tra (2 phút)

### 5.1. Test backend

Mở browser, vào URL:
```
https://inventory-pro-api.onrender.com/health
```

Kết quả mong đợi: `{"status":"Healthy",...}` ✅

### 5.2. Test frontend

Mở URL Vercel:
```
https://quan-ly-kho-vat-tu.vercel.app
```

Bạn sẽ thấy trang login. Đăng nhập với user đã tạo trong Supabase (Settings → Authentication → Users → Add user).

### 5.3. Test tính năng

- Click **"Tổng quan"** → dashboard render
- Click **"Dự trù cuối tháng"** → mở dialog preview
- Click **"Tạo dự trù tháng mới"** → hiển thị forecast mock

---

## 🎉 HOÀN TẤT!

| Service | URL | Status |
|---------|-----|--------|
| GitHub | `https://github.com/USERNAME/quan-ly-kho-vat-tu` | ✅ |
| Supabase | (Dashboard) | ✅ |
| Backend | `https://inventory-pro-api.onrender.com` | ✅ |
| Frontend | `https://quan-ly-kho-vat-tu.vercel.app` | ✅ |

**Chi phí: $0/tháng** 🎉

---

## 🆘 Gặp lỗi?

### Frontend trắng trang / 500
- Mở Vercel → project → Logs → xem lỗi
- Thường do env var sai → kiểm tra lại

### Backend không start
- Mở Render → service → Logs
- Thường do Connection String sai → kiểm tra password

### Login không được
- Vào Supabase → Authentication → Users → Add user manually
- Tạo user với email + password

### Cần giúp đỡ
- Cho tôi biết bước nào đang bị lỗi
- Gửi kèm screenshot (nếu có)
