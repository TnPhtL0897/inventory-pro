# Handover: Phân tích Yêu cầu Phần mềm Quản lý Kho Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Mục đích**: Tóm tắt toàn bộ context, kết quả phân tích, và các SPEC cần viết tiếp theo để mang sang session mới.
> **Người nhận**: Claude session mới (khi user yêu cầu tiếp tục công việc)

---

## 1. BỐI CẢNH

### 1.1. Dự án hiện tại
- **Tên**: Quản lý Kho Pro (`inventory-pro`)
- **Stack**: Next.js 15.5.2 (App Router) + TypeScript + Supabase (Postgres + Auth + Edge Functions) + Tailwind + shadcn/ui
- **Hosting**: Cloudflare Pages (`quankho.pages.dev`)
- **Repo**: GitHub `TnPhtL0897/inventory-pro`
- **Branch**: main
- **Tài khoản Git**: Deploy Bot (`deploy@anthropic.com`)

### 1.2. Yêu cầu phần mềm mới
User muốn xây dựng **phần mềm quản lý kho chuyên biệt cho Khoa Xét nghiệm** tại Bệnh viện Công lập Việt Nam, tuân thủ:
- **Quyết định 2429/QĐ-BYT** (tiêu chí chất lượng phòng xét nghiệm, 17 tiêu chí Chương VII)
- **ISO 15189:2022** (tiêu chuẩn quốc tế phòng thí nghiệm y tế)
- **Thông tư 54/2017/TT-BYT** (an toàn thông tin y tế)
- **Nghị định 24/2024/NĐ-CP** (đấu thầu, mua sắm công)

File yêu cầu gốc: `D:\Tự động hóa\Quản kho Pro\Xây dựng phần mềm quản lý kho xét nghiệm.docx` (171 đoạn, 46,477 ký tự, đã đọc).

---

## 2. MÔ HÌNH KHOA XÉT NGHIỆM (đã xác nhận với user)

### 2.1. Cấu trúc 4 kho vật lý (tách biệt hoàn toàn)

| Kho | Mảng | Loại | Thủ kho phụ trách |
|---|---|---|---|
| Kho chẵn HC-SP | Hóa chất - Sinh phẩm | BULK | 1 thủ kho chẵn |
| Kho lẻ HC-SP | Hóa chất - Sinh phẩm | DAILY | 2 thủ kho lẻ |
| Kho chẵn VTYT | Vật tư y tế | BULK | Chung (1-2 thủ kho) |
| Kho lẻ VTYT | Vật tư y tế | DAILY | Chung |

**Lưu ý**: Tổng cộng có **ít nhất 4-5 thủ kho** cần phân quyền riêng trên hệ thống.

### 2.2. Quy trình xuất tuần (BULK → DAILY)
- **Ngày cố định**: Thứ 6 hàng tuần
- **Có thể xuất thêm** linh hoạt giữa tuần nếu kho lẻ sắp hết
- **Hệ thống tự đề xuất** số lượng dựa trên:
  - Lượng tiêu hao **3 tháng gần nhất** (trend dài hạn)
  - Lượng tiêu hao **tuần gần nhất** (nhu cầu cấp thiết)
- **Người duyệt**: Thủ kho (mỗi thủ kho cho mảng mình phụ trách)

### 2.3. Quy trình kiểm kê tháng
| Bước | Công việc | Người thực hiện |
|---|---|---|
| 1 | Đối chiếu sổ sách giấy trước | Thủ kho |
| 2 | Kiểm kê kho chẵn (cùng mảng) | Thủ kho phụ trách |
| 3 | Kiểm kê kho lẻ (cùng mảng) | Thủ kho phụ trách |
| 4 | Nhập số liệu vào hệ thống | Thủ kho |
| 5 | Duyệt chênh lệch | **Trưởng Khoa** |

**Lưu ý**: Một thủ kho phụ trách **cả 2 kho (chẵn + lẻ) của 1 mảng**. HC-SP có 1 thủ kho chẵn + 2 thủ kho lẻ (3 người). VTYT có số người riêng (cần xác nhận thêm).

### 2.4. Quy trình dự trù tháng
- **Hình thức**: Xuất **file Excel** theo **mẫu của Bệnh viện** (KHÔNG phải mẫu XN-BM 5.7.1/01 của BYT)
- **Gửi cho**:
  - Khoa Dược (nếu là Hóa chất - Sinh phẩm)
  - Phòng VTYT (nếu là Vật tư y tế)
- **Phản hồi**: Khoa Dược / Phòng VTYT **KHÔNG phản hồi** trên hệ thống (gửi đi 1 chiều)

### 2.5. Theo dõi hợp đồng thầu
- **Khoa XN không trực tiếp đấu thầu** (Khoa Dược/Phòng VTYT đấu thầu cấp bệnh viện)
- **NHƯNG** vẫn cần theo dõi:
  - **Hạn thầu** (còn bao lâu hết hợp đồng)
  - **Cơ số thầu** (số lượng tối đa được mua theo hợp đồng)
  - Để biết khi nào cần đề nghị Khoa Dược/Phòng VTYT đấu thầu lại
- **Giữ biểu mẫu XN-BM 5.7.1** (có thể cần dùng trong tương lai)

### 2.6. FEFO (First-Expire-First-Out)
- **Áp dụng cho tất cả 4 kho** (cả HC-SP và VTYT)
- **Có hạn sử dụng** cho cả 2 mảng

---

## 3. DOMAIN MODEL ĐÃ ĐIỀU CHỈNH

### 3.1. Warehouse (Kho)

```sql
-- Enum mới
CREATE TYPE warehouse_role AS ENUM (
  'BULK_HC_SP',     -- Kho chẵn Hóa chất - Sinh phẩm
  'DAILY_HC_SP',    -- Kho lẻ Hóa chất - Sinh phẩm
  'BULK_VTYT',      -- Kho chẵn Vật tư y tế
  'DAILY_VTYT'      -- Kho lẻ Vật tư y tế
);

ALTER TABLE warehouses ADD COLUMN role warehouse_role NOT NULL;
```

### 3.2. Product (Sản phẩm)

```sql
-- Phân loại theo mảng nghiệp vụ
ALTER TABLE products ADD COLUMN product_group TEXT;
-- HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE

ALTER TABLE products ADD COLUMN product_subtype TEXT;
-- REAGENT, CALIBRATOR, CONTROL, BUFFER, WASH, CUVETTE, CONSUMABLE (cho HC-SP)
-- CONSUMABLE_MEDICAL (cho VTYT)
```

### 3.3. Roles & Permissions

Cần **4-5 roles** riêng biệt (chưa có trong hệ thống hiện tại, cần tạo mới):

| Role | Phạm vi | Mô tả |
|---|---|---|
| `KEEPER_BULK_HC_SP` | Kho chẵn HC-SP | 1 người |
| `KEEPER_DAILY_HC_SP` | Kho lẻ HC-SP | 2 người |
| `KEEPER_BULK_VTYT` | Kho chẵn VTYT | (số người chưa rõ) |
| `KEEPER_DAILY_VTYT` | Kho lẻ VTYT | (số người chưa rõ) |
| `DEPT_HEAD` | Toàn khoa | Trưởng khoa (duyệt chênh lệch) |

### 3.4. Lot Lifecycle (vòng đời lô)

```
QUARANTINE → PENDING_QC → IN_QC → QC_FAILED/APPROVED → IN_USE → EXPIRED/DEPLETED
                                                            ↓
                                                         BLOCKED (recall/vấn đề chất lượng)
```

- **Open-vial tracking**: Áp dụng cho **HC-SP** (hóa chất có hạn sau mở nắp), KHÔNG áp dụng cho VTYT
- **FEFO**: Áp dụng cho cả 2 mảng
- **Lot-to-Lot Validation** (CLSI EP26-A): Áp dụng cho HC-SP, có thể bỏ qua cho VTYT

### 3.5. Transfer Types (3 loại)

1. **Inbound Transfer** (= GoodsReceipt hiện tại): Nhận từ Khoa Dược / Phòng VTYT
2. **Internal Replenishment** (NEW): Tuần BULK → DAILY (module N4)
3. **Inter-warehouse Transfer** (hiếm): Giữa các kho trong Khoa (nếu cần)

### 3.6. Bidding — điều chỉnh góc nhìn

KHÔNG xóa hẳn module Bidding, nhưng **đổi mục đích**:
- Không phải để đấu thầu
- Mà để **theo dõi hợp đồng thầu hiện tại** (Bid Contracts đã có sẵn API)
- Cần thêm:
  - **Hạn thầu** (expiration date của contract)
  - **Cơ số thầu** (số lượng tối đa được mua)
  - **Cảnh báo** khi hợp đồng sắp hết hạn hoặc cơ số sắp hết
- **Giữ biểu mẫu XN-BM 5.7.1** (có thể dùng trong tương lai)

---

## 4. MODULES CẦN TRIỂN KHAI (18 modules, ưu tiên P0)

### 4.1. P0 — Blocking (8 modules, ~22 tuần, 5.5 tháng)

| # | Module | Mô tả ngắn | Effort |
|---|---|---|---|
| **N1** | Warehouse Role System | Enum BULK_HC_SP/DAILY_HC_SP/BULK_VTYT/DAILY_VTYT | 1 tuần |
| **N2** | Product Group System | Phân loại HC-SP vs VTYT | 1 tuần |
| **N3** | Dual-Keeper Permission (RLS theo role) | 4-5 thủ kho riêng, chỉ thấy kho mình quản lý | 1 tuần |
| **1** | Lot Lifecycle Management | Vòng đời lô (Quarantine → Approved → In Use) | 4 tuần |
| **3** | FEFO Enforcement | Auto-pick lot hạn ngắn nhất, áp dụng cả 4 kho | 2 tuần |
| **4** | Open-Vial Tracking | Ghi nhận mở nắp (chỉ HC-SP) | 2 tuần |
| **N4** | **Internal Replenishment (Weekly Auto-suggest)** | Sáng thứ 6 auto-suggest, 3 tháng + tuần gần nhất | 4 tuần |
| **N5** | Monthly Stock Take (Dual Scope) | 1 thủ kho kiểm 2 kho cùng mảng | 3 tuần |
| **N6** | Monthly Replenishment Request (Excel Export) | Xuất Excel mẫu BV, gửi 1 chiều | 3 tuần |
| **7** | Audit Log Viewer | Xem lịch sử thao tác theo TT54 | 1 tuần |

### 4.2. P1 — Quan trọng (5 modules, ~17 tuần, 4-5 tháng)

| # | Module | Mô tả | Effort |
|---|---|---|---|
| **2** | Lot-to-Lot Validation (CLSI EP26-A) | Đánh giá hiệu năng lô mới | 6 tuần |
| **6** | Internal Supplier Scorecard | Đánh giá Khoa Dược/Phòng VTYT | 3 tuần |
| **8** | Real-time Alerts (SMS/Email) | Cảnh báo expiry, safety stock | 4 tuần |
| **N7** | BV Excel Template Upload | Admin upload template mẫu BV | 2 tuần |
| **N8** | Keeper-scoped Reports | Báo cáo riêng cho thủ kho | 2 tuần |
| **(Bidding - điều chỉnh)** | Theo dõi hợp đồng thầu | Hạn thầu, cơ số thầu, cảnh báo | (chưa estimate) |

### 4.3. P2 — Cải tiến (5 modules, ~11 tuần)

| # | Module | Effort |
|---|---|---|
| 13 | Predictive Reorder (3 tháng + tuần gần nhất) | 4 tuần |
| 14 | Consumption Analytics Dashboard | 3 tuần |
| 15 | Stock Turnover Report | 2 tuần |
| 16 | Auto-Generate Stock Take Plan | 2 tuần |

### 4.4. Modules loại bỏ hoàn toàn

| Module | Lý do |
|---|---|
| ~~LIS/HIS Integration~~ | User không cần (ngoài scope) |
| ~~IoT Environmental Monitoring~~ | User không cần (ngoài scope) |

---

## 5. MODULE N4 — INTERNAL REPLENISHMENT (WEEKLY) — CẦN VIẾT SPEC ĐẦU TIÊN

### 5.1. Yêu cầu tổng quan
- **Mục đích**: Tự động đề xuất số lượng cần chuyển từ Kho chẵn → Kho lẻ mỗi tuần
- **Tần suất**: Mỗi thứ 6 hàng tuần (auto-trigger) + có thể chạy manual bất kỳ lúc nào
- **Phạm vi**: Áp dụng cho cả 2 mảng (HC-SP và VTYT), xử lý riêng
- **Người dùng**:
  - Thủ kho kho chẵn: Chạy chức năng, xem đề xuất
  - Thủ kho kho lẻ: Nhận hàng, confirm đề xuất
  - Trưởng khoa: Duyệt cuối cùng (nếu giá trị lớn)

### 5.2. Logic đề xuất số lượng

**Input**:
- Lượng tiêu hao **3 tháng gần nhất** (90 ngày) của kho lẻ
- Lượng tiêu hao **tuần gần nhất** (7 ngày) của kho lẻ
- Tồn kho hiện tại **kho lẻ** (`current_daily_qty`)
- Tồn kho hiện tại **kho chẵn** (`current_bulk_qty`)
- `minStock` và `maxStock` của Product (do thủ kho cấu hình)

**Công thức đề xuất** (cần user xác nhận chi tiết):
```
avg_3_months = SUM(consumption 90 ngày) / 13 tuần  (trung bình tuần)
avg_last_week = consumption 7 ngày gần nhất

# Dùng trung bình có trọng số (ưu tiên tuần gần nhất)
weighted_avg = (avg_3_months * 0.6) + (avg_last_week * 0.4)

# Mục tiêu: Đảm bảo kho lẻ đủ dùng trong 2 tuần
target_qty = weighted_avg * 2

# Đề xuất xuất = target - current_daily_qty (nếu > 0)
suggested_qty = MAX(0, target_qty - current_daily_qty)

# Giới hạn bởi tồn kho chẵn
final_qty = MIN(suggested_qty, current_bulk_qty)

# Không vượt maxStock
final_qty = MIN(final_qty, maxStock - current_daily_qty)
```

**Edge cases cần xử lý**:
- Sản phẩm mới (chưa có 3 tháng data) → dùng `minStock` làm mặc định
- Kho chẵn hết hàng → báo "Cần đề xuất nhập từ Khoa Dược/Phòng VTYT"
- Lô trong kho chẵn sắp hết hạn (FEFO) → ưu tiên chuyển lô đó trước
- Sản phẩm không có trong kho lẻ → bỏ qua (chỉ đề xuất cho sản phẩm đã từng có trong kho lẻ)

### 5.3. Workflow

```
[Thứ 6, 8:00 sáng] Auto-trigger (cron job)
        ↓
Hệ thống tính toán đề xuất cho TẤT CẢ sản phẩm trong 2 kho lẻ
        ↓
Tạo "Replenishment Draft" (chưa có chuyển kho thật)
        ↓
Gửi notification cho thủ kho kho chẵn (email + trong app)
        ↓
Thủ kho kho chẵn mở app → xem danh sách đề xuất
        ↓
Thủ kho điều chỉnh số lượng (nếu cần) + chọn Lot theo FEFO
        ↓
Nhấn "Tạo phiếu chuyển kho" → tạo Transfer draft
        ↓
Thủ kho kho lẻ nhận notification → vào app xác nhận
        ↓
Thủ kho kho lẻ SHIP (chuyển hàng vật lý) → nhấn "Xác nhận đã nhận"
        ↓
Hệ thống tự tạo StockMovement (TRANSFER_OUT + TRANSFER_IN)
        ↓
Cập nhật tồn kho + lịch sử
```

### 5.4. UI cần thiết

| Trang | Mô tả |
|---|---|
| `/replenishment/weekly` | Dashboard xem các đề xuất tuần này (cả 2 mảng) |
| `/replenishment/weekly/[id]` | Chi tiết 1 đề xuất (line items, điều chỉnh số lượng, chọn Lot FEFO) |
| `/replenishment/weekly/history` | Lịch sử các lần chuyển kho đã hoàn thành |

### 5.5. Schema cần thêm

```sql
-- Bảng đề xuất tuần
CREATE TABLE weekly_replenishment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_group TEXT NOT NULL,        -- HOA_CHAT_SINH_PHAM | VAT_TU_Y_TE
  warehouse_role_from TEXT NOT NULL,  -- BULK_HC_SP | BULK_VTYT
  warehouse_role_to TEXT NOT NULL,    -- DAILY_HC_SP | DAILY_VTYT
  
  period_date DATE NOT NULL,          -- Ngày thứ 6 của tuần
  
  status TEXT DEFAULT 'DRAFT',
  -- DRAFT, REVIEWED, TRANSFERRING, COMPLETED, CANCELLED
  
  triggered_by TEXT,                  -- 'CRON' | user_id
  created_by UUID,
  reviewed_by UUID,                   -- Thủ kho kho chẵn
  approved_by UUID,                   -- Trưởng khoa (nếu cần)
  
  completed_at TIMESTAMPTZ,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Line items
CREATE TABLE weekly_replenishment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES weekly_replenishment_runs(id),
  product_id UUID NOT NULL,
  
  -- Input data (snapshot tại thời điểm tạo)
  current_daily_qty INT,
  current_bulk_qty INT,
  avg_consumption_3m DECIMAL,
  avg_consumption_last_week DECIMAL,
  min_stock INT,
  max_stock INT,
  
  -- Đề xuất
  suggested_qty INT,
  adjusted_qty INT,                   -- Thủ kho điều chỉnh
  final_qty INT,                      -- Số lượng thực tế chuyển
  
  -- Lot selection (FEFO)
  selected_lot_id UUID,
  selected_lot_expiration DATE,
  
  -- Transfer reference
  transfer_id UUID,                   -- Reference đến Transfer document
  
  status TEXT DEFAULT 'PENDING',
  -- PENDING, TRANSFERRING, COMPLETED, SKIPPED
  
  notes TEXT
);
```

### 5.6. Edge Function cần tạo

**`compute-weekly-replenishment`** (chạy thứ 6, 8:00 sáng):
```typescript
// Input: period_date, product_group (optional)
// 1. Lấy tất cả products trong product_group
// 2. Với mỗi product:
//    a. Tính consumption 90 ngày + 7 ngày
//    b. Lấy tồn kho DAILY + BULK
//    c. Tính suggested_qty theo công thức
//    d. Auto-select Lot FEFO từ BULK
// 3. Tạo weekly_replenishment_runs + lines
// 4. Trả về run_id

// Schedule: pg_cron hoặc Supabase Edge Function cron
// 0 8 * * 5  (8:00 sáng thứ 6)
```

### 5.7. API Hooks cần tạo

```typescript
// Queries
useWeeklyReplenishmentRuns(params: { periodDate?, productGroup?, status? })
useWeeklyReplenishmentRun(id: string)
useProductsForReplenishment(warehouseRole: 'BULK_HC_SP' | 'BULK_VTYT')

// Mutations
useAdjustReplenishmentLine()    // Thủ kho điều chỉnh số lượng
useCreateTransferFromReplenishment()  // Tạo Transfer từ đề xuất
useConfirmReplenishmentReceipt()  // Thủ kho lẻ xác nhận đã nhận
```

### 5.8. Câu hỏi cần user xác nhận trước khi viết code

1. **Công thức đề xuất** ở mục 5.2 có hợp lý không? Cần điều chỉnh trọng số (0.6/0.4) không?
2. **Hệ số "2 tuần buffer"** có phù hợp, hay nên dùng 1.5 tuần / 2.5 tuần?
3. Khi **kho chẵn hết hàng**, hệ thống nên:
   - (a) Chỉ cảnh báo, không tạo đề xuất
   - (b) Tự động tạo đề xuất nhập từ Khoa Dược/Phòng VTYT (gửi kèm monthly dự trù)
   - (c) Khác?
4. **Có cần Trưởng khoa duyệt** mỗi tuần không, hay chỉ duyệt khi giá trị lớn (> X VNĐ)?
5. **Thủ kho kho lẻ** có cần quyền điều chỉnh số lượng đề xuất không, hay chỉ thủ kho kho chẵn mới có quyền?

---

## 6. CÁC MODULE CẦN VIẾT SPEC TIẾP THEO

Theo thứ tự ưu tiên (sau khi SPEC #1 được duyệt):

| STT | Module | File đề xuất |
|---|---|---|
| 2 | **SPEC #2: Monthly Replenishment Request (Excel Export)** | `docs/plans/2026-06-XX-monthly-replenishment-spec.md` |
| 3 | **SPEC #3: Lot Lifecycle Management** | `docs/plans/2026-06-XX-lot-lifecycle-spec.md` |
| 4 | **SPEC #4: Monthly Stock Take (Dual Scope)** | `docs/plans/2026-06-XX-monthly-stocktake-spec.md` |
| 5 | **SPEC #5: Warehouse Role + Product Group + Permission** | `docs/plans/2026-06-XX-warehouse-role-spec.md` |
| 6 | **SPEC #6: FEFO Enforcement** | `docs/plans/2026-06-XX-fefo-spec.md` |
| 7 | **SPEC #7: Open-Vial Tracking** | `docs/plans/2026-06-XX-open-vial-spec.md` |
| 8 | **SPEC #8: Bidding — Theo dõi hợp đồng thầu** | `docs/plans/2026-06-XX-bid-tracking-spec.md` |

---

## 7. CONTEXT BỔ SUNG

### 7.1. Trạng thái Cloudflare deploy (đã fix)
- **Production live** với Modern SaaS Redesign (commit `fdbf961`)
- Canonical deployment: `ce1927f4`
- Webpack hash mới: `9467d715883570b1`
- Env vars production đã set (Supabase URL + Anon Key)
- 5 commits gần nhất:
  ```
  fdbf961 fix(deploy): add apps/web/.env.production for Cloudflare build
  b6d5d4d fix(deploy): use 'npx next-on-pages' for binary resolution
  cd7d761 fix(deploy): downgrade Next 15.5.19 → 15.5.2 + add @cloudflare/next-on-pages
  6de1eea chore(lockfile): sync pnpm-lock.yaml for @radix-ui/react-dropdown-menu
  db7376b feat(ui): Modern SaaS dashboard - pill nav, hero banner, quick access grid
  ```

### 7.2. Memory files quan trọng
Đã tạo các file memory trong `C:\Users\HAPPY\.claude\projects\D--T----ng-h-a-Qu-n-kho-v-t-t--Pro\memory\`:
- `cloudflare-deploy-fix-2026-06-14.md` — Fix Cloudflare build
- `cloudflare-env-injection-2026-06-14.md` — Cloudflare env model
- `modern-saas-redesign-2026-06-14.md` — UI redesign
- `handover-modern-saas-2026-06-14.md` — Handover UI redesign (cũ)
- `yearly-forecast-state-2026-06-13.md` — Yearly forecast
- `mobile-ui-fixes-2026-06-13.md` — Mobile responsive

### 7.3. Cấu trúc thư mục plans/
- `2026-06-10-import-stock-snapshot-design.md` — Design có sẵn
- `2026-06-14-khoa-xn-handover.md` — File này

### 7.4. Tooling sẵn có
- **MCP Cloudflare** (deploy, list, retry, rollback, domains)
- **MCP Render** (services, postgres, metrics, logs)
- **MCP Supabase** (chưa có tools rõ ràng, dùng `psql` hoặc Dashboard)
- **MCP Codegraph** (code intelligence)
- **Pandoc** (chưa có — cài nếu cần đọc docx)
- **docx skill** (đã dùng để đọc file yêu cầu)

---

## 8. HÀNH ĐỘNG TIẾP THEO (cho session mới)

### 8.1. Bước 1: Viết SPEC #1 (Internal Replenishment Weekly)
- Tạo file `docs/plans/2026-06-XX-internal-replenishment-spec.md`
- Dùng cấu trúc:
  1. Mục đích & phạm vi
  2. Actors (ai dùng)
  3. Workflow chi tiết
  4. Logic tính toán (công thức đề xuất)
  5. Schema chi tiết
  6. API hooks
  7. UI wireframes (text-based)
  8. Edge cases & xử lý lỗi
  9. Acceptance criteria
- **SAU KHI VIẾT XONG, DỪNG LẠI — chờ user review/chỉnh sửa trước khi code**

### 8.2. Bước 2: Sau khi SPEC #1 được duyệt
- Lặp lại quy trình cho SPEC #2, #3, ...
- Mỗi SPEC viết xong đều dừng lại chờ user review

### 8.3. Bước 3: Bắt đầu code
- Chỉ bắt đầu code khi user nói rõ "OK, code đi"
- Ưu tiên code theo thứ tự P0
- Mỗi module code xong → test → commit → deploy

---

## 9. TÓM TẮT NHANH (cho session mới đọc nhanh)

**Dự án**: Phần mềm quản lý kho xét nghiệm cho Bệnh viện Công lập VN
**Stack**: Next.js 15.5.2 + Supabase + Cloudflare Pages
**Mô hình**: 4 kho (BULK_HC_SP / DAILY_HC_SP / BULK_VTYT / DAILY_VTYT) với 4-5 thủ kho riêng
**Tuần**: Thứ 6 auto-suggest chuyển kho chẵn → kho lẻ
**Tháng**: Kiểm kê tháng → xuất Excel dự trù gửi Khoa Dược / Phòng VTYT
**SPEC đầu tiên cần viết**: Internal Replenishment Weekly
**Quy trình**: Viết SPEC → user review → chỉnh sửa → user duyệt → mới code

---

**Người viết**: Claude (session cũ)
**Ngày**: 2026-06-14
**Trạng thái**: Đang chờ user review các câu hỏi ở mục 5.8 trước khi viết SPEC #1
