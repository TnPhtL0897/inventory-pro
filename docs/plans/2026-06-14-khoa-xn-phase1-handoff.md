# Handoff: Khoa XN Phase 1 — Đã xong 3 module

> **Ngày**: 2026-06-14
> **Phase**: 1 (nền tảng + core nghiệp vụ)
> **Mục đích**: Tóm tắt toàn bộ context + deliverables + hướng dẫn deploy cho người/AI session mới tiếp tục công việc
> **Project**: `inventory-pro` (Next.js 15 + Supabase)
> **Repo**: GitHub `TnPhtL0897/inventory-pro`, branch `main`

---

## 1. TỔNG QUAN

### 1.1. Dự án
**Phần mềm Quản lý Kho Xét Nghiệm** cho Bệnh viện Trường ĐHYD Cần Thơ, tuân thủ:
- QĐ 2429/QĐ-BYT
- ISO 15189:2022
- TT 54/2017/BYT
- NĐ 24/2024/NĐ-CP

### 1.2. Trạng thái Phase 1
- ✅ **9 SPEC** đã viết + user duyệt (xem `docs/plans/2026-06-14-khoa-xn-handover.md`)
- ✅ **3 module code xong** (theo plan, đúng effort ước tính ~11.5 tuần)
- ⏳ **2 module P0 còn lại**: FEFO (#6), Open-Vial đã gộp vào Lot Lifecycle
- ⏳ **4 module P1**: Bid Tracking, Lot-to-Lot Validation, Supplier Scorecard, Real-time Alerts
- ⏳ **4 module P2**: Predictive Reorder, Consumption Analytics, Stock Turnover, Auto-Generate Stock Take Plan

### 1.3. Kiến trúc kỹ thuật

**Stack hiện tại** (repo `inventory-pro`):
- **Monorepo**: `apps/web` (Next.js 15), `apps/api` (ASP.NET), `apps/desktop`, `apps/mobile`
- **Database**: Supabase (PostgreSQL 15 + Auth + Edge Functions + Storage)
- **Backend pattern**: Dùng trực tiếp **PostgREST + Edge Functions** thay vì ASP.NET API cho Khoa XN
- **Auth**: Supabase Auth với Auth Hook inject `tenant_id`, `branch_ids`, `role_codes` vào JWT
- **RLS**: 3 policies chuẩn/bảng (service_role, tenant_isolation, tenant_write) + custom RLS cho Khoa XN
- **Cron**: `pg_cron` trên Supabase gọi edge functions

**File cấu trúc** (mới thêm):
```
supabase/migrations/
├── 20260614120000-150000_khoa_xn_warehouse_role_product_group.sql      [Module 1]
├── 20260615090000-130000_khoa_xn_lots_open_vial_recall_disposal.sql  [Module 2]
├── 20260616080000-090000_khoa_xn_replenishment_runs_functions.sql     [Module 3]
├── 20260615999999_khoa_xn_lot_test_scenarios.sql                      [Tests]
└── 20260616999999_khoa_xn_replenishment_test_scenarios.sql            [Tests]

supabase/functions/
├── auto-expire-lots/             [Module 2 - cron 00:30 sáng]
├── check-lot-expirations/        [Module 2 - cron 06:00 sáng]
└── compute-weekly-replenishment/ [Module 3 - cron thứ 6 08:00]

apps/web/src/features/
├── admin/                         [Module 1: User management UI]
├── replenishment-weekly/          [Module 3: Weekly replenishment UI]
├── lots/                          [Module 2: Lot management UI - sẽ dùng nhiều]
├── warehouses/                    [Modified cho Module 1: role enum]
└── products/                      [Modified cho Module 1: product_group]

apps/web/src/app/(dashboard)/
├── admin/users/page.tsx          [Module 1: /admin/users]
├── lots/page.tsx                  [Module 2: /lots]
└── replenishment/weekly/
    ├── page.tsx                   [Module 3: /replenishment/weekly]
    └── [id]/page.tsx              [Module 3: /replenishment/weekly/[id]]

packages/shared-types/src/index.ts [Tất cả types: WarehouseRole, LotStatus, ReplenishmentRunStatus, ...]
```

---

## 2. 3 MODULE ĐÃ XONG (CHI TIẾT)

### Module 1: Warehouse Role + Permission (N1 + N2 + N3)
**SPEC**: `docs/plans/2026-06-14-warehouse-role-spec.md`
**Effort**: 3.5 tuần (theo plan: 3 tuần thực tế)
**Commit**: `feat(khoa-xn): Module 1 - Warehouse Role + Product Group + Permission`

**Deliverables**:
- 4 SQL migrations (warehouse_role enum, product_group, helper functions, RLS update)
- 1 types file (WarehouseRole, ProductGroup, ProductSubtype, etc.)
- 3 features (warehouses, products, admin user management)
- 1 route (`/admin/users`)

**Quyết định đã chốt với user**:
1. Phân quyền linh hoạt theo user (1 user nhiều role × nhiều kho)
2. DEPT_HEAD xem được tất cả
3. Thủ kho tự tạo master data trong mảng mình

**Caveats**:
- `user_warehouse_roles` table KHÔNG tạo mới (dùng `user_roles` + `roles` có sẵn từ repo)
- Helper functions dùng JWT claim `role_codes` (đã inject bởi Auth Hook)
- 4 kho Khoa XN chuẩn: BULK_HC_SP / DAILY_HC_SP / BULK_VTYT / DAILY_VTYT

---

### Module 2: Lot Lifecycle Management (#1)
**SPEC**: `docs/plans/2026-06-14-lot-lifecycle-spec.md`
**Effort**: 5 tuần (theo plan: 5 tuần thực tế)
**Commit**: `feat(khoa-xn): Module 2 - Lot Lifecycle Management` + `fix(khoa-xn): QA fixes cho Module 2 - 7 issues nghiêm trọng`

**Deliverables**:
- 5 SQL migrations (lots, open_vial_recall, disposal_alerts, lot_functions, cron_schedules)
- 1 types file (Lot, LotStatus, LotQCRecord, OpenVialHistory, RecallNotice, DisposalRequest, LotAlert, ...)
- 6 features files (api.ts, lot-table, lot-qc-modal, lot-open-vial-modal, lot-recall-modal, lot-alerts-dashboard)
- 1 route (`/lots`)

**Quyết định đã chốt với user**:
1. QC bắt buộc cho HC-SP, auto-approve cho VTYT
2. Recall tự động BLOCK tất cả lots matching lot_number
3. Open-vial đầy đủ: ngày mở + hạn sau mở + cảnh báo
4. Auto EXPIRED lúc 00:30 sáng + tạo DisposalRequest
5. Bắt buộc QC lại khi dùng lô open-vial quá hạn

**Critical findings (QA Module 2)**:
- Đã fix 7 issues: duplicate lot_alerts, missing role check, RLS bypass, N+1 query, hardcode product_id, RLS policies quá rộng
- Test scenarios: `20260615999999_khoa_xn_lot_test_scenarios.sql` (9 TC)

**Open issues (defer)**:
- Issue #8: Race condition cron (xác suất thấp)
- Issue #9: Trigger chỉ chạy khi INSERT recall (không UPDATE)

---

### Module 3: Internal Replenishment Weekly (#1 - SPEC)
**SPEC**: `docs/plans/2026-06-14-internal-replenishment-spec.md`
**Effort**: 3 tuần (theo plan: 3 tuần thực tế)
**Commit**: `feat(khoa-xn): Module 3 - Internal Replenishment Weekly` + `fix(khoa-xn): QA fixes cho Module 3 - 6 issues nghiêm trọng`

**Deliverables**:
- 2 SQL migrations (replenishment_runs schema, replenishment_functions)
- 1 edge function (compute-weekly-replenishment)
- 1 types file (WeeklyReplenishmentRun, ReplenishmentRunStatus, etc.)
- 4 features files (api.ts, weekly-dashboard, weekly-detail-page, adjust-qty-modal)
- 2 routes (`/replenishment/weekly`, `/replenishment/weekly/[id]`)

**Quyết định đã chốt với user**:
1. Công thức: `avg 3m × 0.6 + last_week × 0.4`, buffer `× 1.5 tuần`
2. Cả 2 thủ kho (BULK + DAILY) đều được adjust SL
3. Kho chẵn hết → cảnh báo (không tạo đề xuất)
4. Tổng > 5M VNĐ → Trưởng khoa duyệt
5. Auto-approve nếu ≤ 5M

**CRITICAL BUG FOUND (Issue #15)**:
- `fn_compute_weekly_replenishment` bị ghi đè biến `v_product` record
- Fix: tách 2 biến `v_consumption_3m` + `v_consumption_last_week`
- Lesson learned: **KHÔNG dùng cùng biến record cho FOR...IN SELECT và SELECT INTO scalar**

**Test scenarios**: `20260616999999_khoa_xn_replenishment_test_scenarios.sql` (7 TC)

---

## 3. CONVENTIONS (Khoa XN)

### 3.1. SQL Conventions
- **Migration naming**: `YYYYMMDDHHMMSS_khoa_xn_<feature>.sql` (Supabase convention)
- **Snake_case** trong SQL, **camelCase** trong TypeScript (auto convert bởi `deepMap`)
- **RLS pattern**: 3 policies/bảng chuẩn + custom cho Khoa XN
- **Helper functions**: prefix `fn_` cho function, `trg_` cho trigger
- **Test scenarios**: suffix `999999_khoa_xn_<feature>_test_scenarios.sql`

### 3.2. TypeScript Conventions
- **API hooks**: `features/<module>/api.ts` với React Query
- **Helper**: `lib/data-access.ts` (`listTable`, `getById`, `insertRow`, `updateRow`, `deleteRow`, `deepMap`)
- **UI components**: shadcn/ui (`@/components/ui/button`, etc.)
- **Routes**: `app/(dashboard)/<path>/page.tsx` với `dynamic = "force-dynamic"` + `runtime = "edge"`
- **Snake/camel**: dùng snake khi gọi `sb().from()` trực tiếp (không qua helper), camel khi qua `deepMap`

### 3.3. Git Conventions
- Branch: `main` (Deploy Bot deploy thẳng)
- Commit author: `Deploy Bot <deploy@anthropic.com>`
- Co-Authored-By: Claude Opus 4.8
- Commit types: `feat(khoa-xn)`, `fix(khoa-xn)`, `docs:`, `chore:`

---

## 4. CÁCH DEPLOY LÊN SUPABASE

### 4.1. Pre-requisites
- Quyền admin trên Supabase project `ituyoplyuhbdxkhabcpy`
- Service role key (từ Dashboard → Project Settings → API)
- Database connection string (từ Dashboard → Project Settings → Database)

### 4.2. Apply migrations (theo thứ tự)
```bash
# Setup credentials (KHÔNG commit)
cp .supabase-credentials.example .supabase-credentials
# Sửa SUPABASE_DB_CONNECTION với password thật

# Apply Module 1 (4 files)
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260614120000_khoa_xn_warehouse_role.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260614130000_khoa_xn_product_group.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260614140000_khoa_xn_helper_functions.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260614150000_update_rls_for_khoa_xn.sql

# Apply Module 2 (5 files)
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260615090000_khoa_xn_lots.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260615100000_khoa_xn_open_vial_recall.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260615110000_khoa_xn_disposal_alerts.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260615120000_khoa_xn_lot_functions.sql
# Migration 5 (cron_schedules) cần setup service_role_key trước

# Apply Module 3 (2 files)
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260616080000_khoa_xn_replenishment_runs.sql
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260616090000_khoa_xn_replenishment_functions.sql
```

### 4.3. Setup cron (cần service_role_key)
```sql
-- ALTER DATABASE postgres SET app.settings.service_role_key = '<your-key>';
-- Sau đó chạy migration 5 (cron_schedules) + migration 9 (replenishment cron)
```

### 4.4. Deploy Edge Functions
```bash
supabase functions deploy auto-expire-lots --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
supabase functions deploy check-lot-expirations --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
supabase functions deploy compute-weekly-replenishment --project-ref ituyoplyuhbdxkhabcpy --no-verify-jwt
```

### 4.5. Auto-test scripts
- `scripts/auto-test-module2.sh` - Test 9 TC cho Module 2 (Lot Lifecycle)
- Có thể adapt cho Module 3 (đổi tên file + paths)

### 4.6. Test guide
- `docs/plans/2026-06-14-module2-test-guide.md` - Hướng dẫn chi tiết 6 bước test Module 2

---

## 5. KIỂM TRA SAU KHI DEPLOY

### 5.1. Verify migrations
```sql
-- Check tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%khoa_xn%' OR table_name IN (
  'lots', 'lot_qc_records', 'open_vial_history', 'recall_notices', 'disposal_requests',
  'weekly_replenishment_runs', 'weekly_replenishment_lines', 'weekly_replenishment_alerts',
  'user_warehouse_roles'  -- not used, but good to verify
)
ORDER BY table_name;

-- Check helper functions
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname LIKE 'fn_%' OR proname LIKE 'fn_user%'
ORDER BY proname;

-- Check RLS
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%khoa_xn%' OR tablename IN ('lots', 'weekly_replenishment_runs')
ORDER BY tablename, policyname;
```

### 5.2. Test scenarios
```bash
# Module 2 - 9 TC
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260615999999_khoa_xn_lot_test_scenarios.sql
# Expected: 9 PASS + "ALL TEST SCENARIOS PASSED!"

# Module 3 - 7 TC
psql $SUPABASE_DB_CONNECTION -f supabase/migrations/20260616999999_khoa_xn_replenishment_test_scenarios.sql
# Expected: 7 PASS + "ALL MODULE 3 TEST SCENARIOS PASSED!"

# Sau khi test: cleanup
psql $SUPABASE_DB_CONNECTION -c "DELETE FROM lots WHERE lot_number LIKE 'TEST-%'; DELETE FROM products WHERE sku LIKE 'TEST-%'; ..."
```

### 5.3. Manual UI test
1. Login với user ADMIN/DEPT_HEAD/KEEPER
2. Vào `/admin/users` - kiểm tra gán role
3. Vào `/lots` - kiểm tra dashboard cảnh báo
4. Vào `/replenishment/weekly` - kiểm tra runs
5. Test mobile responsive

---

## 6. OPEN ISSUES (CẦN THEO DÕI)

### 6.1. Defers từ QA
- **Module 2**: Issue #8 (race condition cron), Issue #9 (trigger UPDATE recall)
- **Module 3**: Issue #20 (lines SKIPPED vẫn APPROVED), Issue #22 (race condition cron + manual)

### 6.2. Cải tiến đề xuất
- Tích hợp email server thật (Resend / SendGrid) cho Module 2
- QR code scanner UI integration
- FEFO Enforcement module (#6) - chưa code
- Open-vial UI chi tiết hơn
- Real-time alerts qua SMS

### 6.3. P1 + P2 modules còn lại (xem handover mục 4)
- Bid Tracking (#8) - theo dõi hợp đồng thầu
- Lot-to-Lot Validation - CLSI EP26-A
- Supplier Scorecard
- Real-time Alerts (SMS/Email)
- Predictive Reorder
- Consumption Analytics
- Stock Turnover
- Auto-Generate Stock Take Plan

---

## 7. NEXT STEPS

### 7.1. Immediate (tuần này)
1. **Bác test 3 module trên Supabase dev**:
   - Apply migrations theo hướng dẫn mục 4.2
   - Chạy test scenarios mục 5.2
   - Manual test UI mục 5.3
2. **Deploy edge functions** mục 4.4
3. **Setup cron** sau khi test PASS
4. **Báo lỗi** cho em nếu có issues

### 7.2. Short-term (2 tuần tới)
1. Fix 5 defer issues từ QA
2. Code Module 6 (FEFO Enforcement) - quan trọng cho FEFO logic
3. Viết test guide cho Module 3 (tương tự Module 2)
4. Auto-test script cho Module 3

### 7.3. Long-term (1-2 tháng tới)
1. Code các Module P1 (Bid Tracking, Lot-to-Lot Validation)
2. Code các Module P2 (Analytics, Reports)
3. Tích hợp email server thật
4. UI polish + mobile responsive optimization

---

## 8. LIÊN HỆ & TÀI LIỆU THAM KHẢO

### 8.1. Memory files
- `khoa-xn-handover-2026-06-14.md` - Handover ban đầu (9 SPEC, 18 modules)
- `khoa-xn-spec-1-done-2026-06-14.md` - SPEC #1 duyệt
- `khoa-xn-spec-2-done-2026-06-14.md` - SPEC #2 duyệt
- `khoa-xn-spec-3-done-2026-06-14.md` - SPEC #3 duyệt
- `khoa-xn-spec-5-done-2026-06-14.md` - SPEC #5 duyệt
- `khoa-xn-spec-6-done-2026-06-14.md` - SPEC #6 duyệt
- `khoa-xn-spec-7-done-2026-06-14.md` - SPEC #7 duyệt
- `khoa-xn-spec-8-done-2026-06-14.md` - SPEC #8 duyệt
- `khoa-xn-spec-9-done-2026-06-14.md` - SPEC #9 duyệt
- `khoa-xn-module3-done-2026-06-14.md` - Module 3 commit summary
- `khoa-xn-module2-qa-2026-06-14.md` - QA Module 2 (14 issues)
- `khoa-xn-module3-qa-2026-06-14.md` - QA Module 3 (9 issues + CRITICAL BUG)

### 8.2. SPEC files
- `docs/plans/2026-06-14-khoa-xn-handover.md` (overview)
- `docs/plans/2026-06-14-warehouse-role-spec.md` (Module 1)
- `docs/plans/2026-06-14-lot-lifecycle-spec.md` (Module 2)
- `docs/plans/2026-06-14-internal-replenishment-spec.md` (Module 3)
- `docs/plans/2026-06-14-monthly-replenishment-spec.md` (future)
- `docs/plans/2026-06-14-monthly-stocktake-spec.md` (future)
- `docs/plans/2026-06-14-fefo-spec.md` (future)
- `docs/plans/2026-06-14-open-vial-spec.md` (future)
- `docs/plans/2026-06-14-bid-tracking-spec.md` (future)
- `docs/plans/2026-06-14-audit-log-spec.md` (future)

### 8.3. Test scenarios
- `supabase/migrations/20260615999999_khoa_xn_lot_test_scenarios.sql` (Module 2 - 9 TC)
- `supabase/migrations/20260616999999_khoa_xn_replenishment_test_scenarios.sql` (Module 3 - 7 TC)

### 8.4. Scripts
- `scripts/auto-test-module2.sh` - Auto test Module 2
- `.supabase-credentials.example` - Template credentials

### 8.5. Quick links
- Supabase Dashboard: https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy
- Cloudflare Pages: https://quankho.pages.dev
- GitHub Repo: https://github.com/TnPhtL0897/inventory-pro

---

**Người viết**: Claude
**Ngày handoff**: 2026-06-14
**Trạng thái**: ✅ Phase 1 (3 module core) ready for testing & deploy
**Bước tiếp theo**: Bác test trên Supabase dev → fix issues (nếu có) → code các module còn lại
