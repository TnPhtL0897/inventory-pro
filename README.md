# Quản kho

Phần mềm quản lý kho chuyên nghiệp cho doanh nghiệp Việt Nam. Multi-tenant, multi-branch, hỗ trợ đầy đủ nghiệp vụ kho + tuân thủ pháp lý VN.

**Khoa Xét Nghiệm** (2026-06-14): 3 module core đã code xong (Warehouse Role + Permission, Lot Lifecycle, Internal Replenishment Weekly). Xem [docs/plans/2026-06-14-khoa-xn-phase1-handoff.md](docs/plans/2026-06-14-khoa-xn-phase1-handoff.md) để biết chi tiết.

## Tech stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + React 19
- **Database & Auth**: Supabase (PostgreSQL 15 + Auth + Storage + Realtime + Edge Functions)
- **API Backend**: Cloudflare Workers (Hono + Drizzle ORM + Postgres.js) — `apps/api-worker`
- **Web hosting**: Cloudflare Pages
- **Monorepo**: pnpm + Turborepo
- **Validation**: Zod
- **Testing**: vitest + Playwright

## Cấu trúc repo

```
apps/
 web/              # Next.js 15 web app (deploy lên Cloudflare Pages)
 api-worker/       # Cloudflare Workers backend (22 modules, deploy lên CF Workers)
 desktop/          # (chưa phát triển)
 mobile/           # (chưa phát triển)
packages/
 shared-types/     # TS types dùng chung
 validation/       # Zod schemas
 tsconfig/         # Shared TypeScript configs
 eslint-config/    # Shared ESLint configs
supabase/
 migrations/       # SQL migrations (apply lên Supabase Cloud)
 functions/        # Deno edge functions
docs/
 plans/            # SPEC + handoff documents
 adr/              # Architecture Decision Records
scripts/           # Operational scripts (Python, SQL, Shell)
```

## Bắt đầu nhanh

Yêu cầu: Node.js >= 20, pnpm >= 9, Git.

```bash
# Install deps
pnpm install

# Copy env file (sửa với Supabase thật)
cp .env.example .env.local

# Run dev server
pnpm dev:web

# Type-check + build
pnpm --filter web type-check
pnpm --filter web build
pnpm --filter api-worker type-check
```

## Supabase (Database + Auth + Edge Functions)

- **Project**: `ituyoplyuhbdxkhabcpy`
- **Migrations**: 40 file SQL, apply qua Dashboard SQL Editor hoặc `scripts/apply-migrations.py`
- **Auth Hook**: `public.custom_access_token_hook` — inject `tenant_id` + `role_codes` vào JWT
- **Edge Functions**: 24+ functions, deploy qua Supabase CLI:
  ```bash
  supabase functions deploy auto-expire-lots --project-ref ituyoplyuhbdxkhabcpy
  supabase functions deploy check-lot-expirations --project-ref ituyoplyuhbdxkhabcpy
  supabase functions deploy compute-weekly-replenishment --project-ref ituyoplyuhbdxkhabcpy
  ```

## Cloudflare Workers (API Backend)

Worker tên `quankho-api` chạy ở `https://quankho-api.letanphatptt.workers.dev`.

Deploy:
```bash
cd apps/api-worker
npm run deploy
```

Cần 5 secrets trong Cloudflare Dashboard → Workers → Settings → Variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`

Cron trigger: `0 2 25 * *` (02:00 ngày 25 hàng tháng) — auto chạy replenishment cho tất cả tenants.

## Cloudflare Pages (Web Hosting)

Connect repo `TnPhtL0897/inventory-pro` tại Cloudflare Dashboard:
- **Project name**: `quankho-web`
- **Root directory**: `apps/web`
- **Build command**: `npx -y pnpm@9.12.0 install --no-frozen-lockfile && npx -y pnpm@9.12.0 build`
- **Output directory**: `.next`
- **Compatibility flags**: bật `nodejs_compat`
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Multi-tenant Auth

Mỗi user gắn với 1 tenant. RLS policies enforce tenant isolation. Custom JWT claim `tenant_id` + `role_codes` được inject qua Auth Hook — xem [docs/AUTH-HOOK-ENABLE.md](docs/AUTH-HOOK-ENABLE.md).

## Khoa XN Modules (Phase 1)

| # | Module | SPEC | Routes | Status |
|---|---|---|---|---|
| 1 | Warehouse Role + Permission | [SPEC](docs/plans/2026-06-14-warehouse-role-spec.md) | `/admin/users` | ✅ Code xong |
| 2 | Lot Lifecycle Management | [SPEC](docs/plans/2026-06-14-lot-lifecycle-spec.md) | `/lots` | ✅ Code xong |
| 3 | Internal Replenishment Weekly | [SPEC](docs/plans/2026-06-14-internal-replenishment-spec.md) | `/replenishment/weekly` | ✅ Code xong |
| 6 | FEFO Enforcement | [SPEC](docs/plans/2026-06-14-fefo-spec.md) | (chưa code) | ⏳ P0 |
| 7 | Open-Vial Tracking | [SPEC](docs/plans/2026-06-14-open-vial-spec.md) | (gộp vào Lot) | ✅ Module 2 |
| 8 | Bid Tracking | [SPEC](docs/plans/2026-06-14-bid-tracking-spec.md) | (chưa code) | ⏳ P1 |
| 9 | Audit Log Viewer | [SPEC](docs/plans/2026-06-14-audit-log-spec.md) | `/audit-log` | ✅ Code xong |

## Khoa XN Roles

| Role | Quyền |
|---|---|
| `ADMIN` | Toàn quyền |
| `DEPT_HEAD` | Trưởng khoa - xem tất cả, duyệt |
| `KEEPER_BULK_HC_SP` / `KEEPER_DAILY_HC_SP` | Thủ kho HC-SP |
| `KEEPER_BULK_VTYT` / `KEEPER_DAILY_VTYT` | Thủ kho VTYT |
| `QC_OFFICER` | KTV xét nghiệm (duyệt QC HC-SP) |

4 kho: `XN-BULK-HC` / `XN-DAILY-HC` / `XN-BULK-VT` / `XN-DAILY-VT`

## License

Proprietary - © 2026 TnPhtL0897
