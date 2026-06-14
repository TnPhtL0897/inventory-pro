# SPEC #4: Monthly Stock Take (Dual Scope) — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: N5 (P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 2.3, 4.1
> **Phụ thuộc**: SPEC #3 (Lot Lifecycle), N1 (Warehouse Role)

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Hỗ trợ **kiểm kê định kỳ hàng tháng** theo đúng quy trình Khoa XN: 1 thủ kho phụ trách kiểm cả 2 kho (chẵn + lẻ) của cùng mảng, đối chiếu với sổ sách, ghi nhận chênh lệch, Trưởng khoa duyệt trước khi cập nhật tồn kho.

### 1.2. Phạm vi
- **Trong scope**:
  - Tạo đợt kiểm kê tháng cho từng mảng (HC-SP / VTYT)
  - Thủ kho nhập số liệu kiểm kê **theo lô** (lot_number, expiration, số lượng thực tế)
  - Hệ thống tự động so sánh với tồn kho trong sổ → tính chênh lệch
  - Thủ kho nhập lý do chênh lệch + Trưởng khoa duyệt
  - Sau duyệt → cập nhật tồn kho + tạo StockMovement điều chỉnh
  - Báo cáo kiểm kê theo tháng
- **Ngoài scope**:
  - Kiểm kê đột xuất (sẽ là P2 — Auto-Generate Stock Take Plan)
  - Kiểm kê toàn bộ bệnh viện (multi-tenant)
  - Quản lý biên bản kiểm kê giấy (số hóa sau)

### 1.3. Tuân thủ quy định
- **QĐ 2429/BYT** Tiêu chí 7.2: Kiểm kê định kỳ
- **ISO 15189:2022** Điều 6.5.3: Kiểm soát tồn kho vật tư
- **TT 54/2017/BYT**: Audit log

---

## 2. ACTORS (Người dùng)

| Actor | Mô tả | Quyền |
|---|---|---|
| **Thủ kho** (BULK hoặc DAILY của 1 mảng) | Người trực tiếp kiểm kê | Tạo đợt KK, nhập số liệu, nhập lý do chênh lệch |
| **Trưởng khoa (DEPT_HEAD)** | Duyệt chênh lệch | Xem tất cả đợt KK, duyệt chênh lệch, đóng đợt KK |
| **Hệ thống (CRON)** | Auto reminder | Nhắc tạo đợt KK cuối tháng |

### 2.1. Phân quyền theo role
- `KEEPER_BULK_HC_SP` + `KEEPER_DAILY_HC_SP` → tạo + nhập liệu KK HC-SP
- `KEEPER_BULK_VTYT` + `KEEPER_DAILY_VTYT` → tạo + nhập liệu KK VTYT
- `DEPT_HEAD` → duyệt tất cả

### 2.2. Quy tắc "Dual Scope" (1 thủ kho = 2 kho)
- Với HC-SP: thủ kho BULK và 2 thủ kho DAILY (3 người) chia nhau theo ca/tuần
- Với VTYT: tương tự (cần xác nhận số người)
- Mỗi đợt KK chỉ có 1 thủ kho chịu trách nhiệm chính (assigned_to), kiểm cả 2 kho
- Thủ kho khác có thể xem (audit) nhưng không sửa

---

## 3. WORKFLOW CHI TIẾT

```
[CRON cuối tháng, ngày 28-30] Gửi reminder cho thủ kho
        ↓
[Thủ kho] Tạo Monthly Stock Take
  - Chọn tháng/năm
  - Chọn mảng (HC-SP / VTYT)
  - Hệ thống tự động tạo snapshot tồn kho hiện tại
  - status = DRAFT
        ↓
[Thủ kho] Đối chiếu sổ sách giấy trước (offline)
        ↓
[Thủ kho] Bắt đầu kiểm kê vật lý
  - Đi đến kho chẵn, kiểm từng lô
  - Scan QR code lô hoặc chọn từ danh sách
  - Nhập số lượng thực tế
        ↓
[Thủ kho] Tiếp tục kiểm kho lẻ (cùng mảng)
        ↓
[Thủ kho] Hoàn tất nhập liệu → status = SUBMITTED
        ↓
[Hệ thống] Tự tính chênh lệch:
  - count_diff = actual_qty - book_qty
  - Cảnh báo nếu |count_diff| > 0
        ↓
[Thủ kho] Nhập lý do chênh lệch cho từng dòng (bắt buộc nếu có chênh lệch)
        ↓
[Thủ kho] Nhấn "Gửi Trưởng khoa duyệt" → status = PENDING_APPROVAL
        ↓
[Trưởng khoa] Nhận notification → mở app
        ↓
[Trưởng khoa] Xem chi tiết:
  - Danh sách chênh lệch
  - Lý do thủ kho nhập
        ↓
[Trưởng khoa] Duyệt:
  ├─ Nhấn "Duyệt tất cả" → status = APPROVED → tự động cập nhật tồn kho
  ├─ Nhấn "Duyệt có chọn lọc" → chọn từng dòng, status từng dòng = APPROVED/REJECTED
  └─ Nhấn "Yêu cầu kiểm lại" → status = REJECTED, yêu cầu thủ kho kiểm lại
        ↓
[Hệ thống] Sau khi APPROVED:
  - Cập nhật `lots.quantity` theo actual_qty
  - Tạo StockMovement (loại: STOCKTAKE_ADJUSTMENT) với quantity = count_diff
  - Cập nhật tồn kho (stock table)
  - status = COMPLETED
        ↓
[Trưởng khoa] Đóng đợt KK, in báo cáo
```

### 3.1. Trạng thái (status) của Stock Take
- `DRAFT` — Mới tạo, thủ kho chưa bắt đầu
- `IN_PROGRESS` — Thủ kho đang nhập liệu
- `SUBMITTED` — Thủ kho đã nhập xong, gửi duyệt
- `PENDING_APPROVAL` — Đã gửi, chờ Trưởng khoa
- `APPROVED` — Đã duyệt (đang cập nhật tồn kho)
- `COMPLETED` — Hoàn tất
- `REJECTED` — Trưởng khoa yêu cầu kiểm lại
- `CANCELLED` — Hủy bỏ (vd: tạo nhầm tháng)

### 3.2. Trạng thái của Line (lô trong đợt KK)
- `PENDING` — Chưa kiểm
- `COUNTED` — Đã nhập số lượng
- `APPROVED` — Chênh lệch được duyệt
- `REJECTED` — Trưởng khoa từ chối, yêu cầu kiểm lại
- `SKIPPED` — Bỏ qua (lý do: không còn trong kho)

---

## 4. LOGIC TÍNH TOÁN

### 4.1. Snapshot tồn kho (khi tạo đợt KK)
```
# Tại thời điểm tạo:
book_qty(lot) = lots.quantity (cho mỗi lô trong kho)
# Snapshot lưu vào stocktake_snapshots
```

### 4.2. Tính chênh lệch
```
actual_qty = Số lượng thủ kho nhập khi kiểm kê
book_qty = Số lượng trong sổ (snapshot)

count_diff = actual_qty - book_qty

# Phân loại:
if count_diff = 0: "KHỚP"
if count_diff > 0: "THỪA"  (vd: actual=10, book=8 → +2)
if count_diff < 0: "THIẾU"  (vd: actual=8, book=10 → -2)
```

### 4.3. Cảnh báo chênh lệch lớn
- Nếu `|count_diff|` > 10% book_qty → flag "CHENH_LECH_LON" → bắt buộc nhập lý do chi tiết
- Nếu `|count_diff|` > 0 nhưng ≤ 10% → flag "CHENH_LECH_NHO", vẫn cần lý do
- Tổng giá trị chênh lệch > 5M VNĐ → cảnh báo đặc biệt cho Trưởng khoa

### 4.4. StockMovement tự động sinh (sau khi APPROVED)
```
Với mỗi line được duyệt có count_diff != 0:
  Tạo StockMovement:
    - movement_type = 'STOCKTAKE_ADJUSTMENT'
    - lot_id = line.lot_id
    - warehouse_id = line.warehouse_id
    - quantity = count_diff (âm hoặc dương)
    - reason = line.discrepancy_reason
    - reference_type = 'STOCKTAKE'
    - reference_id = stocktake.id
    - created_by = DEPT_HEAD
```

### 4.5. Edge cases
| Trường hợp | Xử lý |
|---|---|
| Lô mới nhập trong tháng (chưa có trong snapshot) | Thêm vào KK dưới dạng "NEW" (book_qty = 0) |
| Lô đã hết hàng (DEPLETED) trước khi KK | Vẫn hiển thị trong KK để xác nhận (book_qty = 0, actual = 0) |
| Lô bị recall (BLOCKED) | Vẫn kiểm kê (cần xác nhận còn trong kho vật lý) |
| Lô bị DESTROYED/EXPIRED trong tháng | Loại khỏi KK |
| 1 tháng có 2 đợt KK (KK phụ) | Cho phép, status = CANCELLED cho đợt cũ |
| Thủ kho bỏ sót nhiều lô | Cảnh báo "Còn X lô chưa kiểm" |
| Chênh lệch > 50% book_qty | Cảnh báo đỏ, yêu cầu kiểm lại lần 2 |
| Tạo KK tháng mới khi tháng cũ chưa hoàn tất | Cảnh báo, yêu cầu đóng tháng cũ trước |

### 4.6. Ví dụ
**Lô Glucose L123** trong kho BULK_HC_SP:
- book_qty (snapshot) = 50
- Thủ kho đếm thực tế = 48
- count_diff = 48 - 50 = -2 (THIẾU)
- Lý do: "2 chai bị vỡ trong quá trình sử dụng"
- Sau duyệt → cập nhật lots.quantity = 48, tạo StockMovement STOCKTAKE_ADJUSTMENT quantity = -2

---

---

## 5. SCHEMA CHI TIẾT

```sql
-- ============================================================
-- MODULE N5: MONTHLY STOCK TAKE (DUAL SCOPE)
-- File: supabase/migrations/20260614_monthly_stocktake.sql
-- ============================================================

-- ENUMs
CREATE TYPE stocktake_status AS ENUM (
  'DRAFT', 'IN_PROGRESS', 'SUBMITTED',
  'PENDING_APPROVAL', 'APPROVED', 'COMPLETED',
  'REJECTED', 'CANCELLED'
);

CREATE TYPE stocktake_line_status AS ENUM (
  'PENDING', 'COUNTED', 'APPROVED', 'REJECTED', 'SKIPPED'
);

-- Bảng stocktakes (đợt KK)
CREATE TABLE stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_group TEXT NOT NULL CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),

  -- Kỳ KK
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INT NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),

  -- Phạm vi (đã chốt: 1 thủ kho = 2 kho cùng mảng)
  -- Lưu warehouses covered trong JSONB array
  warehouse_ids UUID[] NOT NULL,

  -- Trạng thái
  status stocktake_status NOT NULL DEFAULT 'DRAFT',

  -- Snapshot timestamp
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Người tham gia
  assigned_to UUID NOT NULL REFERENCES auth.users(id),  -- Thủ kho chịu trách nhiệm chính
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),

  -- Thống kê
  total_lots_counted INT DEFAULT 0,
  total_discrepancies INT DEFAULT 0,
  total_discrepancy_value DECIMAL(15, 2) DEFAULT 0,

  -- Duyệt
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  completed_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (tenant_id, product_group, period_year, period_month)
);

CREATE INDEX idx_stocktakes_tenant_period ON stocktakes(tenant_id, period_year DESC, period_month DESC);
CREATE INDEX idx_stocktakes_status ON stocktakes(tenant_id, status);

-- Bảng stocktake_lines (chi tiết từng lô trong đợt KK)
CREATE TABLE stocktake_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,

  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- Snapshot (tại thời điểm tạo stocktake)
  book_quantity DECIMAL(15, 3) NOT NULL,       -- Tồn kho sổ
  book_unit_price DECIMAL(15, 2),              -- Đơn giá tại thời điểm snapshot

  -- Thực tế (thủ kho nhập)
  actual_quantity DECIMAL(15, 3),              -- NULL nếu chưa đếm
  counted_at TIMESTAMPTZ,
  counted_by UUID REFERENCES auth.users(id),

  -- Tính toán
  discrepancy DECIMAL(15, 3),                  -- = actual - book
  discrepancy_type TEXT,                       -- 'KHOP' | 'THUA' | 'THIEU'
  discrepancy_value DECIMAL(15, 2),            -- Giá trị chênh lệch (=|discrepancy| * unit_price)
  discrepancy_percent DECIMAL(5, 2),           -- % chênh lệch

  -- Lý do (bắt buộc nếu có chênh lệch)
  discrepancy_reason TEXT,
  discrepancy_category TEXT,                   -- 'BROKEN' | 'EXPIRED_BUT_NOT_FLAGGED' | 'MISCOUNT' | 'THEFT' | 'OTHER'

  -- Cờ cảnh báo
  is_large_discrepancy BOOLEAN DEFAULT FALSE,  -- > 10% hoặc > 5M
  is_high_value_discrepancy BOOLEAN DEFAULT FALSE,

  -- Duyệt
  status stocktake_line_status NOT NULL DEFAULT 'PENDING',
  line_approved_by UUID REFERENCES auth.users(id),
  line_approved_at TIMESTAMPTZ,
  line_rejection_reason TEXT,

  -- Stock movement phát sinh
  stock_movement_id UUID REFERENCES stock_movements(id),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (stocktake_id, lot_id, warehouse_id)
);

CREATE INDEX idx_stl_stocktake ON stocktake_lines(stocktake_id);
CREATE INDEX idx_stl_lot ON stocktake_lines(lot_id);
CREATE INDEX idx_stl_status ON stocktake_lines(stocktake_id, status);

-- View tiện truy vấn
CREATE OR REPLACE VIEW v_stocktake_summary AS
SELECT
  s.id AS stocktake_id,
  s.tenant_id,
  s.product_group,
  s.period_year,
  s.period_month,
  s.status,
  s.total_lots_counted,
  s.total_discrepancies,
  s.total_discrepancy_value,
  s.assigned_to,
  u.email AS assigned_to_email,
  COUNT(l.id) FILTER (WHERE l.status = 'COUNTED') AS lines_counted,
  COUNT(l.id) FILTER (WHERE l.status = 'PENDING') AS lines_pending,
  COUNT(l.id) FILTER (WHERE l.discrepancy != 0) AS lines_with_discrepancy
FROM stocktakes s
LEFT JOIN auth.users u ON u.id = s.assigned_to
LEFT JOIN stocktake_lines l ON l.stocktake_id = s.id
GROUP BY s.id, u.email;

-- Function tạo stocktake + snapshot tự động
CREATE OR REPLACE FUNCTION fn_create_monthly_stocktake(
  p_tenant_id UUID,
  p_product_group TEXT,
  p_period_month INT,
  p_period_year INT,
  p_warehouse_ids UUID[],
  p_assigned_to UUID,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_stocktake_id UUID;
  v_warehouse_id UUID;
  v_lot RECORD;
BEGIN
  -- Tạo stocktake
  INSERT INTO stocktakes (tenant_id, product_group, period_month, period_year, warehouse_ids, assigned_to, created_by, status, snapshot_at)
  VALUES (p_tenant_id, p_product_group, p_period_month, p_period_year, p_warehouse_ids, p_assigned_to, p_created_by, 'DRAFT', now())
  RETURNING id INTO v_stocktake_id;

  -- Tạo lines cho mỗi lô trong các warehouse
  FOREACH v_warehouse_id IN ARRAY p_warehouse_ids
  LOOP
    FOR v_lot IN
      SELECT l.id, l.product_id, l.quantity, l.expiration_date, l.lot_number
      FROM lots l
      JOIN products p ON p.id = l.product_id
      WHERE l.warehouse_id = v_warehouse_id
        AND p.tenant_id = p_tenant_id
        AND p.product_group = p_product_group
        AND l.status NOT IN ('DESTROYED', 'EXPIRED')  -- Bỏ lô đã hủy/hết hạn
        AND l.quantity > 0
    LOOP
      INSERT INTO stocktake_lines (stocktake_id, lot_id, product_id, warehouse_id, book_quantity, status)
      VALUES (v_stocktake_id, v_lot.id, v_lot.product_id, v_warehouse_id, v_lot.quantity, 'PENDING');
    END LOOP;
  END LOOP;

  RETURN v_stocktake_id;
END;
$$;

-- RLS
ALTER TABLE stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_stocktakes_keeper_hc" ON stocktakes
  FOR ALL USING (
    product_group = 'HOA_CHAT_SINH_PHAM'
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP')
  );

CREATE POLICY "rls_stocktakes_keeper_vtyt" ON stocktakes
  FOR ALL USING (
    product_group = 'VAT_TU_Y_TE'
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT')
  );

CREATE POLICY "rls_stocktakes_dept_head" ON stocktakes
  FOR SELECT USING ((auth.jwt() ->> 'role') = 'DEPT_HEAD');

COMMENT ON TABLE stocktakes IS 'Đợt kiểm kê tháng - 1 thủ kho kiểm cả 2 kho cùng mảng';
COMMENT ON TABLE stocktake_lines IS 'Chi tiết từng lô trong đợt kiểm kê';
```

---

## 6. API HOOKS

```typescript
// src/lib/hooks/useStocktake.ts

// QUERIES
export function useStocktakes(params: { productGroup?; periodYear?; periodMonth?; status?; }) { /* list */ }
export function useStocktake(id: string) { /* chi tiết + lines */ }
export function useMyAssignedStocktakes() { /* Đợt KK assigned cho tôi */ }
export function useStocktakeHistory(limit?: number) { /* Lịch sử */ }

// MUTATIONS
export function useCreateStocktake() { /* Tạo mới + snapshot tự động */ }
export function useCountStocktakeLine() { /* Thủ kho nhập actual_qty + lý do */ }
export function useSubmitStocktakeForApproval() { /* SUBMITTED → PENDING_APPROVAL */ }
export function useApproveStocktakeLine() { /* Duyệt từng line */ }
export function useApproveAllStocktakeLines() { /* Duyệt tất cả */ }
export function useRejectStocktake() { /* Yêu cầu kiểm lại */ }
export function useCancelStocktake() { /* Hủy */ }

// EDGE FUNCTION: process-stocktake-approval
// - Cập nhật lots.quantity theo actual_qty
// - Tạo StockMovement STOCKTAKE_ADJUSTMENT
// - Cập nhật stock table
```

---

---

## 7. UI WIREFRAMES

### 7.1. Dashboard `/stocktakes`

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Kiểm kê tháng                                                 │
│  [HC-SP] [VTYT] [Tất cả]                                         │
│                                                                  │
│  ┌─── Tháng 06/2026 (đang làm) ─────────────────────────────┐    │
│  │ ST-2026-06-HC    Trạng thái: IN_PROGRESS                  │    │
│  │ Kho: BULK_HC_SP + DAILY_HC_SP                             │    │
│  │ Thủ kho: Nguyễn Văn A                                     │    │
│  │ Tổng: 45 lô | Đã đếm: 32 | Chênh lệch: 3 lô (250K)       │    │
│  │ Tạo: 28/06/2026                                           │    │
│  │                                        [Tiếp tục kiểm →]  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Tháng 06/2026 (chờ duyệt) ────────────────────────────┐    │
│  │ ST-2026-06-VTYT  Trạng thái: PENDING_APPROVAL             │    │
│  │ Thủ kho: Trần Thị B | Gửi: 30/06 14:30                    │    │
│  │ Tổng: 28 lô | Chênh lệch: 5 lô (1.2M)                    │    │
│  │                                              [Duyệt →]     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Lịch sử ──────────────────────────────────────────────┐    │
│  │ 05/2026 HC-SP: COMPLETED | Tổng chênh lệch: 800K          │    │
│  │ 05/2026 VTYT: COMPLETED | Tổng chênh lệch: 250K          │    │
│  │ 04/2026 HC-SP: COMPLETED | Tổng chênh lệch: 1.5M          │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2. Trang kiểm kê `/stocktakes/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 ST-2026-06-HC — Kiểm kê tháng 06/2026 (HC-SP)               │
│  Kho: BULK_HC_SP + DAILY_HC_SP                                   │
│                                                                  │
│  [Bộ lọc: Tất cả | Chưa đếm | Có chênh lệch | Khớp]             │
│  Tìm: [________]                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Lô        │ SP          │ Kho    │ Sổ │ Thực tế │ Lệch │ Lý do│
│  │───────────┼─────────────┼────────┼────┼─────────┼──────┼──────│
│  │ L123      │ Glucose     │ BULK   │ 50 │ [48____] │ -2🔴 │ [vỡ]│
│  │           │             │        │    │          │      │      │
│  │           │             │        │    │          │      │[💾]  │
│  │───────────┼─────────────┼────────┼────┼─────────┼──────┼──────│
│  │ L456      │ HBsAg       │ BULK   │ 30 │ [30____] │  0   │  -   │
│  │───────────┼─────────────┼────────┼────┼─────────┼──────┼──────│
│  │ L100      │ Glucose     │ DAILY  │  5 │ [___]   │  ?   │ [Đếm]│
│  │ (chưa đếm)│             │        │    │          │      │      │
│  │───────────┼─────────────┼────────┼────┼─────────┼──────┼──────│
│  │ ...       │ ...         │ ...    │... │ ...     │ ...  │ ...  │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  📊 Tổng: 45 lô | Đã đếm: 32 | Còn lại: 13                       │
│  ⚠️ Chênh lệch: 3 lô (Tổng giá trị: 250K)                      │
│                                                                  │
│  [💾 Lưu nháp]  [📤 Gửi Trưởng khoa duyệt]  [❌ Hủy]             │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3. Modal nhập lý do chênh lệch (bắt buộc khi count_diff ≠ 0)

```
┌─────────────────────────────────────────────────┐
│  ⚠️ Nhập lý do chênh lệch                       │
│  ─────────────────────────────────────────────  │
│  Lô: L123 - Glucose                              │
│  Sổ: 50 | Thực tế: 48 | Chênh lệch: -2 (THIẾU)  │
│  Tỷ lệ: 4% (chênh lệch nhỏ)                      │
│                                                  │
│  Phân loại (bắt buộc):                           │
│  ● Hỏng vật lý (vỡ/rách)                        │
│  ○ Hết hạn nhưng chưa được flag                  │
│  ○ Sai số đếm                                    │
│  ○ Thất thoát / mất cắp                          │
│  ○ Khác                                         │
│                                                  │
│  Mô tả chi tiết (bắt buộc):                      │
│  [2 chai vỡ trong quá trình sử dụng ngày______]│
│  [25/06, đã báo cáo nội bộ.__________________] │
│                                                  │
│  File đính kèm (optional):                       │
│  [📎 Upload ảnh chứng minh]                     │
│                                                  │
│              [Hủy]  [💾 Lưu]                    │
└─────────────────────────────────────────────────┘
```

### 7.4. Trang duyệt (Trưởng khoa)

```
┌──────────────────────────────────────────────────────────────────┐
│  ✅ Duyệt kiểm kê ST-2026-06-HC                                  │
│  Tháng 06/2026 (HC-SP) | Thủ kho: Nguyễn Văn A                   │
│                                                                  │
│  📊 Tổng quan:                                                   │
│  - Tổng lô đếm: 45                                              │
│  - Lô chênh lệch: 3 (giá trị 250K - dưới ngưỡng 5M)              │
│  - Khớp: 42 | Chờ duyệt: 3                                      │
│                                                                  │
│  ┌─── Chi tiết chênh lệch ─────────────────────────────────┐    │
│  │ ☐ L123 Glucose: -2 chai (250K) - Lý do: Hỏng vật lý    │    │
│  │   📎 [ảnh_vỡ_chai.jpg]                                  │    │
│  │                                                        │    │
│  │ ☐ L789 Urea: -1 chai (50K) - Lý do: Sai số đếm         │    │
│  │                                                        │    │
│  │ ☐ L456 HBsAg: +1 chai (300K) - Lý do: Hết hạn chưa flag│    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [💬 Yêu cầu kiểm lại]  [✅ Duyệt tất cả]  [✅ Duyệt có chọn lọc]│
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| 2 thủ kho cùng edit 1 line | Optimistic lock + check status |
| Trưởng khoa duyệt trong khi thủ kho vẫn đang nhập | Validation: status phải = SUBMITTED |
| Tổng giá trị chênh lệch > 5M | Cảnh báo đặc biệt, yêu cầu xem xét kỹ |
| Lô có actual_qty âm (do lỗi nhập) | Validation: actual_qty ≥ 0 |
| Tạo KK tháng mới khi tháng cũ chưa COMPLETED | Cảnh báo "Còn X đợt KK chưa đóng" |
| Thủ kho nhập xong nhưng quên 1 lô | Hệ thống cảnh báo "Còn X lô chưa đếm" trước khi cho SUBMIT |
| 1 lô có 2 line trong cùng KK (do lỗi) | UNIQUE constraint trên (stocktake_id, lot_id, warehouse_id) |
| Lô bị xóa/EXPIRED giữa chừng KK | Line → SKIPPED, không ảnh hưởng các line khác |
| Đã COMPLETED nhưng phát hiện sai | Tạo KK mới tháng đó (cancel đợt cũ trước) |
| Cron EXPIRED từ SPEC #3 chạy trong khi đang KK | Có thể conflict nếu lô vừa EXPIRED đang được kiểm → cảnh báo |

---

## 9. ACCEPTANCE CRITERIA

### 9.1. Functional
- [ ] **AC-1**: Cron cuối tháng nhắc thủ kho tạo KK
- [ ] **AC-2**: Tạo KK tự động snapshot tồn kho
- [ ] **AC-3**: Thủ kho nhập actual_qty theo lô
- [ ] **AC-4**: Tự động tính count_diff + flag KHỚP/THỪA/THIẾU
- [ ] **AC-5**: Chênh lệch > 10% hoặc > 5M → flag đỏ
- [ ] **AC-6**: Bắt buộc nhập lý do + phân loại khi có chênh lệch
- [ ] **AC-7**: Trưởng khoa duyệt (tất cả / có chọn lọc / yêu cầu kiểm lại)
- [ ] **AC-8**: Sau duyệt → cập nhật lots.quantity + tạo StockMovement STOCKTAKE_ADJUSTMENT
- [ ] **AC-9**: RLS: thủ kho VTYT không thấy KK HC-SP
- [ ] **AC-10**: Báo cáo KK theo tháng (tổng chênh lệch, giá trị, xuất PDF)
- [ ] **AC-11**: Audit log đầy đủ

### 9.2. Non-functional
- [ ] **AC-12**: Tạo KK + snapshot trong < 30 giây (1000 lô)
- [ ] **AC-13**: Mobile responsive (cho thủ kho đi kiểm)
- [ ] **AC-14**: QR code scan nhanh < 1 giây

### 9.3. Test cases
| # | Test case | Expected |
|---|---|---|
| TC-1 | Cron nhắc cuối tháng | Email + in-app notification cho thủ kho |
| TC-2 | Tạo KK tháng 06/2026 HC-SP | Snapshot 45 lô, status = DRAFT |
| TC-3 | Thủ kho đếm 1 lô, count_diff = -2 | Flag THIẾU, hiển thị yêu cầu nhập lý do |
| TC-4 | Submit KK mà còn lô chưa đếm | Validation fail, cảnh báo "Còn X lô chưa đếm" |
| TC-5 | Trưởng khoa duyệt tất cả | Status = COMPLETED, lots.quantity updated, StockMovement created |
| TC-6 | Trưởng khoa duyệt 1 line, reject 1 line | Chỉ line duyệt mới update stock, line reject giữ nguyên |
| TC-7 | Tổng chênh lệch > 5M | Cảnh báo đặc biệt |
| TC-8 | Lô bị EXPIRED trong lúc đang KK | Line → SKIPPED |
| TC-9 | Tạo KK tháng mới khi tháng cũ chưa xong | Cảnh báo |
| TC-10 | Thủ kho VTYT cố truy cập ST-2026-06-HC | 403 |
| TC-11 | actual_qty âm | Validation fail |
| TC-12 | QR code scan lô → auto điền thông tin | Nhanh, chính xác |

---

## PHỤ LỤC

### A. Effort estimate
- Schema + function: 1 tuần
- API hooks: 0.5 tuần
- UI (dashboard + form nhập + trang duyệt): 1.5 tuần
- **Tổng: 3 tuần**

### B. Phụ thuộc
- Cần SPEC #3 (Lot Lifecycle) + N1 (Warehouse Role)
- Cần bảng `lots.quantity` đã tồn tại (đã có trong hệ thống hiện tại)
- Cần bảng `stock_movements` đã tồn tại

### C. Câu hỏi mở
- Báo cáo PDF: cần những thông tin gì? (Tổng chênh lệch, danh sách lô, chữ ký thủ kho + TK khoa?)
- Có cần tích hợp với hệ thống chữ ký số không?
- Kiểm kê đột xuất (vd: nghi ngờ mất cắp) có cần workflow riêng không?
- Khi thủ kho từ chối ký xác nhận (vd: không đồng ý với lý do chênh lệch) → xử lý thế nào?

---

**Người viết**: Claude
**Ngày**: 2026-06-14
**Trạng thái**: ⏸️ CHỜ USER REVIEW


