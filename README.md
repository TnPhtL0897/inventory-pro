# Quản lý kho vật tư Pro

Phần mềm quản lý kho vật tư chuyên nghiệp cho doanh nghiệp Việt Nam. Multi-tenant, multi-branch, hỗ trợ đầy đủ nghiệp vụ kho + tuân thủ pháp lý VN (hóa đơn điện tử, chữ ký số, sổ sách theo TT133/TT200).

> **Trạng thái**: Phase 0–2 hoàn thiện. Sẵn sàng deploy production. Xem [CHANGELOG.md](CHANGELOG.md) để biết chi tiết những gì đã làm.

## Tech stack

- **Web**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend**: ASP.NET Core 8 Web API (C#) — Clean Architecture
- **Database & Auth**: Supabase (PostgreSQL 15 + Auth + Storage + Realtime)
- **Monorepo**: pnpm + Turborepo
- **Validation**: Zod (web) + FluentValidation (.NET)
- **Testing**: vitest (web) + xUnit + FluentAssertions + EF InMemory (.NET)
- **Deploy**: Vercel (web) + Fly.io (API) + Supabase Cloud (DB)

## Cấu trúc

```
apps/
  web/             - Next.js 15 web app
  api/             - ASP.NET Core 8 backend (Dockerfile, fly.toml)
  desktop/         - WPF desktop (planned, Phase 4)
  mobile/          - React Native (planned, Phase 5)
packages/
  shared-types/    - TS types (mirror .NET DTOs)
  validation/      - Zod schemas (shared với .NET)
  tsconfig/        - Shared TypeScript configs
  eslint-config/   - Shared ESLint configs
infrastructure/
  supabase/        - SQL migrations (0001-0006), RLS, edge functions
docs/
  adr/             - Architecture Decision Records (0001-0005)
  DEPLOY.md        - Production deploy guide
.vercel.json       - Vercel config (Next.js)
fly.toml           - Fly.io config (API)
CHANGELOG.md       - Thay đổi theo từng version
```

## Yêu cầu môi trường

- Node.js >= 20
- pnpm >= 9
- .NET SDK 8
- Supabase CLI (optional, dùng Docker thay thế)
- Docker (cho local Supabase)
- Git

## Bắt đầu nhanh

```bash
# 1. Cài dependencies
pnpm install

# 2. Copy env files
cp .env.example .env.local
cp apps/api/src/InventoryPro.API/appsettings.Development.json.example \
   apps/api/src/InventoryPro.API/appsettings.Development.json 2>/dev/null || true

# 3. Khởi động Supabase local + apply migrations
supabase start
supabase db reset           # apply tất cả migrations + seed

# 4. Generate database types (optional, cho TS strictness)
pnpm db:types

# 5. Chạy song song
pnpm dev                    # web (3000) + API (5000)

# Hoặc chạy từng phần
pnpm dev:web
pnpm dev:api

# 6. Tests
pnpm test                   # web (vitest)
cd apps/api && dotnet test # .NET tests
```

## Tính năng đã hoàn thiện

### Phase 0 — Foundation ✅
- Multi-tenancy với Row-Level Security (RLS + JWT tenant_id claim)
- 4 ADRs: multi-tenancy, event-sourcing stock, offline-first, supabase auth
- 5 ADRs: deployment architecture
- CI/CD với 3 GitHub Actions workflows
- Audit log, security headers, rate limiting

### Phase 1 — Core MVP ✅
- **Products**: SKU unique, barcode, đơn vị, giá, batch/serial tracking
- **Categories**: Cây danh mục đa cấp
- **Warehouses**: Branch-scoped, location tree, allow_negative config
- **Units of measure**: Tenant-defined
- **Stock movements**: Manual IN/OUT với Idempotency-Key (event-sourcing)
- **Stock**: Materialized view từ movements, weighted avg cost

### Phase 2 — Operations ✅
- **Parties** (NCC/KH): 3 loại SUPPLIER/CUSTOMER/BOTH, payment terms, credit limit
- **Purchase Orders (PO)**: Draft → Approved → Posted → Completed
- **Goods Receipts (GRN)**: Link với PO, auto-update received_qty, post tạo IN movements
- **Stock Issues**: Phiếu xuất kho với workflow duyệt
- **Stock Transfers** (mới): Multi-line, ship/receive workflow, partial receive, auto-compensation khi cancel
- **Stock Takes** (mới): Snapshot system qty, nhập counted qty, post tạo ADJUST_IN/OUT movements

## Quyết định kiến trúc (xem docs/adr/)

- [ADR-0001: Multi-tenancy với Row-Level Security](docs/adr/0001-multi-tenancy-rls.md)
- [ADR-0002: Stock tracking với event-sourcing](docs/adr/0002-stock-event-sourcing.md)
- [ADR-0003: Offline-first cho WPF desktop](docs/adr/0003-offline-first-desktop.md)
- [ADR-0004: Auth với Supabase + JWT validation](docs/adr/0004-supabase-auth.md)
- [ADR-0005: Deployment Architecture (Vercel + Fly.io + Supabase)](docs/adr/0005-deployment-architecture.md)

## Deploy production

Xem [docs/DEPLOY.md](docs/DEPLOY.md) để biết chi tiết từng bước. Tóm tắt:

```bash
# 1. Supabase: tạo project + apply migrations
supabase link --project-ref <ref>
supabase db push

# 2. Web: deploy lên Vercel
vercel --prod

# 3. API: deploy lên Fly.io
fly apps create inventory-prod
fly secrets set Supabase__Url=... Supabase__JwtSecret=... ConnectionStrings__Supabase=...
fly deploy
```

**Cost: $0 tuyệt đối** (dùng 100% free tier của Vercel + Fly.io + Supabase + GitHub Actions).

Limits: DB ≤ 500MB, BW ≤ 100GB/tháng, 3 Fly VMs 256MB. Phù hợp MVP, pilot, doanh nghiệp < 50 users. Khi scale, upgrade từng service độc lập.

## Testing

```bash
# Backend (18+ tests)
cd apps/api && dotnet test

# Frontend (vitest)
pnpm test

# Type check toàn project
pnpm type-check
```

CI workflows tự động chạy trên push/PR (xem `.github/workflows/`).

## Security checklist

- ✅ JWT validation (HS256, validate issuer/audience/lifetime/signature)
- ✅ Tenant isolation: Global query filter + RLS policies
- ✅ Idempotency-Key required cho stock movements (24h TTL)
- ✅ Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- ✅ Rate limiting: 100 req/phút per IP/user (configurable)
- ✅ Health checks: /health, /health/live, /health/ready (DB)
- ✅ CORS restricted to configured origins
- ✅ Append-only stock_movements (REVOKE UPDATE/DELETE)

## Roadmap

- [x] Phase 0 — Foundation
- [x] Phase 1 — Core MVP (products, warehouses, stock, manual IN/OUT)
- [x] Phase 2 — Operations (PO, GRN, issue, transfer, stock-take)
- [x] Production-ready: tests, deploy configs, security, monitoring
- [ ] Phase 3 — Reports & Export: Excel, PDF, in phiếu
- [ ] Phase 4 — WPF Desktop offline
- [ ] Phase 5 — Mobile + Realtime
- [ ] Phase 6 — VN Compliance: HĐ điện tử, chữ ký số, sổ sách
- [ ] Phase 7 — Tích hợp kế toán + Multi-branch nâng cao

## Đóng góp

1. Fork → branch mới (`git checkout -b feature/xxx`)
2. Commit (`git commit -m "feat: ..."`)
3. Push (`git push origin feature/xxx`)
4. Tạo Pull Request

Convention: Commit theo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
