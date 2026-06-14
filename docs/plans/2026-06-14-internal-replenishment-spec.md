# SPEC #1: Internal Replenishment (Weekly) — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: N4 (P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 5

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Tự động đề xuất số lượng cần chuyển từ **Kho chẵn (BULK)** sang **Kho lẻ (DAILY)** mỗi tuần, dựa trên lịch sử tiêu hao và tồn kho hiện tại, để đảm bảo kho lẻ luôn đủ vật tư cho hoạt động xét nghiệm mà không tồn kho quá nhiều.

### 1.2. Phạm vi
- **Trong scope**:
  - Đề xuất số lượng chuyển kho nội bộ (BULK → DAILY) cho cả 2 mảng: **Hóa chất - Sinh phẩm (HC-SP)** và **Vật tư y tế (VTYT)**
  - Tự động chọn lô theo FEFO (First-Expire-First-Out) từ kho chẵn
  - Workflow duyệt: thủ kho kho chẵn → (Trưởng khoa nếu giá trị lớn) → thủ kho kho lẻ xác nhận đã nhận
- **Ngoài scope**:
  - Nhập hàng từ Khoa Dược / Phòng VTYT (thuộc module Monthly Replenishment Request — SPEC #2)
  - Kiểm kê tháng (thuộc SPEC #4)
  - Quản lý lô, hạn dùng, open-vial (thuộc SPEC #3, #6, #7)

### 1.3. Tuân thủ quy định
- **QĐ 2429/BYT**: Tiêu chí 7.2 (Quản lý hóa chất, sinh phẩm) — yêu cầu kiểm soát tồn kho, theo dõi hạn dùng
- **ISO 15189:2022**: Điều khoản 6.5.3 (Vật tư tiêu hao) — đảm bảo liên tục cung cấp vật tư đạt chất lượng
- **TT 54/2017/BYT**: Mọi thao tác xuất/nhập phải có audit log

---

## 2. ACTORS (Người dùng)

| Actor | Mô tả | Quyền trong module |
|---|---|---|
| **Thủ kho kho chẵn (BULK)** | Phụ trách kho chẵn HC-SP hoặc kho chẵn VTYT | Xem/chạy đề xuất, điều chỉnh số lượng, chọn lô FEFO, tạo phiếu chuyển kho, duyệt (nếu giá trị nhỏ) |
| **Thủ kho kho lẻ (DAILY)** | Phụ trách kho lẻ HC-SP (2 người) hoặc kho lẻ VTYT | Xem đề xuất nhận, **điều chỉnh số lượng đề xuất** (nếu cần), xác nhận đã nhận hàng |
| **Trưởng khoa (DEPT_HEAD)** | Duyệt cuối | Chỉ duyệt khi **tổng giá trị đề xuất > ngưỡng (mặc định 5.000.000 VNĐ)** |
| **Hệ thống (CRON)** | Auto-trigger mỗi thứ 6 8:00 sáng | Tính toán đề xuất, tạo draft, gửi notification |

### 2.1. Phân quyền theo role
- `KEEPER_BULK_HC_SP` → chỉ thấy đề xuất HC-SP (kho chẵn → kho lẻ)
- `KEEPER_DAILY_HC_SP` → chỉ thấy đề xuất HC-SP (nhận từ kho chẵn)
- `KEEPER_BULK_VTYT` → chỉ thấy đề xuất VTYT (kho chẵn → kho lẻ)
- `KEEPER_DAILY_VTYT` → chỉ thấy đề xuất VTYT (nhận từ kho chẵn)
- `DEPT_HEAD` → thấy tất cả đề xuất (read-only đối với line items, chỉ duyệt)

---

## 3. WORKFLOW CHI TIẾT

```
[Thứ 6, 8:00 sáng] Cron job chạy
        ↓
[Edge Function: compute-weekly-replenishment]
  - Tính toán đề xuất cho tất cả sản phẩm trong 2 kho lẻ
  - Lưu vào weekly_replenishment_runs + lines (status=DRAFT)
  - Gửi notification cho thủ kho kho chẵn
        ↓
[Thủ kho kho chẵn]
  - Mở app → /replenishment/weekly
  - Xem danh sách đề xuất (đã được FEFO auto-pick lô)
  - Điều chỉnh số lượng (nếu cần) trên từng line
  - Nhấn "Gửi cho kho lẻ" → status = REVIEWED
        ↓
[Thủ kho kho lẻ]
  - Nhận notification → mở app
  - Xem đề xuất đã điều chỉnh bởi kho chẵn
  - Có thể điều chỉnh thêm (request adjustment)
  - Nhấn "Xác nhận số lượng" → status = CONFIRMED_BY_DAILY
        ↓
[Kiểm tra ngưỡng giá trị]
  ├─ Nếu tổng giá trị ≤ 5.000.000 VNĐ → auto-approve → status = APPROVED
  └─ Nếu > 5.000.000 VNĐ → chờ Trưởng khoa duyệt
        ↓
[Trưởng khoa (nếu cần)]
  - Mở app → /replenishment/weekly/[id]
  - Xem chi tiết, nhấn "Duyệt" hoặc "Từ chối" (có lý do)
  - status = APPROVED hoặc REJECTED
        ↓
[Thủ kho kho chẵn]
  - In phiếu chuyển kho (hoặc view trên app)
  - Vận chuyển hàng từ kho chẵn → kho lẻ
  - Nhấn "Đã chuyển hàng" → status = TRANSFERRING
  - Hệ thống tự tạo StockMovement (TRANSFER_OUT từ BULK)
        ↓
[Thủ kho kho lẻ]
  - Nhận hàng vật lý
  - Đếm và đối chiếu
  - Nhấn "Xác nhận đã nhận" → status = COMPLETED
  - Hệ thống tự tạo StockMovement (TRANSFER_IN vào DAILY)
  - Cập nhật tồn kho + audit log
```

### 3.1. Trạng thái (status) của Run
- `DRAFT` — Vừa được tạo bởi cron, chưa ai xem
- `REVIEWED` — Thủ kho kho chẵn đã xem + điều chỉnh + gửi
- `CONFIRMED_BY_DAILY` — Thủ kho kho lẻ đã xác nhận số lượng
- `APPROVED` — Đã duyệt (tự động nếu ≤ ngưỡng, hoặc bởi Trưởng khoa)
- `REJECTED` — Trưởng khoa từ chối (phải có lý do)
- `TRANSFERRING` — Đang vận chuyển (đã tạo StockMovement OUT)
- `COMPLETED` — Hoàn tất (đã tạo StockMovement IN)
- `CANCELLED` — Hủy bỏ (bởi thủ kho kho chẵn hoặc Trưởng khoa)

### 3.2. Trạng thái của Line
- `PENDING` — Mới tạo, chờ điều chỉnh
- `ADJUSTED` — Đã bị điều chỉnh số lượng (track original vs adjusted)
- `CONFIRMED` — Thủ kho kho lẻ đã confirm
- `SKIPPED` — Bỏ qua (lý do: không có lô trong kho chẵn, hoặc user chọn skip)
- `TRANSFERRING` — Đang vận chuyển
- `COMPLETED` — Đã nhận
- `FAILED` — Lỗi (vd: lô hết hạn giữa chừng, hoặc thủ kho lẻ báo thiếu)

---

## 4. LOGIC TÍNH TOÁN (CÔNG THỨC ĐỀ XUẤT)

### 4.1. Input (snapshot tại thời điểm tạo run)
- `current_daily_qty` — Tồn kho lẻ hiện tại (INT)
- `current_bulk_qty` — Tồn kho chẵn hiện tại (INT)
- `consumption_3m` — Tổng tiêu hao 90 ngày gần nhất ở kho lẻ (INT)
- `consumption_last_week` — Tổng tiêu hao 7 ngày gần nhất ở kho lẻ (INT)
- `min_stock` — Ngưỡng tồn tối thiểu (cấu hình trên Product, mặc định 0)
- `max_stock` — Ngưỡng tồn tối đa (cấu hình trên Product, mặc định = 2 * min_stock nếu không set)

### 4.2. Công thức (đã chốt với user)

```
# Bước 1: Trung bình tiêu hao / tuần
avg_3_months_weekly = consumption_3m / 13        # 90 ngày / 7 = ~12.86, làm tròn 13
avg_last_week       = consumption_last_week       # 7 ngày

# Bước 2: Trung bình có trọng số (đã chốt: 0.6/0.4)
weighted_avg = (avg_3_months_weekly * 0.6) + (avg_last_week * 0.4)

# Bước 3: Mục tiêu tồn kho lẻ (đã chốt: 1.5 tuần buffer)
target_qty = weighted_avg * 1.5

# Bước 4: Đề xuất xuất
suggested_qty = MAX(0, target_qty - current_daily_qty)

# Bước 5: Giới hạn bởi tồn kho chẵn
final_qty = MIN(suggested_qty, current_bulk_qty)

# Bước 6: Không vượt max_stock
final_qty = MIN(final_qty, MAX(0, max_stock - current_daily_qty))

# Nếu final_qty = 0 → bỏ qua (không tạo line, hoặc status=SKIPPED với lý do "không cần bổ sung")
```

### 4.3. Edge cases (đã chốt với user)

| Trường hợp | Xử lý |
|---|---|
| Sản phẩm mới (chưa có 3 tháng data) | Dùng `min_stock` làm `target_qty` mặc định |
| Kho chẵn hết hàng (`current_bulk_qty = 0`) | **CHỈ CẢNH BÁO, KHÔNG tạo đề xuất** (đã chốt option a). Cảnh báo hiển thị trong dashboard + gửi email "Sản phẩm X cần đề xuất nhập từ Khoa Dược/Phòng VTYT trong tháng này" |
| Sản phẩm không có trong kho lẻ | Bỏ qua (chỉ đề xuất cho sản phẩm đã từng xuất sang kho lẻ) |
| Lô trong kho chẵn sắp hết hạn (< 30 ngày) | FEFO tự ưu tiên chuyển lô đó trước; flag cảnh báo "Lô sắp hết hạn" trên line |
| `weighted_avg` = 0 (không có tiêu hao) | Không tạo đề xuất |
| `final_qty` < 1 sau khi áp min_stock | Không tạo đề xuất (tránh tạo phiếu chuyển kho rỗng) |
| Chạy manual nhiều lần trong tuần | Mỗi lần chạy tạo 1 run riêng; nếu đã có run `DRAFT` cho cùng tuần → cập nhật, không tạo mới |
| Chạy manual sau khi đã có run `APPROVED` | Cảnh báo "Đã có đề xuất tuần này"; hỏi xác nhận tạo run bổ sung |

### 4.4. Ví dụ minh họa

**Sản phẩm**: Hóa chất Glucose (HC-SP)

| Input | Giá trị |
|---|---|
| `current_daily_qty` | 5 (chai) |
| `current_bulk_qty` | 50 (chai) |
| `consumption_3m` | 39 (chai / 90 ngày = 3 chai/tuần) |
| `consumption_last_week` | 4 (chai) |
| `min_stock` | 10 |
| `max_stock` | 20 |

**Tính toán**:
```
avg_3_months_weekly = 39 / 13 = 3
avg_last_week       = 4
weighted_avg        = 3 * 0.6 + 4 * 0.4 = 1.8 + 1.6 = 3.4
target_qty          = 3.4 * 1.5 = 5.1 → 6 (làm tròn lên)
suggested_qty       = MAX(0, 6 - 5) = 1
final_qty           = MIN(1, 50) = 1
final_qty           = MIN(1, MAX(0, 20 - 5)) = MIN(1, 15) = 1
```

→ **Đề xuất chuyển 1 chai** từ kho chẵn sang kho lẻ.

**Trường hợp kho chẵn hết**:
- `current_bulk_qty = 0` → `final_qty = 0` → hệ thống **không tạo line**, chỉ hiển thị cảnh báo: "Glucose: Kho chẵn hết — cần đề xuất nhập từ Khoa Dược trong tháng này".

---

---

## 5. SCHEMA CHI TIẾT

### 5.1. Migration: `20260614_internal_replenishment.sql`

```sql
-- ============================================================
-- MODULE N4: INTERNAL REPLENISHMENT (WEEKLY)
-- File: supabase/migrations/20260614_internal_replenishment.sql
-- ============================================================

-- 5.1.1. ENUM cho run status
CREATE TYPE replenishment_run_status AS ENUM (
  'DRAFT',              -- Mới tạo bởi cron
  'REVIEWED',           -- Thủ kho kho chẵn đã review
  'CONFIRMED_BY_DAILY', -- Thủ kho kho lẻ đã confirm số lượng
  'APPROVED',           -- Đã duyệt (auto nếu ≤ ngưỡng, hoặc bởi TK khoa)
  'REJECTED',           -- Trưởng khoa từ chối
  'TRANSFERRING',       -- Đang vận chuyển
  'COMPLETED',          -- Hoàn tất
  'CANCELLED'           -- Hủy bỏ
);

-- 5.1.2. ENUM cho line status
CREATE TYPE replenishment_line_status AS ENUM (
  'PENDING',
  'ADJUSTED',
  'CONFIRMED',
  'SKIPPED',
  'TRANSFERRING',
  'COMPLETED',
  'FAILED'
);

-- 5.1.3. ENUM cho trigger source
CREATE TYPE replenishment_trigger_source AS ENUM (
  'CRON',     -- Auto mỗi thứ 6
  'MANUAL'    -- Thủ kho chạy tay
);

-- 5.1.4. Bảng weekly_replenishment_runs
CREATE TABLE weekly_replenishment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_group TEXT NOT NULL CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),
  warehouse_role_from TEXT NOT NULL CHECK (warehouse_role_from IN ('BULK_HC_SP', 'BULK_VTYT')),
  warehouse_role_to TEXT NOT NULL CHECK (warehouse_role_to IN ('DAILY_HC_SP', 'DAILY_VTYT')),

  -- Kỳ đề xuất (luôn là thứ 6 của tuần đó)
  period_date DATE NOT NULL,
  week_number INT NOT NULL,        -- Tuần thứ mấy trong năm (ISO week)
  year INT NOT NULL,

  -- Trạng thái
  status replenishment_run_status NOT NULL DEFAULT 'DRAFT',

  -- Giá trị
  total_estimated_value DECIMAL(15, 2),  -- Tổng giá trị ước tính (VNĐ)
  requires_dept_head_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  triggered_by replenishment_trigger_source NOT NULL DEFAULT 'CRON',
  created_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,

  completed_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique: 1 run / product_group / tuần (tránh duplicate)
  UNIQUE (tenant_id, product_group, period_date)
);

CREATE INDEX idx_wrr_tenant_period ON weekly_replenishment_runs(tenant_id, period_date DESC);
CREATE INDEX idx_wrr_status ON weekly_replenishment_runs(tenant_id, status);

-- 5.1.5. Bảng weekly_replenishment_lines
CREATE TABLE weekly_replenishment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES weekly_replenishment_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- Input data (snapshot)
  current_daily_qty INT NOT NULL DEFAULT 0,
  current_bulk_qty INT NOT NULL DEFAULT 0,
  consumption_3m INT NOT NULL DEFAULT 0,
  consumption_last_week INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NOT NULL DEFAULT 0,

  -- Calculation details
  avg_3m_weekly DECIMAL(10, 2),
  weighted_avg DECIMAL(10, 2),
  target_qty DECIMAL(10, 2),

  -- Suggested & adjusted
  suggested_qty INT NOT NULL DEFAULT 0,
  adjusted_qty INT,                          -- Thủ kho kho chẵn điều chỉnh
  daily_requested_qty INT,                   -- Thủ kho kho lẻ yêu cầu điều chỉnh
  final_qty INT NOT NULL DEFAULT 0,          -- Số lượng cuối cùng thực chuyển

  -- Lot selection (FEFO)
  selected_lot_id UUID REFERENCES lots(id) ON DELETE RESTRICT,
  selected_lot_expiration DATE,
  selected_lot_quantity INT,                 -- Số lượng thực tế lô đó còn

  -- Pricing (cho trigger duyệt theo ngưỡng giá trị)
  unit_price DECIMAL(15, 2),                 -- Đơn giá (lấy từ latest contract hoặc default)
  estimated_value DECIMAL(15, 2),            -- = final_qty * unit_price

  -- Adjustment history (audit trail)
  adjustment_history JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"by": "user_id", "by_role": "KEEPER_BULK_HC_SP", "from": 5, "to": 7, "reason": "Tăng do lượng XN tuần này cao", "at": "2026-06-14T..."}]

  -- Transfer reference
  transfer_id UUID,                          -- Reference đến transfer document (sau khi COMPLETED)

  status replenishment_line_status NOT NULL DEFAULT 'PENDING',
  skip_reason TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wrl_run ON weekly_replenishment_lines(run_id);
CREATE INDEX idx_wrl_product ON weekly_replenishment_lines(product_id);
CREATE INDEX idx_wrl_lot ON weekly_replenishment_lines(selected_lot_id);

-- 5.1.6. Bảng cảnh báo kho chẵn hết (lưu lại để tracking)
CREATE TABLE weekly_replenishment_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES weekly_replenishment_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  alert_type TEXT NOT NULL,                  -- 'BULK_OUT_OF_STOCK'
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5.1.7. RLS Policies
ALTER TABLE weekly_replenishment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_replenishment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_replenishment_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: User chỉ thấy runs của tenant mình
CREATE POLICY "rls_wrr_tenant" ON weekly_replenishment_runs
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Policy: KEEPER_BULK_HC_SP xem runs có product_group = HC-SP
CREATE POLICY "rls_wrr_keeper_bulk_hc" ON weekly_replenishment_runs
  FOR SELECT USING (
    product_group = 'HOA_CHAT_SINH_PHAM'
    AND (auth.jwt() ->> 'role') = 'KEEPER_BULK_HC_SP'
  );

CREATE POLICY "rls_wrr_keeper_bulk_vtyt" ON weekly_replenishment_runs
  FOR SELECT USING (
    product_group = 'VAT_TU_Y_TE'
    AND (auth.jwt() ->> 'role') = 'KEEPER_BULK_VTYT'
  );

CREATE POLICY "rls_wrr_keeper_daily_hc" ON weekly_replenishment_runs
  FOR SELECT USING (
    product_group = 'HOA_CHAT_SINH_PHAM'
    AND (auth.jwt() ->> 'role') = 'KEEPER_DAILY_HC_SP'
  );

CREATE POLICY "rls_wrr_keeper_daily_vtyt" ON weekly_replenishment_runs
  FOR SELECT USING (
    product_group = 'VAT_TU_Y_TE'
    AND (auth.jwt() ->> 'role') = 'KEEPER_DAILY_VTYT'
  );

CREATE POLICY "rls_wrr_dept_head" ON weekly_replenishment_runs
  FOR SELECT USING ((auth.jwt() ->> 'role') = 'DEPT_HEAD');

-- Lines: Cho phép SELECT nếu parent run được phép xem
CREATE POLICY "rls_wrl_parent" ON weekly_replenishment_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM weekly_replenishment_runs r
      WHERE r.id = weekly_replenishment_lines.run_id
    )
  );

-- Lines: Cho phép UPDATE (điều chỉnh số lượng) cho thủ kho kho chẵn + kho lẻ của đúng mảng
CREATE POLICY "rls_wrl_update" ON weekly_replenishment_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM weekly_replenishment_runs r
      WHERE r.id = weekly_replenishment_lines.run_id
        AND r.status IN ('DRAFT', 'REVIEWED', 'CONFIRMED_BY_DAILY')
    )
  );

-- 5.1.8. Trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION trg_wrr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wrr_update
  BEFORE UPDATE ON weekly_replenishment_runs
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

CREATE TRIGGER trg_wrl_update
  BEFORE UPDATE ON weekly_replenishment_lines
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

-- 5.1.9. View tiện truy vấn: danh sách lines + thông tin sản phẩm
CREATE OR REPLACE VIEW v_weekly_replenishment_detail AS
SELECT
  l.id AS line_id,
  l.run_id,
  r.period_date,
  r.product_group,
  r.status AS run_status,
  l.product_id,
  p.code AS product_code,
  p.name AS product_name,
  p.unit,
  l.current_daily_qty,
  l.current_bulk_qty,
  l.consumption_3m,
  l.consumption_last_week,
  l.suggested_qty,
  l.adjusted_qty,
  l.daily_requested_qty,
  l.final_qty,
  l.selected_lot_id,
  lot.lot_number,
  l.selected_lot_expiration,
  l.unit_price,
  l.estimated_value,
  l.status AS line_status
FROM weekly_replenishment_lines l
JOIN weekly_replenishment_runs r ON r.id = l.run_id
JOIN products p ON p.id = l.product_id
LEFT JOIN lots lot ON lot.id = l.selected_lot_id;

COMMENT ON TABLE weekly_replenishment_runs IS 'Mỗi record = 1 đợt đề xuất tuần (thứ 6) cho 1 product_group';
COMMENT ON TABLE weekly_replenishment_lines IS 'Mỗi record = 1 sản phẩm trong đề xuất tuần';
```

### 5.2. Tham chiếu schema hiện có
- `tenants(id)` — đã có
- `auth.users(id)` — Supabase auth mặc định
- `products(id, code, name, unit, product_group, min_stock, max_stock, ...)` — cần thêm cột `min_stock`, `max_stock` nếu chưa có (kiểm tra migration trước)
- `lots(id, lot_number, expiration_date, warehouse_id, quantity, ...)` — đã có, cần xác nhận tên cột khớp
- `warehouses(id, role, ...)` — sẽ thêm `role` qua module N1
- `transfers(id, from_warehouse_id, to_warehouse_id, status, ...)` — bảng chuyển kho (chưa có hoặc cần tạo mới — TODO cho SPEC sau)

---

## 6. API HOOKS

### 6.1. React Query Hooks (TypeScript)

```typescript
// src/lib/hooks/useWeeklyReplenishment.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================
// QUERIES
// ============================================

/** Lấy danh sách runs (cho dashboard /replenishment/weekly) */
export function useWeeklyReplenishmentRuns(params: {
  productGroup?: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE';
  status?: ReplenishmentRunStatus;
  periodFrom?: string;  // ISO date
  periodTo?: string;    // ISO date
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['weekly-replenishment-runs', params],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('weekly_replenishment_runs')
        .select('*, lines:weekly_replenishment_lines(*)')
        .order('period_date', { ascending: false })
        .limit(params.limit ?? 20);

      if (params.productGroup) q = q.eq('product_group', params.productGroup);
      if (params.status) q = q.eq('status', params.status);
      if (params.periodFrom) q = q.gte('period_date', params.periodFrom);
      if (params.periodTo) q = q.lte('period_date', params.periodTo);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

/** Lấy chi tiết 1 run (cho /replenishment/weekly/[id]) */
export function useWeeklyReplenishmentRun(id: string) {
  return useQuery({
    queryKey: ['weekly-replenishment-run', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('weekly_replenishment_runs')
        .select(`
          *,
          lines:weekly_replenishment_lines(
            *,
            product:products(id, code, name, unit, product_group),
            lot:lots(id, lot_number, expiration_date, quantity)
          )
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

/** Lấy lịch sử runs đã COMPLETED (cho /replenishment/weekly/history) */
export function useWeeklyReplenishmentHistory(params: { limit?: number } = {}) {
  return useWeeklyReplenishmentRuns({ ...params, status: 'COMPLETED' });
}

// ============================================
// MUTATIONS
// ============================================

/** Thủ kho kho chẵn điều chỉnh số lượng 1 line */
export function useAdjustReplenishmentLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lineId: string;
      adjustedQty: number;
      reason: string;
      userId: string;
      userRole: string;
    }) => {
      const supabase = createClient();
      // Lấy line hiện tại
      const { data: line, error: e1 } = await supabase
        .from('weekly_replenishment_lines')
        .select('*, run:weekly_replenishment_runs(status)')
        .eq('id', input.lineId)
        .single();
      if (e1) throw e1;

      // Append vào adjustment_history
      const newHistory = [
        ...(line.adjustment_history ?? []),
        {
          by: input.userId,
          by_role: input.userRole,
          from: line.adjusted_qty ?? line.suggested_qty,
          to: input.adjustedQty,
          reason: input.reason,
          at: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase
        .from('weekly_replenishment_lines')
        .update({
          adjusted_qty: input.adjustedQty,
          final_qty: input.adjustedQty,
          status: 'ADJUSTED',
          adjustment_history: newHistory,
        })
        .eq('id', input.lineId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['weekly-replenishment-run', data.run_id] });
    },
  });
}

/** Thủ kho kho lẻ yêu cầu điều chỉnh số lượng */
export function useRequestReplenishmentAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lineId: string;
      requestedQty: number;
      reason: string;
      userId: string;
      userRole: string;
    }) => {
      const supabase = createClient();
      // Logic tương tự useAdjustReplenishmentLine
      // nhưng ghi vào daily_requested_qty (không ghi đè adjusted_qty)
      // ...
    },
  });
}

/** Thủ kho kho chẵn gửi đề xuất cho kho lẻ (status: DRAFT → REVIEWED) */
export function useSubmitReplenishmentForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('weekly_replenishment_runs')
        .update({
          status: 'REVIEWED',
          reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', runId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Thủ kho kho lẻ xác nhận số lượng (status: REVIEWED → CONFIRMED_BY_DAILY) */
export function useConfirmReplenishmentByDaily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      // Tính tổng giá trị ước tính
      // Nếu > ngưỡng → yêu cầu Trưởng khoa duyệt
      // Nếu ≤ ngưỡng → auto-approve
      // ...
    },
  });
}

/** Trưởng khoa duyệt (status: CONFIRMED_BY_DAILY → APPROVED) */
export function useApproveReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; approved: boolean; reason?: string }) => {
      // ...
    },
  });
}

/** Tạo Transfer Document từ Run (sau khi APPROVED) */
export function useCreateTransferFromReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      // 1. Tạo Transfer document (header)
      // 2. Tạo Transfer lines (1 cho mỗi line của run, trừ SKIPPED)
      // 3. Update run.transfer_id, status = TRANSFERRING
      // 4. Tạo StockMovement (TRANSFER_OUT từ BULK)
      // 5. Update lots: giảm quantity ở kho BULK
    },
  });
}

/** Thủ kho kho lẻ xác nhận đã nhận hàng (status: TRANSFERRING → COMPLETED) */
export function useConfirmReplenishmentReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; discrepancies?: { lineId: string; receivedQty: number; reason: string }[] }) => {
      // 1. Tạo StockMovement (TRANSFER_IN vào DAILY)
      // 2. Update lots: tăng quantity ở kho DAILY
      // 3. Nếu có discrepancies → tạo FAILED lines + log
      // 4. Update run: status = COMPLETED, completed_at = now()
    },
  });
}

/** Chạy manual tính toán đề xuất (ngoài lịch cron) */
export function useRunWeeklyReplenishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productGroup?: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE'; periodDate?: string }) => {
      // Gọi Edge Function: compute-weekly-replenishment
      const { data, error } = await supabase.functions.invoke('compute-weekly-replenishment', {
        body: { productGroup: input.productGroup, periodDate: input.periodDate },
      });
      if (error) throw error;
      return data;
    },
  });
}
```

### 6.2. Edge Function API

**`compute-weekly-replenishment`** (Supabase Edge Function, Deno):

```
POST /functions/v1/compute-weekly-replenishment
Body: {
  productGroup?: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE';  // optional, mặc định chạy cả 2
  periodDate?: string;  // ISO date, mặc định = thứ 6 gần nhất
  triggerSource?: 'CRON' | 'MANUAL';  // mặc định = 'MANUAL' khi gọi từ app
}

Response: {
  runIds: string[];  // ID của các run vừa tạo
  totalLines: number;
  totalValue: number;
  alerts: { productId: string; message: string }[];  // Cảnh báo kho chẵn hết
}
```

**Cron schedule** (sử dụng Supabase pg_cron):
```sql
-- Chạy thứ 6 hàng tuần lúc 8:00 sáng
SELECT cron.schedule(
  'compute-weekly-replenishment',
  '0 8 * * 5',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/compute-weekly-replenishment',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('triggerSource', 'CRON')
  );
  $$
);
```

---

---

## 7. UI WIREFRAMES

### 7.1. Trang `/replenishment/weekly` — Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: UserMenu | Logo | PillNav                              │
├──────────────────────────────────────────────────────────────────┤
│  BREADCRUMB: Trang chủ > Bổ sung kho lẻ (tuần)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📦 Bổ sung kho lẻ (tuần)                                 │   │
│  │ ─────────────────────────────────────────────────────── │   │
│  │ [HC-SP] [VTYT] [Tất cả]   Tuần: ◀ T6 14/06/2026 ▶      │   │
│  │                                       [🔄 Chạy manual]    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── Đợt tuần này ────────────────────────────────────────┐  │
│  │ Mã: WR-2026-24-HC    Trạng thái: DRAFT                   │  │
│  │ Kho chẵn → Kho lẻ (HC-SP)                                 │  │
│  │ Tổng: 18 sản phẩm | 245 đơn vị | 12.5M VNĐ              │  │
│  │ Trạng thái duyệt: Tự động (≤ 5M)                          │  │
│  │                                          [Mở chi tiết →] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── Đợt tuần này ────────────────────────────────────────┐  │
│  │ Mã: WR-2026-24-VTYT  Trạng thái: REVIEWED                │  │
│  │ Kho chẵn → Kho lẻ (VTYT)                                  │  │
│  │ Tổng: 12 sản phẩm | 80 đơn vị | 6.2M VNĐ                │  │
│  │ Trạng thái duyệt: ⏳ Chờ Trưởng khoa duyệt              │  │
│  │                                          [Mở chi tiết →] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── Đợt trước ──────────────────────────────────────────┐   │
│  │ Mã: WR-2026-23-HC    Trạng thái: COMPLETED               │   │
│  │ Hoàn tất 07/06/2026  |  Tạo bởi: Nguyễn Văn A            │   │
│  │                                          [Xem →]          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── ⚠️ Cảnh báo kho chẵn hết (3) ───────────────────────┐   │
│  │ • Glucose (HC-SP): Kho chẵn hết — cần nhập từ Khoa Dược │   │
│  │ • HBsAg Test (HC-SP): Kho chẵn hết                       │   │
│  │ • Ống nghiệm EDTA (VTYT): Kho chẵn còn 5 (< min)        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2. Trang `/replenishment/weekly/[id]` — Chi tiết

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: UserMenu | Logo | PillNav                              │
├──────────────────────────────────────────────────────────────────┤
│  BREADCRUMB: Trang chủ > Bổ sung tuần > WR-2026-24-HC           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📋 WR-2026-24-HC — Bổ sung kho lẻ HC-SP tuần 14/06/2026│   │
│  │ ─────────────────────────────────────────────────────── │   │
│  │ Trạng thái: REVIEWED                                      │   │
│  │ Kho chẵn (BULK_HC_SP) → Kho lẻ (DAILY_HC_SP)            │   │
│  │ Tổng: 18 sản phẩm | 245 đơn vị | 12.5M VNĐ             │   │
│  │ Tạo bởi: CRON lúc 08:00 14/06/2026                      │   │
│  │ Xem bởi: Nguyễn Văn A (Thủ kho kho chẵn) lúc 08:30     │   │
│  │                                                            │   │
│  │ [📤 Gửi cho kho lẻ]  [❌ Hủy đề xuất]  [📥 Xuất Excel] │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── Bảng đề xuất ─────────────────────────────────────────┐  │
│  │ STT │ Sản phẩm     │ Tồn lẻ │ TB 3 th │ Tuần NT │ Đề xuất│  │
│  │     │              │ Tồn chẵn │ (tuần) │          │ SL    │  │
│  │     │              │          │         │         │ Lot   │  │
│  │     │              │ Min/Max  │         │         │       │  │
│  │─────┼──────────────┼─────────┼────────┼─────────┼───────│  │
│  │  1  │ Glucose      │ 5  / 50 │ 3      │ 4       │ 1     │  │
│  │     │ HO-SH-001    │ 10/20   │         │         │ L123  │  │
│  │     │              │         │         │         │ HSD:  │  │
│  │     │              │         │         │         │ 09/2026│  │
│  │     │              │         │         │         │ [Sửa] │  │
│  │─────┼──────────────┼─────────┼────────┼─────────┼───────│  │
│  │  2  │ HBsAg Test   │ 12 / 0⚠️│ 5      │ 7       │ SKIP  │  │
│  │     │ HO-SH-045    │ 15/30   │         │         │ (hết) │  │
│  │     │              │         │         │         │ [Sửa] │  │
│  │─────┼──────────────┼─────────┼────────┼─────────┼───────│  │
│  │  3  │ Urea         │ 8  / 30 │ 4      │ 3       │ 4     │  │
│  │     │ HO-SH-002    │ 12/20   │         │         │ L098  │  │
│  │     │              │         │         │         │ HSD:  │  │
│  │     │              │         │         │         │ 12/2026│  │
│  │     │              │         │         │         │ [Sửa] │  │
│  │ ... │ ...          │ ...     │ ...    │ ...     │ ...   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── Lịch sử điều chỉnh (audit trail) ────────────────────┐   │
│  │ 14/06 08:35 Nguyễn Văn A (KEEPER_BULK_HC_SP)            │   │
│  │   Glucose: 1 → 2 (lý do: "Tuần này có 2 ca XN cấp cứu")│   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3. Modal điều chỉnh số lượng (khi click [Sửa])

```
┌─────────────────────────────────────────────────┐
│  ✏️ Điều chỉnh số lượng                        │
│  ─────────────────────────────────────────────  │
│  Sản phẩm: Glucose (HO-SH-001)                  │
│  Số lượng đề xuất ban đầu: 1                    │
│                                                  │
│  Số lượng mới: [____2_____]                     │
│                                                  │
│  Lý do điều chỉnh (bắt buộc):                  │
│  [_________________________________________]    │
│  [_________________________________________]    │
│                                                  │
│  ⓘ Lô được chọn tự động theo FEFO:             │
│     L123 - HSD 09/2026 - Còn 50 đơn vị         │
│     [Đổi lô ▼]                                 │
│                                                  │
│              [Hủy]  [💾 Lưu]                    │
└─────────────────────────────────────────────────┘
```

### 7.4. Mobile View (responsive)

```
┌────────────────────────┐
│ ☰  📦 Bổ sung tuần   │
├────────────────────────┤
│ T6 14/06/2026  [🔄]    │
├────────────────────────┤
│ ┌────────────────────┐ │
│ │ WR-2026-24-HC      │ │
│ │ DRAFT              │ │
│ │ 18 SP | 12.5M      │ │
│ │ [Chi tiết →]       │ │
│ └────────────────────┘ │
│ ┌────────────────────┐ │
│ │ WR-2026-24-VTYT    │ │
│ │ REVIEWED           │ │
│ │ 12 SP | 6.2M       │ │
│ │ [Chi tiết →]       │ │
│ └────────────────────┘ │
│                        │
│ ⚠️ Cảnh báo (3)        │
│ • Glucose: hết         │
│ • HBsAg: hết           │
│ • EDTA: còn 5          │
└────────────────────────┘
```

### 7.5. Notification (in-app)

- **Icon**: 📦
- **Title**: "Đề xuất bổ sung kho lẻ tuần 24/2026 đã sẵn sàng"
- **Body**: "Có 18 sản phẩm cần chuyển từ kho chẵn → kho lẻ HC-SP. Tổng giá trị: 12.5M VNĐ"
- **Action**: [Mở đề xuất]

### 7.6. Email notification (nếu user chưa mở app trong 24h)

- Subject: "[Khoa XN] Đề xuất bổ sung kho lẻ tuần 24/2026"
- Body: Tóm tắt + link đến `/replenishment/weekly`

---

## 8. EDGE CASES & XỬ LÝ LỖI

### 8.1. Concurrency & Race conditions

| Tình huống | Xử lý |
|---|---|
| 2 thủ kho kho chẵn cùng điều chỉnh 1 line | Optimistic locking: dùng `version` column (thêm vào schema nếu cần), so sánh updated_at |
| Cron chạy trong khi manual đang chạy | Dùng `pg_advisory_lock` để serialize |
| Thủ kho kho lẻ confirm trước khi kho chẵn gửi | API reject với lỗi "Run chưa ở trạng thái REVIEWED" |
| Tạo Transfer trong khi user khác đang điều chỉnh | Lock run: nếu có người đang edit → hiển thị "Đang có người chỉnh sửa" |

### 8.2. Lỗi dữ liệu

| Tình huống | Xử lý |
|---|---|
| Sản phẩm bị xóa giữa chừng | ON DELETE RESTRICT → transfer sẽ fail, thông báo cho user |
| Lot bị recall (chuyển sang BLOCKED) | Tự động cập nhật line: status = FAILED, ghi lý do |
| Tồn kho thực tế < tồn kho lúc tạo đề xuất (do xuất lẻ khác) | Khi tạo Transfer, kiểm tra lại `current_bulk_qty`; nếu < final_qty → cảnh báo "Cần điều chỉnh lại" |
| Đơn giá thay đổi (contract mới) | Tính lại `estimated_value` khi gửi duyệt |

### 8.3. Lỗi workflow

| Tình huống | Xử lý |
|---|---|
| Trưởng khoa không duyệt trong 3 ngày | Tự động gửi reminder email; nếu quá 7 ngày → auto-escalate cho Admin |
| Thủ kho kho lẻ không xác nhận nhận trong 3 ngày sau khi chuyển | Cảnh báo cho thủ kho kho chẵn "Hàng đã chuyển 3 ngày, chưa được xác nhận" |
| Run bị CANCELLED sau khi đã gửi cho kho lẻ | Tự động notify kho lẻ "Đề xuất đã bị hủy" |
| User tạo Transfer từ run, nhưng sau đó muốn hủy | Cho phép CANCELLED chỉ khi run chưa COMPLETED; nếu đã TRANSFERRING → phải tạo Transfer ngược (return) |

### 8.4. Validation rules

- `final_qty` phải > 0
- `final_qty` không được vượt quá `max_stock - current_daily_qty` + 10% (cho phép buffer)
- `selected_lot.quantity` phải ≥ `final_qty`
- `selected_lot.expiration_date` phải > hôm nay (không chuyển lô hết hạn)
- Không cho phép tạo run mới nếu đã có run `DRAFT`/`REVIEWED` cho cùng tuần + product_group (trừ khi user xác nhận override)

### 8.5. Security & Audit

- Mọi thao tác (tạo, sửa, duyệt, hủy) phải ghi vào `audit_log` theo TT54
- Mọi điều chỉnh số lượng phải có lý do (bắt buộc)
- RLS đảm bảo thủ kho chỉ thấy đúng mảng của mình
- Không cho phép thủ kho VTYT xem/sửa đề xuất HC-SP và ngược lại

---

## 9. ACCEPTANCE CRITERIA

### 9.1. Functional

- [ ] **AC-1**: Cron job tự động chạy thứ 6 hàng tuần lúc 8:00 sáng, tạo đề xuất cho cả 2 mảng
- [ ] **AC-2**: Đề xuất được tính theo công thức đã chốt (0.6/0.4, buffer 1.5 tuần)
- [ ] **AC-3**: FEFO tự động chọn lô có hạn ngắn nhất còn đủ số lượng
- [ ] **AC-4**: Thủ kho kho chẵn có thể điều chỉnh số lượng + lý do
- [ ] **AC-5**: Thủ kho kho lẻ nhận được notification, có thể điều chỉnh số lượng
- [ ] **AC-6**: Nếu tổng giá trị ≤ 5M VNĐ → auto-approve; nếu > 5M → chờ Trưởng khoa duyệt
- [ ] **AC-7**: Khi kho chẵn hết → không tạo line, hiển thị cảnh báo
- [ ] **AC-8**: Sản phẩm mới (< 3 tháng data) dùng `min_stock` làm mặc định
- [ ] **AC-9**: Tạo Transfer Document từ Run sau khi APPROVED
- [ ] **AC-10**: Thủ kho kho lẻ xác nhận nhận → COMPLETED + tạo StockMovement
- [ ] **AC-11**: Mọi thao tác điều chỉnh ghi vào `adjustment_history` + `audit_log`
- [ ] **AC-12**: RLS chặn đúng: thủ kho VTYT không thấy đề xuất HC-SP

### 9.2. Non-functional

- [ ] **AC-13**: Cron chạy xong trong < 30 giây (với 1000 sản phẩm)
- [ ] **AC-14**: Dashboard load trong < 2 giây
- [ ] **AC-15**: Mobile responsive (đã test trên iPhone 12, Samsung Galaxy S21)
- [ ] **AC-16**: Audit log đầy đủ cho TT54 (ai, làm gì, khi nào, từ đâu)
- [ ] **AC-17**: Backup strategy: weekly_replenishment_runs được backup hàng ngày
- [ ] **AC-18**: Documentation: API docs + user guide cho thủ kho

### 9.3. Test cases (cho QA)

| # | Test case | Expected |
|---|---|---|
| TC-1 | Cron chạy thứ 6 đầu tiên sau khi deploy | 2 run được tạo (HC-SP + VTYT), status = DRAFT |
| TC-2 | Sản phẩm có đủ data 3 tháng | Áp dụng công thức đầy đủ |
| TC-3 | Sản phẩm mới (chưa có 3 tháng) | Dùng min_stock |
| TC-4 | Kho chẵn hết hàng | Không tạo line, cảnh báo hiển thị |
| TC-5 | Lô FEFO có hạn 15 ngày | Tự ưu tiên chọn lô đó |
| TC-6 | Thủ kho điều chỉnh từ 5 → 10 | Lưu thành công, ghi audit |
| TC-7 | Tổng giá trị 4.5M | Auto-approve, status = APPROVED |
| TC-8 | Tổng giá trị 7M | Chờ Trưởng khoa duyệt |
| TC-9 | Trưởng khoa từ chối | status = REJECTED, lưu lý do |
| TC-10 | Tạo Transfer từ Run APPROVED | Transfer document được tạo, StockMovement OUT |
| TC-11 | Kho lẻ xác nhận nhận đủ | status = COMPLETED, StockMovement IN |
| TC-12 | Kho lẻ xác nhận nhận thiếu | Line đó FAILED, ghi lý do, các line khác COMPLETED |
| TC-13 | Thủ kho VTYT cố truy cập /replenishment/weekly?productGroup=HC-SP | 403 Forbidden |
| TC-14 | Chạy manual 2 lần trong cùng tuần | Lần 2 cập nhật lần 1, không tạo duplicate |
| TC-15 | Cancel run sau khi đã COMPLETED | API reject với lỗi "Không thể hủy run đã hoàn tất" |

---

## PHỤ LỤC

### A. Tham chiếu quy định
- **QĐ 2429/BYT** Tiêu chí 7.2
- **ISO 15189:2022** Điều khoản 6.5.3
- **TT 54/2017/BYT** Điều 14 (audit log)

### B. Effort estimate
- Schema + migration: 1 tuần
- Edge Function (compute): 1 tuần
- API hooks: 0.5 tuần
- UI (3 trang + 1 modal): 1.5 tuần
- **Tổng: 4 tuần** (khớp với estimate trong handover)

### C. Phụ thuộc module khác
- Cần module **N1** (Warehouse Role) trước → 1 tuần
- Cần module **N3** (Dual-Keeper Permission) → 1 tuần
- Có thể chạy song song với module **#3** (FEFO) và **#4** (Open-Vial) nếu không overlap code

### D. Câu hỏi mở (cho session sau)
- Ngưỡng 5M VNĐ có cần cấu hình được không (mỗi tenant có thể khác)?
- Có cần gửi thông báo SMS không, hay chỉ email + in-app?
- Khi thủ kho kho lẻ yêu cầu điều chỉnh tăng > 50% so với đề xuất ban đầu → có cần Trưởng khoa duyệt lại không?

---

**Người viết**: Claude
**Ngày**: 2026-06-14
**Trạng thái**: ⏸️ CHỜ USER REVIEW



