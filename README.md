# Quản kho

Phần mềm quản lý kho chuyên nghiệp cho doanh nghiệp Việt Nam. Multi-tenant, multi-branch, hỗ trợ đầy đủ nghiệp vụ kho + tuân thủ pháp lý VN (hóa đơn điện tử, chữ ký số, sổ sách theo TT133/TT200).

**Phase 1 — Khoa Xét Nghiệm** (2026-06-14): 3 module core đã code xong (Warehouse Role + Permission, Lot Lifecycle, Internal Replenishment Weekly). Xem [docs/plans/2026-06-14-khoa-xn-phase1-handoff.md](docs/plans/2026-06-14-khoa-xn-phase1-handoff.md) để biết chi tiết.

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
 web/ - Next.js 15 web app (App Router + Supabase PostgREST)
   src/
     app/(dashboard)/ - Routes
       admin/users/    # Module 1: /admin/users
       lots/           # Module 2: /lots
       replenishment/weekly/  # Module 3: /replenishment/weekly
     features/ - Business logic + hooks
       admin/          # Module 1
       lots/           # Module 2
       replenishment-weekly/  # Module 3
       warehouses/     # Modified cho Module 1
       products/       # Modified cho Module 1
     lib/data-access.ts - PostgREST helpers
     components/ui/    - shadcn/ui components
packages/
 shared-types/ - TS types (Supabase generated + Khoa XN)
 validation/ - Zod schemas
 tsconfig/ - Shared TypeScript configs
 eslint-config/ - Shared ESLint configs
supabase/
 migrations/ - SQL migrations (apply lên Supabase Cloud)
   20260609* - Phase 1 (existing)
   20260614* - Khoa XN Module 1
   20260615* - Khoa XN Module 2
   20260616* - Khoa XN Module 3
   *999999_*_test_scenarios.sql - Test scenarios
 functions/ - Deno edge functions
   auto-expire-lots/             # Module 2
   check-lot-expirations/        # Module 2
   compute-weekly-replenishment/ # Module 3
docs/
 plans/ - SPEC + handoff documents
 adr/ - Architecture Decision Records
scripts/
 auto-test-module2.sh - Auto test Module 2
 *.py, *.ps1, *.sh - Operational scripts
.supabase-credentials.example - Template (KHÔNG commit thật)
```

## Yêu cầu môi trường

- Node.js >= 20
- pnpm >= 9
- Supabase CLI (optional, dùng Dashboard thay thế)
- Python 3.10+ (cho scripts + psycopg2)
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
# Dùng Dashboard SQL Editor hoặc scripts/auto-test-module*.sh
```

## Khoa XN Modules (Phase 1)

| # | Module | SPEC | Routes | Status |
|---|---|---|---|---|
| 1 | Warehouse Role + Permission | [SPEC](docs/plans/2026-06-14-warehouse-role-spec.md) | `/admin/users` | ✅ Code xong |
| 2 | Lot Lifecycle Management | [SPEC](docs/plans/2026-06-14-lot-lifecycle-spec.md) | `/lots` | ✅ Code xong |
| 3 | Internal Replenishment Weekly | [SPEC](docs/plans/2026-06-14-internal-replenishment-spec.md) | `/replenishment/weekly` | ✅ Code xong |
| 6 | FEFO Enforcement | [SPEC](docs/plans/2026-06-14-fefo-spec.md) | (chưa code) | ⏳ P0 |
| 7 | Open-Vial Tracking | [SPEC](docs/plans/2026-06-14-open-vial-spec.md) | (gộp vào Lot) | ✅ Module 2 |
| 8 | Bid Tracking | [SPEC](docs/plans/2026-06-14-bid-tracking-spec.md) | (chưa code) | ⏳ P1 |
| 9 | Audit Log Viewer | [SPEC](docs/plans/2026-06-14-audit-log-spec.md) | (chưa code) | ⏳ P0 |

Xem chi tiết trong [docs/plans/2026-06-14-khoa-xn-handover.md](docs/plans/2026-06-14-khoa-xn-handover.md) (18 modules tổng).

## Deploy

### Web (Cloudflare Pages)
1. Connect repo `TnPhtL0897/inventory-pro` tại Cloudflare Dashboard
2. Build command: `pnpm --filter web build`
3. Output: `apps/web/.next`
4. Root: `apps/web`
5. Auto-deploy mỗi lần push `main`
6. Set env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (commit `apps/web/.env.production`)

### Database & Edge Functions (Supabase Cloud)
- Project: `ituyoplyuhbdxkhabcpy`
- Migrations: apply qua Dashboard SQL Editor hoặc `scripts/auto-test-module2.sh`
- Edge functions: deploy qua Supabase CLI
  ```bash
  supabase functions deploy auto-expire-lots --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
  supabase functions deploy check-lot-expirations --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
  supabase functions deploy compute-weekly-replenishment --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
  ```
- Cron: setup service_role_key trong `app.settings.service_role_key` để chạy migrations 5 + 9

### Test Khoa XN
```bash
# Setup credentials
cp .supabase-credentials.example .supabase-credentials
# Sửa SUPABASE_DB_CONNECTION với password thật

# Chạy test scenarios
bash scripts/auto-test-module2.sh
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260616999999_khoa_xn_replenishment_test_scenarios.sql
```

## Multi-tenant Auth

Mỗi user gắn với 1 tenant. RLS policies enforce tenant isolation. Custom JWT claim `tenant_id` + `role_codes` được inject qua Auth Hook (`public.custom_access_token_hook`) — xem [docs/AUTH-HOOK-ENABLE.md](docs/AUTH-HOOK-ENABLE.md).

## Khoa XN Roles (chi tiết)

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
