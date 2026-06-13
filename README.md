# Quản lý kho vật tư Pro

Phần mềm quản lý kho vật tư chuyên nghiệp cho doanh nghiệp Việt Nam. Multi-tenant, multi-branch, hỗ trợ đầy đủ nghiệp vụ kho + tuân thủ pháp lý VN (hóa đơn điện tử, chữ ký số, sổ sách theo TT133/TT200).

## Tech stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Database & Auth**: Supabase (PostgreSQL 15 + Auth + Storage + Realtime + Edge Functions)
- **Monorepo**: pnpm + Turborepo
- **Validation**: Zod
- **Testing**: vitest
- **Deploy**: Cloudflare Pages (web) + Supabase Cloud (DB + edge functions)

## Cấu trúc

```
apps/
 web/ - Next.js 15 web app
packages/
 shared-types/ - TS types (Supabase generated)
 validation/ - Zod schemas
 tsconfig/ - Shared TypeScript configs
 eslint-config/ - Shared ESLint configs
supabase/
 migrations/ - SQL migrations (apply lên Supabase Cloud)
 functions/ - Deno edge functions (compute-yearly-forecast, import-stock-snapshot, apply-migration)
docs/
 adr/ - Architecture Decision Records
scripts/ - Operational scripts (Python, SQL)
```

## Yêu cầu môi trường

- Node.js >= 20
- pnpm >= 9
- Supabase CLI (optional, dùng Dashboard thay thế)
- Git

## Bắt đầu nhanh

```bash
# Install deps
pnpm install

# Run dev server (web only)
pnpm dev:web

# Build production
pnpm --filter web build

# Apply migrations to Supabase
# Dùng Dashboard SQL Editor hoặc MCP apply_migration
```

## Deploy

### Web (Cloudflare Pages)
1. Connect repo `TnPhtL0897/inventory-pro` tại Cloudflare Dashboard
2. Build command: `pnpm --filter web build`
3. Output: `apps/web/.next`
4. Root: `apps/web`
5. Auto-deploy mỗi lần push `main`

### Database & Edge Functions (Supabase Cloud)
- Migrations: apply qua Dashboard SQL Editor hoặc MCP `apply_migration`
- Edge functions: deploy qua MCP `deploy_edge_function`

## Multi-tenant Auth

Mỗi user gắn với 1 tenant. RLS policies enforce tenant isolation. Custom JWT claim `tenant_id` được inject qua Auth Hook (`public.custom_access_token_hook`) — xem [docs/AUTH-HOOK-ENABLE.md](docs/AUTH-HOOK-ENABLE.md).

## License

Proprietary - © 2026 TnPhtL0897
