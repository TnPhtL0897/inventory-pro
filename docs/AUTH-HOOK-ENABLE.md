# Bật Custom Access Token Hook (Supabase)

## Tại sao cần
RLS policies dùng `auth_tenant_id()` (đọc từ `request.jwt.claims.tenant_id`).
JWT của demo users chưa có `tenant_id` → RLS filter hết → user thấy `[]`.
Hook sẽ inject `tenant_id`, `branch_ids`, `role_codes` vào JWT mỗi lần login.

## Function đã tạo sẵn
- Migration: `supabase/migrations/20260613160000_auth_hook_tenant_claim.sql`
- Function: `public.custom_access_token_hook(event jsonb) returns jsonb`
- Test OK: inject `tenant_id=00000000-0000-0000-0000-000000000010`, `branch_ids=[...]`, `role_codes=[...]`

## Các bước enable (qua Dashboard)

1. Mở https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy
2. Sidebar trái → **Authentication** → **Hooks**
3. Section **"Custom Access Token"** → click **"Enable"** (hoặc "Add new hook")
4. Trong dropdown **"Hook function"**, chọn `public.custom_access_token_hook`
5. Click **"Save"** / **"Enable hook"**
6. Đợi ~10-30s để Auth service restart

## Sau khi enable

Cần **logout + login lại** mọi user (JWT cũ không có claim, chỉ JWT mới phát hành sau khi hook chạy mới có):
- Web app: F5 → logout → login
- Edge function: gọi mới với token mới

## Verify hook chạy

Login lại rồi decode JWT (devtools → Application → Local Storage → sb-ituyoplyuhbdxkhabcpy-auth-token → access_token) → copy phần giữa (sau dấu `.` đầu, trước dấu `.` cuối) → base64 decode tại https://www.base64decode.org/.

Kỳ vọng trong payload:
```json
{
 "sub": "...",
 "aud": "authenticated",
 "tenant_id": "00000000-0000-0000-0000-000000000010",
 "branch_ids": ["77d26733-8717-4a1b-bd90-fa626bd283e4"],
 "role_codes": ["STAFF"],
 ...
}
```

## Nếu hook không có trong dropdown

Có nghĩa function chưa grant cho `supabase_auth_admin`. Chạy lại:
```sql
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
```

## Nếu vẫn lỗi

Check logs:
```bash
npx supabase functions logs custom-access-token-hook --project-ref ituyoplyuhbdxkhabcpy
```
hoặc Dashboard → Logs → Auth Hooks.
