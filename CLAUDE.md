# Khoa XN — Project Conventions for Claude

> **Project**: Phần mềm Quản lý Kho Xét Nghiệm
> **Repo**: `inventory-pro` (Next.js 15 + Supabase)
> **Last updated**: 2026-06-14

## Quick Context

Dự án quản lý kho chuyên biệt cho **Khoa Xét Nghiệm** Bệnh viện Trường ĐHYD Cần Thơ.
- 4 kho vật lý: BULK/DAILY × HC-SP/VTYT
- 4-5 thủ kho riêng biệt + 1 Trưởng khoa
- Tuân thủ QĐ 2429/BYT, ISO 15189, TT 54/2017

Xem chi tiết:
- `docs/plans/2026-06-14-khoa-xn-handover.md` - Handover ban đầu (9 SPEC, 18 modules)
- `docs/plans/2026-06-14-khoa-xn-phase1-handoff.md` - Handoff 3 module đã code

## Tech Stack (Khoa XN)

- **Monorepo**: pnpm + Turborepo
- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (PostgREST + Edge Functions + Auth)
- **Auth**: Supabase Auth + Auth Hook inject `tenant_id`, `branch_ids`, `role_codes` vào JWT
- **Cron**: `pg_cron` trên Supabase
- **Validation**: Zod (`packages/validation/`)
- **Deploy**: Cloudflare Pages (web) + Supabase Cloud (DB)

## Codebase Structure

```
apps/web/src/
├── app/(dashboard)/    # Routes có layout dashboard
│   ├── admin/users/    # Module 1: /admin/users
│   ├── lots/           # Module 2: /lots
│   ├── replenishment/weekly/  # Module 3: /replenishment/weekly
│   ├── warehouses/     # Modified cho Module 1
│   ├── products/       # Modified cho Module 1
│   └── ...
├── features/           # Business logic + hooks
│   ├── admin/          # Module 1: User management
│   ├── lots/           # Module 2: Lot management
│   ├── replenishment-weekly/  # Module 3
│   ├── warehouses/     # Warehouse hooks (modified)
│   ├── products/       # Product hooks (modified)
│   └── ...
├── lib/
│   ├── data-access.ts  # PostgREST helpers: listTable, getById, insertRow, updateRow, deepMap
│   ├── supabase/       # client.ts + server.ts
│   └── api.ts          # HTTP API client
└── components/
    └── ui/             # shadcn/ui components
```

```
supabase/
├── migrations/         # SQL migrations (apply lên Supabase Cloud)
│   ├── 202606091*      # Phase 1 migrations (existing)
│   ├── 20260614*       # Khoa XN Module 1
│   ├── 20260615*       # Khoa XN Module 2
│   ├── 20260616*       # Khoa XN Module 3
│   └── 20260615999999*, 20260616999999*  # Test scenarios
└── functions/          # Deno edge functions
    ├── auto-expire-lots/        # Module 2
    ├── check-lot-expirations/   # Module 2
    └── compute-weekly-replenishment/  # Module 3
```

## Conventions (Khoa XN)

### SQL Conventions
- **Migration naming**: `YYYYMMDDHHMMSS_<feature>.sql` (Supabase convention)
- **Snake_case** trong SQL, **camelCase** trong TypeScript
- **RLS pattern**: 3 policies/bảng chuẩn (service_role, tenant_isolation, tenant_write) + custom cho Khoa XN
- **Helper functions**: prefix `fn_` cho function, `trg_` cho trigger
- **Test scenarios**: suffix `999999_khoa_xn_<feature>_test_scenarios.sql`
- **ENUMs**: `CREATE TYPE IF NOT EXISTS` pattern (dùng DO $$ BEGIN ... EXCEPTION)
- **Triggers**: tạo function trước, sau đó `CREATE TRIGGER`

### TypeScript Conventions
- **API hooks**: `features/<module>/api.ts` với React Query
- **Pattern**: `useXxx()` cho queries, `useCreateXxx/UpdateXxx/DeleteXxx` cho mutations
- **Helper**: `lib/data-access.ts` (`listTable`, `getById`, `insertRow`, `updateRow`, `deleteRow`, `deepMap`)
- **UI components**: shadcn/ui (`@/components/ui/*`)
- **Routes**: `app/(dashboard)/<path>/page.tsx` với `dynamic = "force-dynamic"` + `runtime = "edge"`
- **Snake/camel**: dùng snake khi gọi `sb().from()` trực tiếp, camel khi qua `deepMap`

### Git Conventions
- Branch: `main` (Deploy Bot deploy thẳng)
- Commit author: `Deploy Bot <deploy@anthropic.com>`
- Co-Authored-By: Claude Opus 4.8
- Commit types: `feat(khoa-xn)`, `fix(khoa-xn)`, `docs:`, `chore:`

## Roles (Khoa XN)

| Role Code | Mô tả | Mảng |
|---|---|---|
| `ADMIN` | Admin hệ thống | Toàn quyền |
| `DEPT_HEAD` | Trưởng khoa | Xem tất cả + duyệt |
| `KEEPER_BULK_HC_SP` | Thủ kho chẵn HC-SP | HC-SP |
| `KEEPER_DAILY_HC_SP` | Thủ kho lẻ HC-SP | HC-SP |
| `KEEPER_BULK_VTYT` | Thủ kho chẵn VTYT | VTYT |
| `KEEPER_DAILY_VTYT` | Thủ kho lẻ VTYT | VTYT |
| `QC_OFFICER` | KTV xét nghiệm (QC) | HC-SP |

## 4 Kho Khoa XN

| Code | Role | Product Group |
|---|---|---|
| XN-BULK-HC | BULK_HC_SP | HOA_CHAT_SINH_PHAM |
| XN-DAILY-HC | DAILY_HC_SP | HOA_CHAT_SINH_PHAM |
| XN-BULK-VT | BULK_VTYT | VAT_TU_Y_TE |
| XN-DAILY-VT | DAILY_VTYT | VAT_TU_Y_TE |

## Lessons Learned (từ QA)

1. **KHÔNG dùng cùng biến record cho `FOR...IN SELECT` và `SELECT INTO scalar`** - 99% sẽ ghi đè (Module 3 Issue #15)
2. Sau khi viết function có vòng FOR, **viết test scenarios NGAY**
3. Edge function multi-tenant: dùng `_all` runner thay vì loop N×2 RPC
4. deepMap convert snake → camel, **nhớ dùng camelCase** khi truy cập nested object
5. RLS policies nên **tách riêng INSERT/UPDATE/DELETE** thay vì `FOR ALL` để kiểm soát chặt

## Testing

- Test scenarios: `supabase/migrations/*999999_*_test_scenarios.sql`
- Auto-test script: `scripts/auto-test-module2.sh` (Module 2)
- Test guide: `docs/plans/2026-06-14-module2-test-guide.md`

## Files quan trọng (Khoa XN)

- `supabase/migrations/20260614*` (Module 1 - Warehouse Role + Permission)
- `supabase/migrations/20260615*` (Module 2 - Lot Lifecycle)
- `supabase/migrations/20260616*` (Module 3 - Weekly Replenishment)
- `packages/shared-types/src/index.ts` (Type definitions)
- `apps/web/src/lib/data-access.ts` (PostgREST helpers)
- `supabase/migrations/20260613160000_auth_hook_tenant_claim.sql` (Auth Hook - inject role_codes)

## Workflow

Khi code module mới:
1. Viết SPEC trước (cấu trúc 9 phần)
2. User review + duyệt
3. Tạo SQL migrations theo thứ tự
4. Tạo types trong `packages/shared-types/`
5. Tạo API hooks trong `features/<module>/api.ts`
6. Tạo UI components
7. Tạo route
8. **Tạo test scenarios NGAY** (không để sau)
9. Test TypeScript + Build
10. QA + fix issues
11. Commit
