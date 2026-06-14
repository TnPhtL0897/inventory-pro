# SPEC #2: Monthly Replenishment Request (Excel Export) — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: N6 (P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 2.4, 4.1

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Hỗ trợ Khoa Xét Nghiệm tạo và gửi **file Excel dự trù vật tư hàng tháng** cho:
- **Khoa Dược** (nếu là Hóa chất - Sinh phẩm)
- **Phòng VTYT** (nếu là Vật tư y tế)

Quy trình gửi **1 chiều** — Khoa Dược / Phòng VTYT **không phản hồi** trên hệ thống.

### 1.2. Phạm vi
- **Trong scope**:
  - Tính toán số lượng dự trù cho **từng sản phẩm** trong từng mảng (HC-SP / VTYT)
  - Cho phép thủ kho **override** số lượng trước khi xuất Excel
  - Xuất file Excel theo mẫu chuẩn phổ thông
  - Tải file về + Gửi email tự động
  - Lưu lịch sử theo tháng (audit log theo TT54)
- **Ngoài scope**:
  - Phản hồi từ Khoa Dược/Phòng VTYT (gửi 1 chiều)
  - Theo dõi hợp đồng thầu (thuộc module Bid Tracking — SPEC #8)
  - Lập kế hoạch ngân sách

### 1.3. Tuân thủ quy định
- **Nghị định 24/2024/NĐ-CP**: Quy định đấu thầu, mua sắm công
- **TT 54/2017/BYT**: Audit log mọi thao tác dự trù
- **QĐ 2429/BYT**: Tiêu chí 7.2 (Quản lý hóa chất, sinh phẩm)

---

## 2. ACTORS (Người dùng)

| Actor | Mô tả | Quyền trong module |
|---|---|---|
| **Thủ kho** (BULK + DAILY) | Cả 2 thủ kho của 1 mảng | Tạo dự trù, override số lượng, xuất Excel, gửi email |
| **Trưởng khoa (DEPT_HEAD)** | Duyệt dự trù | Duyệt cuối trước khi gửi đi |
| **Khoa Dược / Phòng VTYT** | Bên nhận | **KHÔNG truy cập hệ thống** — chỉ nhận file Excel qua email |

### 2.1. Phân quyền theo role
- `KEEPER_BULK_HC_SP` + `KEEPER_DAILY_HC_SP` → tạo dự trù HC-SP
- `KEEPER_BULK_VTYT` + `KEEPER_DAILY_VTYT` → tạo dự trù VTYT
- `DEPT_HEAD` → duyệt tất cả dự trù của khoa

---

## 3. WORKFLOW CHI TIẾT

```
[Đầu tháng, vd: ngày 1-5 hàng tháng]
        ↓
[Hệ thống (CRON hoặc thủ kho tạo thủ công)]
  Tạo Monthly Replenishment Draft cho mảng HC-SP và VTYT
  Auto-fill số lượng dự trù = avg_3m × 1.2 buffer
        ↓
[Thủ kho]
  Mở app → /replenishment/monthly
  Xem danh sách sản phẩm + số lượng đề xuất
  Override số lượng (nếu cần) + lý do
  Nhấn "Gửi Trưởng khoa duyệt" → status = PENDING_APPROVAL
        ↓
[Trưởng khoa]
  Nhận notification → mở app
  Xem chi tiết, có thể override thêm
  Nhấn "Duyệt" → status = APPROVED
  HOẶC "Từ chối" (có lý do) → status = REJECTED
        ↓
[Thủ kho]
  Sau khi APPROVED:
    ├── [Tải Excel về] → status = EXPORTED (file lưu local)
    └── [Gửi email] → status = SENT
        ↓
[Hệ thống]
  Gửi email kèm file Excel cho Khoa Dược / Phòng VTYT
  Log email + file đã gửi
  Lưu lịch sử theo tháng
```

### 3.1. Trạng thái (status) của Monthly Replenishment
- `DRAFT` — Vừa được tạo (auto bởi cron hoặc thủ kho), chờ override
- `PENDING_APPROVAL` — Thủ kho đã gửi cho Trưởng khoa
- `APPROVED` — Trưởng khoa đã duyệt, sẵn sàng xuất
- `REJECTED` — Trưởng khoa từ chối (phải có lý do)
- `EXPORTED` — Thủ kho đã tải file Excel về
- `SENT` — Đã gửi email thành công cho bên nhận
- `CANCELLED` — Hủy bỏ (vd: tạo nhầm tháng)

### 3.2. Trạng thái của Line (sản phẩm trong dự trù)
- `AUTO` — Hệ thống tự tính, chưa ai sửa
- `OVERRIDDEN` — Thủ kho hoặc Trưởng khoa đã override
- `SKIPPED` — Bỏ qua (không dự trù tháng này)

---

## 4. LOGIC TÍNH TOÁN (CÔNG THỨC ĐỀ XUẤT)

### 4.1. Input (snapshot tại thời điểm tạo)
- `consumption_3m` — Tổng tiêu hao 90 ngày gần nhất (INT)
- `consumption_last_month` — Tổng tiêu hao tháng trước (INT) — để so sánh
- `current_bulk_qty` — Tồn kho chẵn hiện tại (INT)
- `current_daily_qty` — Tồn kho lẻ hiện tại (INT)
- `min_stock` — Tồn tối thiểu
- `max_stock` — Tồn tối đa

### 4.2. Công thức (đã chốt với user)

```
# Bước 1: Trung bình tiêu hao / tháng
avg_monthly = consumption_3m / 3

# Bước 2: Áp dụng buffer 1.2
suggested_qty = ROUND(avg_monthly * 1.2, 0)

# Bước 3: Cộng thêm lượng cần bù nếu tồn kho thấp hơn min_stock
# (Đây là phần "reorder" — bù để đạt min_stock)
if current_bulk_qty + current_daily_qty < min_stock:
  shortfall = min_stock - (current_bulk_qty + current_daily_qty)
  suggested_qty = suggested_qty + shortfall

# Bước 4: Cap bởi max_stock (không dự trù quá max)
# Nếu dự trù vượt quá max → flag cảnh báo
if suggested_qty > max_stock - (current_bulk_qty + current_daily_qty):
  suggested_qty = max_stock - (current_bulk_qty + current_daily_qty)
  flag = "VUOT_MAX_STOCK"

# Bước 5: Nếu avg_monthly = 0 (không có tiêu hao) → skip
if avg_monthly == 0:
  skip
```

### 4.3. Edge cases

| Trường hợp | Xử lý |
|---|---|
| Sản phẩm mới (chưa có 3 tháng data) | Dùng `min_stock` làm mặc định |
| `avg_monthly = 0` (không tiêu hao 3 tháng qua) | Skip — không dự trù |
| Tồn kho hiện tại ≥ max_stock | Skip + flag "ĐỦ DÙNG" |
| Dự trù vượt max_stock | Cap về max_stock + flag "VUOT_MAX_STOCK" để thủ kho review |
| Sản phẩm bị block/recall | Skip + flag "BLOCKED" |
| Đã có dự trù APPROVED cho tháng này | Khi tạo mới → hỏi "Đã có dự trù tháng X/YYYY. Tạo mới sẽ thay thế?" |
| Chạy manual nhiều lần trong tháng | Mỗi lần tạo 1 draft riêng; user chọn draft nào để duyệt |

### 4.4. Ví dụ minh họa

**Sản phẩm**: Hóa chất Glucose (HC-SP)

| Input | Giá trị |
|---|---|
| `consumption_3m` | 39 chai (90 ngày) |
| `consumption_last_month` | 12 chai |
| `current_bulk_qty` | 5 chai |
| `current_daily_qty` | 3 chai |
| `min_stock` | 10 chai |
| `max_stock` | 20 chai |

**Tính toán**:
```
avg_monthly         = 39 / 3 = 13
suggested_qty       = ROUND(13 * 1.2, 0) = 16
total_current       = 5 + 3 = 8 < min_stock (10) → shortfall = 2
suggested_qty       = 16 + 2 = 18
# Cap: 18 vs (20 - 8) = 12 → final = 12, flag "VUOT_MAX_STOCK"
```

→ **Dự trù 12 chai** (đã cap do max_stock), thủ kho sẽ thấy cảnh báo "VUOT_MAX_STOCK" và quyết định:
- Chấp nhận 12 (cap theo max)
- Hoặc override lên 18 và tăng max_stock (cần Trưởng khoa duyệt override)

---

---

## 5. SCHEMA CHI TIẾT

### 5.1. Migration: `20260614_monthly_replenishment.sql`

```sql
-- ============================================================
-- MODULE N6: MONTHLY REPLENISHMENT REQUEST (EXCEL EXPORT)
-- File: supabase/migrations/20260614_monthly_replenishment.sql
-- ============================================================

-- 5.1.1. ENUM cho run status
CREATE TYPE monthly_replenishment_status AS ENUM (
  'DRAFT',              -- Mới tạo, chờ override
  'PENDING_APPROVAL',   -- Đã gửi TK khoa duyệt
  'APPROVED',           -- Đã duyệt
  'REJECTED',           -- TK khoa từ chối
  'EXPORTED',           -- Thủ kho đã tải file Excel
  'SENT',               -- Đã gửi email
  'CANCELLED'           -- Hủy bỏ
);

-- 5.1.2. ENUM cho line status
CREATE TYPE monthly_replenishment_line_status AS ENUM (
  'AUTO',         -- Hệ thống tự tính
  'OVERRIDDEN',   -- Đã override
  'SKIPPED'       -- Bỏ qua
);

-- 5.1.3. ENUM cho flag cảnh báo
CREATE TYPE monthly_replenishment_flag AS ENUM (
  'VUOT_MAX_STOCK',
  'BLOCKED',
  'DU_DUNG',
  'SAN_PHAM_MOI',
  'THIEU_DATA'
);

-- 5.1.4. Bảng monthly_replenishment_runs
CREATE TABLE monthly_replenishment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_group TEXT NOT NULL CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),

  -- Kỳ dự trù (luôn là tháng)
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INT NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),

  -- Trạng thái
  status monthly_replenishment_status NOT NULL DEFAULT 'DRAFT',

  -- Người tham gia
  created_by UUID REFERENCES auth.users(id),
  submitted_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  rejected_by UUID REFERENCES auth.users(id),

  -- Lý do reject (nếu có)
  rejection_reason TEXT,

  -- File Excel (metadata)
  excel_file_name TEXT,                -- vd: "DuTru_Thang_06_2026_HC_SP.xlsx"
  excel_file_path TEXT,                -- Path trong Supabase Storage
  excel_file_generated_at TIMESTAMPTZ,

  -- Email (nếu đã gửi)
  email_sent_at TIMESTAMPTZ,
  email_recipients TEXT[],             -- Danh sách email người nhận
  email_message_id TEXT,               -- Message-ID từ email server (để tracking)

  -- Thống kê
  total_products INT DEFAULT 0,
  total_estimated_value DECIMAL(15, 2),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique: 1 run active / product_group / tháng (chỉ áp dụng khi status != CANCELLED)
  -- Cho phép tạo nhiều draft, nhưng chỉ 1 được APPROVED/SENT cùng lúc
  UNIQUE (tenant_id, product_group, period_year, period_month)
);

CREATE INDEX idx_mrr_tenant_period ON monthly_replenishment_runs(tenant_id, period_year DESC, period_month DESC);
CREATE INDEX idx_mrr_status ON monthly_replenishment_runs(tenant_id, status);

-- 5.1.5. Bảng monthly_replenishment_lines
CREATE TABLE monthly_replenishment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES monthly_replenishment_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- Input data (snapshot)
  consumption_3m INT NOT NULL DEFAULT 0,
  consumption_last_month INT NOT NULL DEFAULT 0,
  current_bulk_qty INT NOT NULL DEFAULT 0,
  current_daily_qty INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NOT NULL DEFAULT 0,

  -- Calculation
  avg_monthly DECIMAL(10, 2),
  base_suggested_qty DECIMAL(10, 2),     -- avg_monthly * 1.2
  shortfall INT DEFAULT 0,                -- min_stock - total_current
  final_suggested_qty INT,                -- Sau khi cộng shortfall + cap max_stock

  -- Đề xuất cuối
  suggested_qty INT NOT NULL DEFAULT 0,
  final_qty INT NOT NULL DEFAULT 0,       -- Có thể bị override
  unit_price DECIMAL(15, 2),
  estimated_value DECIMAL(15, 2),        -- = final_qty * unit_price

  -- Flags
  flags monthly_replenishment_flag[] DEFAULT '{}',

  -- Override history (audit trail)
  override_history JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"by": "user_id", "by_role": "KEEPER_BULK_HC_SP", "from": 12, "to": 15, "reason": "...", "at": "..."}]

  -- Notes
  notes TEXT,

  status monthly_replenishment_line_status NOT NULL DEFAULT 'AUTO',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mrl_run ON monthly_replenishment_lines(run_id);
CREATE INDEX idx_mrl_product ON monthly_replenishment_lines(product_id);

-- 5.1.6. Bảng lưu email log (nếu gửi email tự động)
CREATE TABLE monthly_replenishment_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES monthly_replenishment_runs(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES auth.users(id),
  recipients TEXT[] NOT NULL,
  cc_recipients TEXT[],
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments JSONB,                      -- [{file_name, file_path, file_size}]
  status TEXT NOT NULL,                   -- 'PENDING' | 'SENT' | 'FAILED'
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mrel_run ON monthly_replenishment_email_log(run_id);

-- 5.1.7. Bảng cấu hình email người nhận (admin cấu hình)
CREATE TABLE monthly_replenishment_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_group TEXT NOT NULL CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),
  recipient_type TEXT NOT NULL,           -- 'KHOA_DUOC' | 'PHONG_VTYT' | 'CC_INTERNAL'
  recipient_name TEXT NOT NULL,           -- Tên đơn vị / người nhận
  email_addresses TEXT[] NOT NULL,        -- Danh sách email
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mrr_recipients_tenant ON monthly_replenishment_recipients(tenant_id, product_group);

-- 5.1.8. RLS Policies
ALTER TABLE monthly_replenishment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_replenishment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_replenishment_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_replenishment_recipients ENABLE ROW LEVEL SECURITY;

-- Policy: Thủ kho HC-SP thấy runs HC-SP
CREATE POLICY "rls_mrr_keeper_hc" ON monthly_replenishment_runs
  FOR ALL USING (
    product_group = 'HOA_CHAT_SINH_PHAM'
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP')
  );

CREATE POLICY "rls_mrr_keeper_vtyt" ON monthly_replenishment_runs
  FOR ALL USING (
    product_group = 'VAT_TU_Y_TE'
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT')
  );

CREATE POLICY "rls_mrr_dept_head" ON monthly_replenishment_runs
  FOR SELECT USING ((auth.jwt() ->> 'role') = 'DEPT_HEAD');

-- Lines: Cho phép SELECT/UPDATE nếu parent run được phép + status cho phép
CREATE POLICY "rls_mrl_parent" ON monthly_replenishment_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM monthly_replenishment_runs r WHERE r.id = monthly_replenishment_lines.run_id)
  );

-- Recipients: Admin/DEPT_HEAD xem/sửa
CREATE POLICY "rls_mrr_recipients_admin" ON monthly_replenishment_recipients
  FOR ALL USING ((auth.jwt() ->> 'role') IN ('DEPT_HEAD', 'ADMIN'));

-- 5.1.9. Trigger cập nhật updated_at
CREATE TRIGGER trg_mrr_update
  BEFORE UPDATE ON monthly_replenishment_runs
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

CREATE TRIGGER trg_mrl_update
  BEFORE UPDATE ON monthly_replenishment_lines
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

CREATE TRIGGER trg_mrr_recipients_update
  BEFORE UPDATE ON monthly_replenishment_recipients
  FOR EACH ROW EXECUTE FUNCTION trg_wrr_updated_at();

-- 5.1.10. View tiện truy vấn
CREATE OR REPLACE VIEW v_monthly_replenishment_detail AS
SELECT
  l.id AS line_id,
  l.run_id,
  r.period_month,
  r.period_year,
  r.product_group,
  r.status AS run_status,
  l.product_id,
  p.code AS product_code,
  p.name AS product_name,
  p.unit,
  l.consumption_3m,
  l.avg_monthly,
  l.final_suggested_qty,
  l.final_qty,
  l.unit_price,
  l.estimated_value,
  l.flags,
  l.status AS line_status,
  l.notes
FROM monthly_replenishment_lines l
JOIN monthly_replenishment_runs r ON r.id = l.run_id
JOIN products p ON p.id = l.product_id;

-- 5.1.11. Function auto tạo draft đầu tháng (cho cron gọi)
CREATE OR REPLACE FUNCTION fn_create_monthly_replenishment_drafts(
  p_tenant_id UUID,
  p_product_group TEXT,
  p_period_month INT,
  p_period_year INT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID;
  v_product RECORD;
  v_consumption_3m INT;
  v_consumption_last_month INT;
  v_avg_monthly DECIMAL(10,2);
  v_suggested INT;
  v_total_current INT;
  v_shortfall INT;
  v_final INT;
  v_flags monthly_replenishment_flag[];
BEGIN
  -- Tạo run
  INSERT INTO monthly_replenishment_runs (tenant_id, product_group, period_month, period_year, status, created_by)
  VALUES (p_tenant_id, p_product_group, p_period_month, p_period_year, 'DRAFT', p_created_by)
  RETURNING id INTO v_run_id;

  -- Loop qua từng sản phẩm active trong product_group
  FOR v_product IN
    SELECT * FROM products
    WHERE tenant_id = p_tenant_id
      AND product_group = p_product_group
      AND is_active = TRUE
  LOOP
    -- Tính consumption 3 tháng
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_consumption_3m
    FROM stock_movements
    WHERE product_id = v_product.id
      AND movement_type = 'OUT'
      AND movement_date >= (CURRENT_DATE - INTERVAL '90 days');

    -- Tính consumption tháng trước
    SELECT COALESCE(SUM(quantity), 0)
    INTO v_consumption_last_month
    FROM stock_movements
    WHERE product_id = v_product.id
      AND movement_type = 'OUT'
      AND movement_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND movement_date < DATE_TRUNC('month', CURRENT_DATE);

    -- Tính tồn kho hiện tại
    SELECT
      COALESCE(SUM(CASE WHEN warehouse_role = 'BULK' THEN quantity ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN warehouse_role = 'DAILY' THEN quantity ELSE 0 END), 0)
    INTO v_product.current_bulk_qty, v_product.current_daily_qty
    FROM stock
    WHERE product_id = v_product.id;

    v_total_current := v_product.current_bulk_qty + v_product.current_daily_qty;

    -- Tính toán đề xuất
    v_avg_monthly := v_consumption_3m / 3.0;
    v_suggested := ROUND(v_avg_monthly * 1.2, 0);
    v_flags := '{}';

    -- Edge case: avg = 0 → skip
    IF v_avg_monthly = 0 THEN
      INSERT INTO monthly_replenishment_lines (run_id, product_id, consumption_3m, consumption_last_month, current_bulk_qty, current_daily_qty, min_stock, max_stock, status)
      VALUES (v_run_id, v_product.id, v_consumption_3m, v_consumption_last_month, v_product.current_bulk_qty, v_product.current_daily_qty, v_product.min_stock, v_product.max_stock, 'SKIPPED');
      CONTINUE;
    END IF;

    -- Shortfall nếu dưới min_stock
    IF v_total_current < v_product.min_stock THEN
      v_shortfall := v_product.min_stock - v_total_current;
      v_suggested := v_suggested + v_shortfall;
    END IF;

    v_final := v_suggested;

    -- Cap bởi max_stock
    IF v_final > (v_product.max_stock - v_total_current) THEN
      v_final := GREATEST(0, v_product.max_stock - v_total_current);
      v_flags := array_append(v_flags, 'VUOT_MAX_STOCK');
    END IF;

    -- Edge case: sản phẩm mới (consumption = 0 nhưng có min_stock)
    IF v_consumption_3m = 0 AND v_product.min_stock > 0 THEN
      v_final := v_product.min_stock;
      v_flags := array_append(v_flags, 'SAN_PHAM_MOI');
    END IF;

    -- Insert line
    INSERT INTO monthly_replenishment_lines (
      run_id, product_id,
      consumption_3m, consumption_last_month,
      current_bulk_qty, current_daily_qty,
      min_stock, max_stock,
      avg_monthly, base_suggested_qty, shortfall, final_suggested_qty,
      suggested_qty, final_qty, flags
    ) VALUES (
      v_run_id, v_product.id,
      v_consumption_3m, v_consumption_last_month,
      v_product.current_bulk_qty, v_product.current_daily_qty,
      v_product.min_stock, v_product.max_stock,
      v_avg_monthly, ROUND(v_avg_monthly * 1.2, 0), v_shortfall, v_final,
      v_final, v_final, v_flags
    );
  END LOOP;

  RETURN v_run_id;
END;
$$;

COMMENT ON TABLE monthly_replenishment_runs IS 'Mỗi record = 1 đợt dự trù tháng cho 1 product_group';
COMMENT ON TABLE monthly_replenishment_lines IS 'Mỗi record = 1 sản phẩm trong đợt dự trù tháng';
COMMENT ON TABLE monthly_replenishment_recipients IS 'Danh sách email người nhận dự trù tháng (admin config)';
```

---

## 6. API HOOKS

### 6.1. React Query Hooks

```typescript
// src/lib/hooks/useMonthlyReplenishment.ts

// ============================================
// QUERIES
// ============================================

/** Danh sách runs (cho dashboard /replenishment/monthly) */
export function useMonthlyReplenishmentRuns(params: {
  productGroup?: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE';
  status?: MonthlyReplenishmentStatus;
  periodYear?: number;
  periodMonth?: number;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['monthly-replenishment-runs', params],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('monthly_replenishment_runs')
        .select('*, lines:monthly_replenishment_lines(count)')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(params.limit ?? 20);

      if (params.productGroup) q = q.eq('product_group', params.productGroup);
      if (params.status) q = q.eq('status', params.status);
      if (params.periodYear) q = q.eq('period_year', params.periodYear);
      if (params.periodMonth) q = q.eq('period_month', params.periodMonth);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

/** Chi tiết 1 run */
export function useMonthlyReplenishmentRun(id: string) {
  return useQuery({
    queryKey: ['monthly-replenishment-run', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('monthly_replenishment_runs')
        .select(`
          *,
          lines:monthly_replenishment_lines(
            *,
            product:products(id, code, name, unit, product_group, min_stock, max_stock)
          )
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Lịch sử runs (đã SENT) */
export function useMonthlyReplenishmentHistory(params: { limit?: number } = {}) {
  return useMonthlyReplenishmentRuns({ ...params, status: 'SENT' });
}

/** Danh sách email người nhận (cho dropdown khi gửi) */
export function useMonthlyReplenishmentRecipients(productGroup: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE') {
  return useQuery({
    queryKey: ['monthly-replenishment-recipients', productGroup],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('monthly_replenishment_recipients')
        .select('*')
        .eq('product_group', productGroup)
        .eq('is_active', true)
        .order('recipient_type');
      if (error) throw error;
      return data;
    },
  });
}

// ============================================
// MUTATIONS
// ============================================

/** Tạo draft mới (auto-fill bằng function fn_create_monthly_replenishment_drafts) */
export function useCreateMonthlyReplenishmentDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productGroup: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE';
      periodMonth: number;
      periodYear: number;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('fn_create_monthly_replenishment_drafts', {
        p_tenant_id: (await supabase.auth.getUser()).data.user?.user_metadata?.tenant_id,
        p_product_group: input.productGroup,
        p_period_month: input.periodMonth,
        p_period_year: input.periodYear,
        p_created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      return data; // runId
    },
  });
}

/** Thủ kho override số lượng 1 line */
export function useOverrideMonthlyReplenishmentLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lineId: string;
      newQty: number;
      reason: string;
      userId: string;
      userRole: string;
    }) => {
      const supabase = createClient();
      // Lấy line hiện tại
      const { data: line } = await supabase
        .from('monthly_replenishment_lines')
        .select('*')
        .eq('id', input.lineId)
        .single();
      if (!line) throw new Error('Line not found');

      // Append vào override_history
      const newHistory = [
        ...(line.override_history ?? []),
        {
          by: input.userId,
          by_role: input.userRole,
          from: line.final_qty,
          to: input.newQty,
          reason: input.reason,
          at: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase
        .from('monthly_replenishment_lines')
        .update({
          final_qty: input.newQty,
          estimated_value: input.newQty * (line.unit_price ?? 0),
          status: 'OVERRIDDEN',
          override_history: newHistory,
        })
        .eq('id', input.lineId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Skip 1 line (không dự trù) */
export function useSkipMonthlyReplenishmentLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lineId: string; reason: string }) => {
      // ...
    },
  });
}

/** Gửi cho Trưởng khoa duyệt (DRAFT → PENDING_APPROVAL) */
export function useSubmitMonthlyReplenishmentForApproval() {
  return useMutation({
    mutationFn: async (runId: string) => {
      // ...
    },
  });
}

/** Trưởng khoa duyệt */
export function useApproveMonthlyReplenishment() {
  return useMutation({
    mutationFn: async (input: { runId: string; approved: boolean; reason?: string }) => {
      // approved=true → status = APPROVED
      // approved=false → status = REJECTED
    },
  });
}

/** Generate Excel file (gọi Edge Function generate_excel) */
export function useGenerateMonthlyReplenishmentExcel() {
  return useMutation({
    mutationFn: async (runId: string) => {
      // Edge Function trả về signed URL để tải file
    },
  });
}

/** Gửi email (gọi Edge Function send_email) */
export function useSendMonthlyReplenishmentEmail() {
  return useMutation({
    mutationFn: async (input: {
      runId: string;
      recipients: string[];
      ccRecipients?: string[];
      subject: string;
      body: string;
    }) => {
      // Edge Function sử dụng SMTP/Resend/SendGrid
    },
  });
}
```

### 6.2. Edge Function API

**`generate-monthly-replenishment-excel`**:

```
POST /functions/v1/generate-monthly-replenishment-excel
Body: { runId: string }

Response: {
  fileName: string;       // "DuTru_Thang_06_2026_HC_SP.xlsx"
  filePath: string;       // Path trong Supabase Storage
  signedUrl: string;      // URL tải file (có thời hạn 1 giờ)
  totalValue: number;
  totalProducts: number;
}
```

**Cấu trúc file Excel** (theo mẫu chuẩn phổ thông đã chốt):

| Cột | Header | Dữ liệu |
|---|---|---|
| A | STT | 1, 2, 3, ... |
| B | Mã sản phẩm | p.code |
| C | Tên sản phẩm | p.name |
| D | Đơn vị | p.unit |
| E | Tồn kho chẵn (hiện tại) | line.current_bulk_qty |
| F | Tồn kho lẻ (hiện tại) | line.current_daily_qty |
| G | Tiêu hao TB 3 tháng/tháng | line.avg_monthly |
| H | Tồn tối thiểu | line.min_stock |
| I | Tồn tối đa | line.max_stock |
| J | **SỐ LƯỢNG DỰ TRÙ** | line.final_qty |
| K | Đơn giá (VNĐ) | line.unit_price |
| L | Thành tiền (VNĐ) | line.estimated_value |
| M | Ghi chú | line.notes + flags |

**Sheet 2 (Thống kê)**:
- Tổng số sản phẩm
- Tổng giá trị dự trù
- Số SP bị VUOT_MAX_STOCK
- Số SP SKIPPED
- Thông tin người tạo + người duyệt
- Ngày tạo + Ngày duyệt

**`send-monthly-replenishment-email`**:

```
POST /functions/v1/send-monthly-replenishment-email
Body: {
  runId: string;
  recipients: string[];
  ccRecipients?: string[];
  subject: string;
  body: string;
  attachExcel: boolean;  // mặc định true
}

Response: {
  emailLogId: string;
  status: 'SENT' | 'FAILED';
  messageId?: string;
  error?: string;
}
```

**Cron schedule** (tạo draft đầu tháng):
```sql
-- Chạy ngày 1 hàng tháng lúc 7:00 sáng
SELECT cron.schedule(
  'create-monthly-replenishment-drafts',
  '0 7 1 * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/create-monthly-replenishment-drafts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

---

---

## 7. UI WIREFRAMES

### 7.1. Trang `/replenishment/monthly` — Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: UserMenu | Logo | PillNav                              │
├──────────────────────────────────────────────────────────────────┤
│  BREADCRUMB: Trang chủ > Dự trù tháng                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📅 Dự trù vật tư hàng tháng                              │   │
│  │ ─────────────────────────────────────────────────────── │   │
│  │ [HC-SP] [VTYT] [Tất cả]   Tháng: ◀ 06/2026 ▶            │   │
│  │                                       [+ Tạo dự trù mới] │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── Dự trù tháng này (06/2026) ─────────────────────────┐    │
│  │ Mã: MR-2026-06-HC       Trạng thái: DRAFT              │    │
│  │ Tổng: 35 sản phẩm | 18.2M VNĐ                          │    │
│  │ Tạo: 01/06/2026 bởi CRON                                │    │
│  │                                       [Mở chi tiết →]    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Dự trù tháng này (06/2026) ─────────────────────────┐    │
│  │ Mã: MR-2026-06-VTYT     Trạng thái: PENDING_APPROVAL   │    │
│  │ Tổng: 22 sản phẩm | 8.5M VNĐ                           │    │
│  │ Gửi duyệt: 02/06/2026 bởi Nguyễn Văn A                  │    │
│  │                                       [Mở chi tiết →]    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Lịch sử ─────────────────────────────────────────────┐   │
│  │ Tháng 05/2026 - HC-SP                                    │   │
│  │ Trạng thái: SENT | Gửi email 05/05/2026                  │   │
│  │ 32 SP | 15.8M | Gửi cho: khoa.duoc@bvct.vn              │   │
│  │                                            [Xem lại →]   │   │
│  │                                                          │   │
│  │ Tháng 05/2026 - VTYT                                     │   │
│  │ Trạng thái: SENT | Gửi email 05/05/2026                  │   │
│  │ 20 SP | 7.2M | Gửi cho: phong.vtyt@bvct.vn              │   │
│  │                                            [Xem lại →]   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2. Trang `/replenishment/monthly/[id]` — Chi tiết

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: UserMenu | Logo | PillNav                              │
├──────────────────────────────────────────────────────────────────┤
│  BREADCRUMB: Trang chủ > Dự trù tháng > MR-2026-06-HC          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📋 MR-2026-06-HC — Dự trù tháng 06/2026 (HC-SP)         │   │
│  │ ─────────────────────────────────────────────────────── │   │
│  │ Trạng thái: DRAFT                                         │   │
│  │ Tổng: 35 sản phẩm | 18.2M VNĐ                          │   │
│  │ Tạo: 01/06/2026 07:00 bởi CRON                          │   │
│  │                                                            │   │
│  │ [📤 Gửi Trưởng khoa duyệt]  [❌ Hủy]  [📊 Xuất Excel]   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── Bảng sản phẩm dự trù ───────────────────────────────┐    │
│  │ ⚠️ Bộ lọc: [Tất cả] [Có cảnh báo] [Đã override] [Skip] │    │
│  │ Tìm kiếm: [________]                                    │    │
│  │                                                          │    │
│  │ STT │ Mã SP    │ Tên SP        │ Tồn kho │ TB 3T │ DỰ TRÙ│   │
│  │     │          │               │ Chẵn/Lẻ │       │       │   │
│  │     │          │               │ Min/Max │       │ Ghi chú│   │
│  │─────┼──────────┼───────────────┼─────────┼───────┼───────│   │
│  │  1  │ HO-001   │ Glucose       │ 5 / 3   │ 13    │ 12⚠️  │   │
│  │     │          │               │ 10/20   │       │ VUOT  │   │
│  │     │          │               │         │       │ MAX   │   │
│  │     │          │               │         │       │[Sửa] │   │
│  │─────┼──────────┼───────────────┼─────────┼───────┼───────│   │
│  │  2  │ HO-002   │ Urea          │ 8 / 5   │ 14    │ 17    │   │
│  │     │          │               │ 12/20   │       │       │   │
│  │     │          │               │         │       │[Sửa] │   │
│  │─────┼──────────┼───────────────┼─────────┼───────┼───────│   │
│  │  3  │ HO-045   │ HBsAg Test    │ 0 / 12  │ 5     │ 6     │   │
│  │     │          │               │ 15/30   │       │ SAN   │   │
│  │     │          │               │         │       │ PHAM  │   │
│  │     │          │               │         │       │ MOI   │   │
│  │     │          │               │         │       │[Sửa] │   │
│  │ ... │ ...      │ ...           │ ...     │ ...   │ ...   │   │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Lịch sử override ─────────────────────────────────────┐   │
│  │ 02/06 09:15 Nguyễn Văn A (KEEPER_BULK_HC_SP)            │   │
│  │   HO-001 Glucose: 12 → 18 (lý do: "Bù cho thiếu hụt    │   │
│  │   tháng trước")                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3. Modal override số lượng

```
┌─────────────────────────────────────────────────┐
│  ✏️ Override số lượng dự trù                    │
│  ─────────────────────────────────────────────  │
│  Sản phẩm: Glucose (HO-001)                      │
│  Số lượng tự động: 12 (đã flag VUOT_MAX_STOCK)  │
│                                                  │
│  ⚠️ Cảnh báo: Số lượng vượt max_stock           │
│  Tồn kho hiện tại: 8 | Max cho phép: 20         │
│  Dự trù tối đa: 12                               │
│                                                  │
│  Số lượng mới: [____18_____]                    │
│                                                  │
│  Lý do override (bắt buộc):                      │
│  [_________________________________________]    │
│  [_________________________________________]    │
│                                                  │
│  ⓘ Lý do phải được ghi vào audit log (TT54)     │
│                                                  │
│              [Hủy]  [💾 Lưu]                    │
└─────────────────────────────────────────────────┘
```

### 7.4. Modal gửi email

```
┌─────────────────────────────────────────────────┐
│  📧 Gửi email dự trù tháng                      │
│  ─────────────────────────────────────────────  │
│  File: DuTru_Thang_06_2026_HC_SP.xlsx (45 KB)   │
│                                                  │
│  Người nhận (mặc định từ cấu hình):             │
│  ☑ Khoa Dược - khoa.duoc@bvct.vn                │
│  ☑ khoa.duoc.kho@gmail.com                      │
│  ☐ Trưởng khoa XN - lanptt@bvct.vn (CC)        │
│                                                  │
│  Tiêu đề:                                       │
│  [Dự trù HC-SP tháng 06/2026 - Khoa XN________]│
│                                                  │
│  Nội dung:                                       │
│  ┌─────────────────────────────────────────────┐│
│  │ Kính gửi Khoa Dược,                         ││
│  │                                             ││
│  │ Khoa XN gửi bảng dự trù hóa chất - sinh    ││
│  │ phẩm sử dụng cho tháng 06/2026.             ││
│  │                                             ││
│  │ Tổng cộng: 35 sản phẩm, ước tính 18.2M VNĐ ││
│  │                                             ││
│  │ File đính kèm: DuTru_Thang_06_2026_HC_SP... ││
│  │                                             ││
│  │ Trân trọng,                                 ││
│  │ Thủ kho Khoa XN                             ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  [Xem trước]  [Lưu nháp]  [📧 Gửi ngay]         │
└─────────────────────────────────────────────────┘
```

### 7.5. Mobile View

```
┌────────────────────────┐
│ ☰  📅 Dự trù tháng    │
├────────────────────────┤
│ Tháng: 06/2026  [+]    │
├────────────────────────┤
│ ┌────────────────────┐ │
│ │ MR-2026-06-HC      │ │
│ │ DRAFT              │ │
│ │ 35 SP | 18.2M      │ │
│ │ [Chi tiết →]       │ │
│ └────────────────────┘ │
│ ┌────────────────────┐ │
│ │ MR-2026-06-VTYT    │ │
│ │ PENDING_APPROVAL   │ │
│ │ 22 SP | 8.5M       │ │
│ │ [Chi tiết →]       │ │
│ └────────────────────┘ │
│                        │
│ Lịch sử                │
│ • 05/2026 HC-SP: SENT  │
│ • 05/2026 VTYT: SENT  │
│ • 04/2026 HC-SP: SENT │
└────────────────────────┘
```

---

## 8. EDGE CASES & XỬ LÝ LỖI

### 8.1. Concurrency & Race conditions

| Tình huống | Xử lý |
|---|---|
| Cron tạo draft trong khi thủ kho đang edit | Dùng `updated_at` để check; nếu draft cũ hơn cron mới → cảnh báo |
| 2 thủ kho cùng override 1 line | Optimistic locking + RLS check role |
| Trưởng khoa duyệt trong khi thủ kho đang override | Status check: nếu đã APPROVED → reject mutation |

### 8.2. Lỗi dữ liệu

| Tình huống | Xử lý |
|---|---|
| Sản phẩm bị xóa giữa chừng | ON DELETE RESTRICT |
| Tồn kho thực tế thay đổi sau khi tạo draft | Khi duyệt, hệ thống re-check `current_bulk_qty + current_daily_qty`; nếu thay đổi đáng kể (>20%) → cảnh báo |
| Đơn giá lỗi (không tìm thấy contract) | Dùng giá mặc định = 0, flag "CHUA_CO_GIA" |
| File Excel quá lớn (>10MB) | Cảnh báo + cho phép chia nhỏ (mỗi mảng 1 file) |

### 8.3. Lỗi email

| Tình huống | Xử lý |
|---|---|
| Email server down | Lưu status = FAILED, cho phép retry |
| Email bounce (địa chỉ sai) | Log error, gửi notification cho admin |
| File đính kèm quá lớn (>25MB cho Gmail) | Nén file hoặc upload lên Drive + gửi link |

### 8.4. Validation rules

- `final_qty` phải ≥ 0
- `period_month` ∈ [1, 12]
- `period_year` ∈ [2020, 2100]
- Không cho phép tạo run mới cho tháng đã có run `APPROVED`/`SENT` (trừ khi user xác nhận cancel run cũ)
- Email recipients phải đúng format email
- File Excel phải có ít nhất 1 line `AUTO` hoặc `OVERRIDDEN` (không cho phép toàn bộ SKIPPED)

### 8.5. Security & Audit

- RLS: thủ kho chỉ thấy đúng mảng của mình
- Mọi override phải ghi lý do (bắt buộc, không được trống)
- Mọi thao tác (tạo, sửa, duyệt, gửi) ghi vào `audit_log`
- Email log lưu lại để truy vấn (vd: "Đã gửi cho ai, khi nào, message_id là gì")
- Không cho phép thủ kho VTYT override đề xuất HC-SP

---

## 9. ACCEPTANCE CRITERIA

### 9.1. Functional

- [ ] **AC-1**: Cron tự động tạo draft đầu tháng (ngày 1, 7:00 sáng) cho cả 2 mảng
- [ ] **AC-2**: Số lượng dự trù = TB 3 tháng × 1.2 (cộng shortfall nếu dưới min_stock, cap bởi max_stock)
- [ ] **AC-3**: Thủ kho có thể override số lượng + bắt buộc nhập lý do
- [ ] **AC-4**: Trưởng khoa duyệt cuối trước khi gửi đi
- [ ] **AC-5**: Tải file Excel về theo mẫu chuẩn (12 cột + sheet thống kê)
- [ ] **AC-6**: Gửi email kèm file Excel cho Khoa Dược / Phòng VTYT
- [ ] **AC-7**: Lưu lịch sử theo tháng (xem được các tháng trước)
- [ ] **AC-8**: Cảnh báo khi dự trù vượt max_stock (flag VUOT_MAX_STOCK)
- [ ] **AC-9**: Skip sản phẩm không tiêu hao 3 tháng qua (avg_monthly = 0)
- [ ] **AC-10**: Sản phẩm mới dùng min_stock làm mặc định (flag SAN_PHAM_MOI)
- [ ] **AC-11**: Email log lưu lại (người gửi, người nhận, thời gian, message_id)
- [ ] **AC-12**: RLS chặn đúng: thủ kho VTYT không thấy dự trù HC-SP

### 9.2. Non-functional

- [ ] **AC-13**: Cron tạo draft trong < 60 giây (với 1000 sản phẩm)
- [ ] **AC-14**: Generate Excel trong < 10 giây
- [ ] **AC-15**: Gửi email trong < 30 giây
- [ ] **AC-16**: Mobile responsive
- [ ] **AC-17**: Audit log đầy đủ cho TT54
- [ ] **AC-18**: File Excel format đúng chuẩn (mở được bằng Excel 2016+, Google Sheets, LibreOffice)

### 9.3. Test cases

| # | Test case | Expected |
|---|---|---|
| TC-1 | Cron chạy ngày 1 đầu tháng | 2 draft được tạo (HC-SP + VTYT), status = DRAFT |
| TC-2 | Sản phẩm có đủ data 3 tháng | Tính đúng theo công thức avg × 1.2 |
| TC-3 | Sản phẩm mới (chưa có 3 tháng data) | Dùng min_stock, flag SAN_PHAM_MOI |
| TC-4 | Tồn kho hiện tại < min_stock | Cộng shortfall vào đề xuất |
| TC-5 | Dự trù vượt max_stock | Cap về max_stock, flag VUOT_MAX_STOCK |
| TC-6 | Sản phẩm không tiêu hao 3 tháng | Skip, status = SKIPPED |
| TC-7 | Thủ kho override từ 12 → 18 (lý do: "Bù thiếu hụt") | Lưu thành công, ghi audit, flag VUOT_MAX_STOCK giữ nguyên |
| TC-8 | Override không nhập lý do | Validation fail, yêu cầu nhập lý do |
| TC-9 | Trưởng khoa duyệt | status = APPROVED, có thể xuất Excel |
| TC-10 | Trưởng khoa từ chối (có lý do) | status = REJECTED, thủ kho phải tạo lại |
| TC-11 | Generate Excel | File tải về thành công, đúng format 12 cột + sheet thống kê |
| TC-12 | Gửi email thành công | status = SENT, log email lưu đầy đủ |
| TC-13 | Gửi email fail (server down) | status vẫn APPROVED, cho phép retry |
| TC-14 | Thủ kho VTYT cố truy cập MR-2026-06-HC | 403 Forbidden |
| TC-15 | Tạo draft mới khi đã có run APPROVED cho tháng đó | Hỏi xác nhận "Đã có dự trù tháng này, tạo mới sẽ thay thế?" |
| TC-16 | Xem lịch sử tháng trước | Hiển thị đúng, có thể tải lại file Excel cũ |
| TC-17 | Cancel draft DRAFT | Thành công, status = CANCELLED |
| TC-18 | Cancel draft đã SENT | API reject, phải tạo draft mới thay thế |

---

## PHỤ LỤC

### A. Effort estimate
- Schema + migration + function: 1 tuần
- Edge Function (generate_excel + send_email): 1.5 tuần
- API hooks: 0.5 tuần
- UI (3 trang + 3 modal): 1 tuần
- Email config + template: 0.5 tuần (admin)
- **Tổng: 4.5 tuần**

### B. Phụ thuộc
- Cần module N1 (Warehouse Role) + N2 (Product Group) + N3 (Dual-Keeper Permission)
- Cần SMTP/Resend/SendGrid config (chưa có trong hệ thống hiện tại)

### C. Câu hỏi mở (cho session sau)
- Email server dùng gì? (Gmail SMTP, Resend, SendGrid, AWS SES?)
- Ngưỡng "dự trù lớn" có cần duyệt bậc 2 không? (vd: Trưởng khoa XN + Trưởng phòng TCKT?)
- Có cần tách thành 2 dự trù (thường + khẩn cấp) không?
- Khi Khoa Dược/Phòng VTYT phản hồi bằng cách gửi file Excel lại (qua email) — có cần hỗ trợ import lại để đối chiếu không?

---

**Người viết**: Claude
**Ngày**: 2026-06-14
**Trạng thái**: ⏸️ CHỜ USER REVIEW


