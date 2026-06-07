# Changelog

Tất cả thay đổi quan trọng của dự án được ghi ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Phase 0-2 hoàn thiện

### Added

**Backend (ASP.NET Core 8):**
- 13 controllers đầy đủ CRUD: Auth, Branches, Categories, GoodsReceipts, Health, Locations, Parties, Products, PurchaseOrders, Stock, StockIssues, StockTakes, StockTransfers, Units, Warehouses
- 11 MediatR handlers domain: BranchHandlers, CategoryHandlers, GoodsReceiptHandlers, PartyHandlers, ProductHandlers, PurchaseOrderHandlers, StockCommandHandler (idempotency), StockIssueHandlers, StockTakeHandlers, StockTransferHandlers, UnitHandlers, WarehouseHandlers, LocationHandlers
- 4 middlewares: ExceptionHandlerMiddleware, IdempotencyMiddleware, SecurityHeadersMiddleware, TenantScopeMiddleware
- 11 EF Core Configurations: BranchConfiguration, CategoryConfiguration, LocationConfiguration, ProductConfiguration, ProductUnitConfiguration, StockConfiguration, StockTakeConfiguration, StockTransferConfiguration, UnitOfMeasureConfiguration, WarehouseConfiguration
- Domain: 12 entities (BaseEntity, TenantScopedEntity, BranchScopedEntity, Branch, Category, Product, ProductUnit, UnitOfMeasure, Warehouse, Location, Stock, StockMovement, StockTransfer, StockTransferLine, StockTake, StockTakeLine, Party, SupplierProduct, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, StockIssue, StockIssueLine)
- FluentValidation: CreateProductValidator, UpdateProductValidator, PartyValidators, PurchaseOrderValidators, GoodsReceiptValidators, StockIssueValidators
- Rate Limiting: 100 req/phút per IP/user (configurable qua appsettings)
- Security Headers: X-Content-Type-Options, X-Frame-Options, HSTS (production), CSP
- Health Checks: /health (full), /health/live (self), /health/ready (DB)

**Database (Supabase migrations):**
- 0001_init_tenants_users_rls.sql — multi-tenancy, RLS, JWT claims helper
- 0002_products.sql — products, categories, units, product_units
- 0003_warehouses.sql — warehouses, locations
- 0004_stock.sql — stock_movements (partitioned event-sourcing), stock (materialized), triggers
- 0005_transfers.sql — stock_transfers, stock_transfer_lines
- 0006_stock_takes.sql — stock_takes, stock_take_lines

**Web (Next.js 15):**
- 12 modules nghiệp vụ: products, warehouses, stock, parties, purchase-orders, goods-receipts, stock-issues, transfers, stock-takes, branches (dropdown), categories (dropdown), units (dropdown)
- 7 trang route: /inventory/products, /inventory/stock, /inventory/movements/new, /warehouses, /transfers, /stock-takes, /parties, /purchase-orders, /goods-receipts, /stock-issues
- UI: error.tsx (global), loading.tsx, not-found.tsx, dashboard với counters thật
- shadcn/ui components: button, card, input, label, dialog, select, table, tabs, badge, textarea
- Auth: Supabase SSR + middleware route protection

**Tests:**
- Backend: 18+ unit tests cho Idempotency, StockMovement, Product, Warehouse, Transfer (validation + business rules)
- Web: vitest config + tests cho utils (cn, formatCurrency, formatDate) + ApiError + api-client
- Integration tests scaffold (Testcontainers.PostgreSql)

**Infrastructure:**
- Multi-stage Dockerfile cho API (ASP.NET Core 8 runtime, non-root user, healthcheck)
- fly.toml (Singapore region, bluegreen deploy, auto-restart)
- vercel.json (Next.js, security headers, proxy rewrites)
- .env.production.example
- .dockerignore
- appsettings.Production.json

**Tooling:**
- packages/tsconfig/ (base, nextjs, library, node)
- packages/eslint-config/ (library, next, node)
- packages/validation/ (Zod schemas cho products, warehouses, stock, transfers, stocktakes, parties, POs, GRNs, stock-issues)
- 3 CI workflows (web, api, db)
- tooling/scripts (dev.sh, setup.sh)
- 4 ADRs (multi-tenancy, event-sourcing, offline-first, supabase-auth)

### Changed
- apps/api/InventoryPro.sln đã thay .placeholder, nested folders
- Dashboard page hiển thị real counters thay vì "—"
- StockMovementHandlers idempotency xử lý race condition qua 2 layers (DB unique constraint + retry check)
- Auth controller KHÔNG crash khi thiếu Supabase config (placeholder values cho health check)

### Security
- JWT validation: HS256 với Supabase secret, validate issuer/audience/lifetime/signature
- Tenant isolation: Global query filter qua tenant_id, RLS policies
- Idempotency-Key header required cho stock movements (24h TTL in-memory cache)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Rate limiting per IP/user

### Performance
- Stock movements partitioned theo created_at (Postgres PARTITION BY RANGE)
- Weighted average cost update qua DB trigger
- Composite indexes cho (tenant_id, *), (warehouse_id, product_id), (branch_id, *)
- EF Core: AsNoTracking cho read-only queries, Include cho navigation properties
- React Query: staleTime 60s, không refetch on focus

## [0.1.0] — Phase 0 (Foundation)

- Monorepo setup (pnpm workspaces + Turborepo)
- Next.js 15 + TypeScript + Tailwind + shadcn/ui
- ASP.NET Core 8 Clean Architecture (Domain/Application/Infrastructure/API)
- Supabase config (Auth, Postgres, Storage, Realtime)
- ESLint, Prettier, TypeScript configs
- 4 ADRs (multi-tenancy, event-sourcing, offline-first, supabase-auth)
- Basic dashboard, login flow, middleware auth
