# Hướng dẫn cleanup legacy (.NET + Render + Vercel)

Sau khi Worker rewrite hoàn tất, có thể xóa các service cũ:

## 1. Xóa Backend .NET (apps/api/)

### Local
```bash
cd "D:/Tự động hóa/Quản kho vật tư Pro"
git rm -r apps/api/
git commit -m "chore: remove legacy .NET backend (replaced by api-worker)"
git push
```

### Render
1. Vào https://dashboard.render.com/web/services
2. Tìm service `quankho-api` (hoặc tên tương tự)
3. Settings → Delete Web Service
4. Confirm deletion

## 2. Xóa Vercel project

1. Vào https://vercel.com/dashboard
2. Tìm project `quankho` hoặc `inventory-pro-web`
3. Settings → General → "Delete Project"
4. Confirm

## 3. Cleanup CF Pages

Frontend đã chuyển sang Cloudflare Pages. Không cần xóa gì.

Nếu muốn remove vercel references khỏi repo:
- Xóa `.vercel/` folder (đã gitignored)
- Xóa `DEPLOY-VERCEL-GUIDE.md` (legacy)

## 4. Cập nhật docs

- `DEPLOY-VERCEL-GUIDE.md` → đổi tên thành `DEPLOY-WORKER-GUIDE.md`
- `README.md` → cập nhật phần Deploy (bỏ Vercel, chỉ giữ CF Pages + CF Workers)

## 5. Verify cleanup

Sau khi xóa:
- Frontend vẫn chạy ở `https://quankho.pages.dev` (CF Pages)
- API vẫn chạy ở `https://quankho-api.letanphatptt.workers.dev` (CF Workers)
- DB vẫn ở Supabase
- Tất cả endpoints vẫn hoạt động (chỉ gọi Worker thay vì .NET)

## 6. Cost savings

- Xóa Render: tiết kiệm $7-25/tháng (tùy plan)
- Xóa Vercel: free tier không tốn, nhưng giảm complexity
- Worker + Pages: vẫn free tier
