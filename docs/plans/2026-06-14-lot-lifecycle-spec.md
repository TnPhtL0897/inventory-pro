# SPEC #3: Lot Lifecycle Management — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: #1 (P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 3.4, 4.1
> **Phụ thuộc**: Cần SPEC #7 (Open-Vial) + SPEC #8 (Bid Tracking cho recall)

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Quản lý **vòng đời đầy đủ** của mỗi lô sản phẩm từ khi nhập về đến khi xuất hủy, đảm bảo:
- Chỉ những lô **đạt chất lượng** mới được sử dụng cho xét nghiệm
- Theo dõi **hạn sử dụng** chính xác (bao gồm cả open-vial stability)
- Xử lý **recall** từ nhà cung cấp nhanh chóng
- Tuân thủ **ISO 15189:2022** + **QĐ 2429/BYT**

### 1.2. Phạm vi
- **Trong scope**:
  - Quản lý vòng đời lô: `QUARANTINE → PENDING_QC → IN_QC → APPROVED/QC_FAILED → IN_USE → EXPIRED/DEPLETED`
  - Trạng thái phụ: `BLOCKED` (recall), `DESTROYED` (đã hủy)
  - QC workflow cho HC-SP (KTV xét nghiệm duyệt)
  - Auto-EXPIRED khi hết hạn + tạo phiếu xuất hủy
  - Open-vial tracking (ngày mở + hạn sau mở + cảnh báo)
  - Recall tự động BLOCK lô
  - Lot-to-Lot Validation (CLSI EP26-A) — basic (P1 sẽ mở rộng)
- **Ngoài scope**:
  - Lot-to-Lot Validation nâng cao (SPEC riêng, P1)
  - Bid tracking chi tiết (SPEC #8)
  - Quản lý lý do hủy chi tiết (vd: hóa đơn hủy chất thải nguy hại)

### 1.3. Tuân thủ quy định
- **QĐ 2429/BYT** Tiêu chí 7.2: Quản lý hóa chất, sinh phẩm (hạn dùng, điều kiện bảo quản, xử lý khi hết hạn)
- **ISO 15189:2022** Điều 6.5.3: Vật tư tiêu hao (lô, hạn, kiểm soát chất lượng)
- **CLSI EP26-A**: Hướng dẫn Lot-to-Lot Verification
- **TT 54/2017/BYT**: Audit log mọi thao tác

---

## 2. ACTORS (Người dùng)

| Actor | Mô tả | Quyền trong module |
|---|---|---|
| **Thủ kho** (BULK + DAILY) | Quản lý lô vật lý | Tạo lô, xem thông tin, ghi nhận open-vial, xuất hủy |
| **KTV Xét nghiệm (QC_OFFICER)** | Kiểm tra chất lượng lô mới | Duyệt QC, đánh dấu APPROVED/QC_FAILED |
| **Trưởng khoa (DEPT_HEAD)** | Quản lý tổng thể | Xem tất cả lô, duyệt recall, xem báo cáo |
| **Hệ thống (CRON)** | Auto xử lý | Auto EXPIRED, auto BLOCK recall, auto cảnh báo |

### 2.1. Phân quyền theo role
- `KEEPER_BULK_HC_SP` / `KEEPER_DAILY_HC_SP` → tạo + quản lý lô HC-SP
- `KEEPER_BULK_VTYT` / `KEEPER_DAILY_VTYT` → tạo + quản lý lô VTYT
- `QC_OFFICER` (mới) → duyệt QC cho HC-SP
- `DEPT_HEAD` → xem tất cả, duyệt recall, xem báo cáo

---

## 3. WORKFLOW CHI TIẾT

### 3.1. Vòng đời chính

```
[GoodsReceipt] → Tạo lô
    ↓
QUARANTINE (chờ nhập kho, đang kiểm tra sơ bộ)
    ↓
PENDING_QC (đã nhập kho, chờ QC duyệt - chỉ HC-SP)
    ↓
IN_QC (KTV đang kiểm tra)
    ↓
APPROVED ←→ QC_FAILED
    ↓
IN_USE (đang sử dụng cho XN)
    ↓
EXPIRED (hết hạn)  HOẶC  DEPLETED (hết số lượng)
    ↓
DESTROYED (đã xuất hủy)

Bất kỳ lúc nào:
    → BLOCKED (recall) ← có thể từ bất kỳ trạng thái nào
```

### 3.2. Workflow tạo lô (GoodsReceipt)

```
[Nhận hàng từ Khoa Dược / Phòng VTYT]
    ↓
[Thủ kho] Nhập thông tin lô:
  - product_id, lot_number, expiration_date
  - quantity, manufacturer_date
  - storage_condition (vd: 2-8°C, -20°C, nhiệt độ phòng)
  - certificate_of_analysis_url (nếu có)
    ↓
Hệ thống tự động:
  - status = QUARANTINE (HC-SP) hoặc APPROVED (VTYT)
  - Gán warehouse_id (BULK hoặc DAILY)
  - Sinh QR code cho lô (in dán lên sản phẩm)
    ↓
[HC-SP] → status = PENDING_QC, notification cho QC_OFFICER
[VTYT] → status = APPROVED, sẵn sàng sử dụng
```

### 3.3. Workflow QC (chỉ HC-SP)

```
[PENDING_QC] → QC_OFFICER nhận notification
    ↓
QC_OFFICER mở app → /lots/pending-qc
    ↓
QC_OFFICER chọn lô cần kiểm tra → status = IN_QC
    ↓
QC_OFFICER nhập kết quả QC:
  - qc_method (vd: "Visual + pH check", "Chạy control mẫu")
  - qc_result (PASS/FAIL)
  - qc_notes
  - qc_date
  - attachments (file kết quả QC)
    ↓
Kết quả:
  ├─ PASS → status = APPROVED, sẵn sàng sử dụng
  └─ FAIL → status = QC_FAILED, lô bị tách riêng, xử lý theo quy trình hủy
    ↓
Nếu QC_FAILED → thông báo cho thủ kho + Trưởng khoa
```

### 3.4. Workflow Open-Vial (chỉ HC-SP, sau khi APPROVED)

```
[Thủ kho/CTV] Mở nắp lọ hóa chất
    ↓
Scan QR code → app hiển thị thông tin lô
    ↓
Nhấn "Ghi nhận mở nắp"
    ↓
Nhập:
  - opened_at_date (mặc định = hôm nay)
  - opened_quantity (số lượng còn lại sau khi mở, vd: lọ 100ml lấy 5ml → 95ml)
  - opened_by (user_id)
    ↓
Hệ thống tự tính:
  - open_vial_stability_days (từ product config)
  - open_vial_expiration_date = opened_at_date + stability_days
  - on_duty_label_generated (in nhãn dán "Mở ngày X, hết hạn Y")
    ↓
Nếu không có open_vial_stability trong product config → cho phép ghi nhận nhưng cảnh báo "Chưa cấu hình hạn open-vial"
```

### 3.5. Workflow EXPIRED + Hủy

```
[CRON chạy mỗi ngày lúc 00:30 sáng]
    ↓
Quét tất cả lots có expiration_date < CURRENT_DATE + 30 ngày
    ↓
Đối với lots đã hết hạn (expiration_date < CURRENT_DATE):
  - status = EXPIRED
  - Tự tạo DisposalRequest (phiếu đề nghị xuất hủy)
  - Notify thủ kho + Trưởng khoa
    ↓
[Thủ kho] Mở app → /lots/expired
    ↓
Chọn lô cần hủy → nhấn "Tạo phiếu xuất hủy"
    ↓
Hệ thống tạo Disposal document:
  - Tự tạo StockMovement (DISPOSAL_OUT)
  - Trừ tồn kho
  - Lô → status = DESTROYED
  - Log audit
    ↓
[Trưởng khoa] Duyệt phiếu hủy (nếu giá trị lớn)
    ↓
[Thủ kho] Thực hiện hủy vật lý + điền biên bản hủy
```

### 3.6. Workflow Recall

```
[Nhận thông báo recall từ nhà cung cấp]
    ↓
[Trưởng khoa hoặc Admin] Tạo Recall Notice:
  - recall_number (số recall từ NCC)
  - affected_lot_numbers (danh sách số lô)
  - reason (vd: "Nhiễm chéo", "Sai nhãn", "Vấn đề chất lượng")
  - recall_date
  - severity (LOW/MEDIUM/HIGH/CRITICAL)
    ↓
Hệ thống tự động:
  - Tìm tất cả lots có lot_number matching
  - status → BLOCKED (bất kể trạng thái hiện tại)
  - Ghi recall_notice_id vào lots
  - Notify tất cả thủ kho + Trưởng khoa
    ↓
[Thủ kho] Kiểm tra vật lý, tách riêng lô recall
    ↓
Thủ kho nhập kết quả kiểm tra cho từng lô:
  - still_in_stock: true/false
  - already_used: true/false (nếu đã dùng một phần)
  - action: "RETURN_TO_SUPPLIER" | "DESTROY" | "INVESTIGATE"
    ↓
Hệ thống tạo action tương ứng (trả NCC / tạo phiếu hủy / tạo task điều tra)
```

### 3.7. Trạng thái (status) của Lot

- `QUARANTINE` — Vừa nhập, đang kiểm tra sơ bộ
- `PENDING_QC` — Chờ QC duyệt (HC-SP)
- `IN_QC` — QC đang kiểm tra
- `APPROVED` — Đạt chất lượng, sẵn sàng sử dụng
- `IN_USE` — Đang được sử dụng (mở nắp, đã xuất một phần)
- `DEPLETED` — Hết số lượng (còn hạn nhưng không còn hàng)
- `EXPIRED` — Hết hạn sử dụng
- `DESTROYED` — Đã xuất hủy
- `QC_FAILED` — QC không đạt
- `BLOCKED` — Bị recall / vấn đề chất lượng

---

## 4. LOGIC TÍNH TOÁN

### 4.1. Tính cảnh báo hạn (đã chốt: auto EXPIRED + tạo phiếu xuất hủy)

**Cron job hàng ngày** (chạy lúc 00:30 sáng):

```sql
-- Bước 1: Cập nhật status = EXPIRED cho lô đã hết hạn
UPDATE lots
SET status = 'EXPIRED', updated_at = now()
WHERE status IN ('APPROVED', 'IN_USE', 'PENDING_QC', 'IN_QC')
  AND expiration_date < CURRENT_DATE;

-- Bước 2: Tạo DisposalRequest cho lô EXPIRED (nếu còn tồn kho)
INSERT INTO disposal_requests (lot_id, reason, status, created_at)
SELECT id, 'Hết hạn sử dụng', 'PENDING', now()
FROM lots
WHERE status = 'EXPIRED'
  AND id NOT IN (SELECT lot_id FROM disposal_requests WHERE lot_id IS NOT NULL);
```

**Cảnh báo trước** (30/15/7 ngày):
- 30 ngày trước hạn: gửi email + in-app notification
- 15 ngày: reminder + flag "SẮP HẾT HẠN" trên dashboard
- 7 ngày: cảnh báo đỏ + ưu tiên sử dụng (FEFO auto-pick lô này)
- 0 ngày (hôm nay): auto EXPIRED

### 4.2. Tính open-vial expiration (đã chốt: đầy đủ ngày mở + hạn sau mở)

```
open_vial_expiration_date = opened_at_date + product.open_vial_stability_days

# Nếu open_vial_stability_days = NULL → cảnh báo "Chưa cấu hình"
# Cảnh báo trước open_vial expiration: 7 ngày / 3 ngày / 1 ngày
```

**Quy tắc FEFO mở rộng** (sẽ chi tiết ở SPEC #6 — FEFO Enforcement):
- Nếu có lô đã mở nắp → ưu tiên dùng lô đó trước
- Sau khi dùng hết lô mở → chuyển sang lô chưa mở theo FEFO hạn gốc

### 4.3. Auto BLOCK khi recall

```
# Khi tạo RecallNotice với affected_lot_numbers
FOR EACH lot_number IN affected_lot_numbers:
  UPDATE lots
  SET status = 'BLOCKED',
      recall_notice_id = <recall_id>,
      updated_at = now()
  WHERE lot_number = lot_number
    AND status NOT IN ('DESTROYED', 'EXPIRED');  -- không block lô đã hủy/hết hạn
```

### 4.4. Cảnh báo sắp hết tồn kho

**Trigger** (sau khi StockMovement OUT):
- Nếu tổng tồn kho (BULK + DAILY) < `min_stock` → flag "SẮP HẾT", notify thủ kho

### 4.5. Edge cases

| Trường hợp | Xử lý |
|---|---|
| Lô mới nhập trùng `lot_number` với lô cũ | Cảnh báo "Lô đã tồn tại", cho phép tạo nếu từ lô NCC khác hoặc từ chối |
| Lô có `expiration_date` đã qua khi nhập | Từ chối nhập (validation fail) — yêu cầu NCC trả lại/đổi |
| Lô `QC_FAILED` mà đã sử dụng một phần | Khóa, không cho xuất tiếp + tạo task điều tra |
| Open-vial không có `open_vial_stability_days` trong product config | Cho phép ghi nhận nhưng flag "CHUA_CONFIG_OPEN_VIAL" |
| Lô recall nhưng đã sử dụng một phần (IN_USE) | Tự động tạo Investigation Task + notify Trưởng khoa |
| `expiration_date` = ngày hiện tại | Hết hạn từ 00:00 sáng → EXPIRED ngay trong cron đầu tiên của ngày |
| Nhiều recall cùng lúc cho 1 lô | Lấy recall mới nhất, nhưng giữ lịch sử |
| Hủy lô đã DEPLETED (hết số lượng) | Validation: không cần hủy, tự động DESTROYED |

---

---

## 5. SCHEMA CHI TIẾT

### 5.1. Migration: `20260614_lot_lifecycle.sql`

```sql
-- ============================================================
-- MODULE #1: LOT LIFECYCLE MANAGEMENT
-- File: supabase/migrations/20260614_lot_lifecycle.sql
-- ============================================================

-- 5.1.1. ENUM cho lot status
CREATE TYPE lot_status AS ENUM (
  'QUARANTINE',
  'PENDING_QC',
  'IN_QC',
  'APPROVED',
  'IN_USE',
  'DEPLETED',
  'EXPIRED',
  'DESTROYED',
  'QC_FAILED',
  'BLOCKED'
);

-- 5.1.2. ENUM cho storage condition
CREATE TYPE lot_storage_condition AS ENUM (
  'ROOM_TEMP',         -- Nhiệt độ phòng (15-30°C)
  'REFRIGERATED',      -- 2-8°C
  'FROZEN',            -- -20°C hoặc thấp hơn
  'PROTECTED_FROM_LIGHT', -- Tránh ánh sáng
  'DRY_PLACE'          -- Nơi khô ráo
);

-- 5.1.3. ENUM cho QC result
CREATE TYPE lot_qc_result AS ENUM (
  'PASS',
  'FAIL',
  'PENDING'
);

-- 5.1.4. ENUM cho recall severity
CREATE TYPE recall_severity AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

-- 5.1.5. ENUM cho recall action
CREATE TYPE recall_action AS ENUM (
  'RETURN_TO_SUPPLIER',
  'DESTROY',
  'INVESTIGATE'
);

-- 5.1.6. ENUM cho disposal status
CREATE TYPE disposal_status AS ENUM (
  'PENDING',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

-- 5.1.7. Bảng lots (mở rộng từ bảng hiện có)
-- Lưu ý: bảng lots có thể đã tồn tại, thêm các cột mới nếu chưa có
ALTER TABLE lots ADD COLUMN IF NOT EXISTS status lot_status NOT NULL DEFAULT 'QUARANTINE';
ALTER TABLE lots ADD COLUMN IF NOT EXISTS storage_condition lot_storage_condition;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS manufacturer_date DATE;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS certificate_of_analysis_url TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS qc_required BOOLEAN DEFAULT TRUE;  -- HC-SP: TRUE, VTYT: FALSE
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_opened_at TIMESTAMPTZ;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_quantity_remaining DECIMAL(15, 3);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_expiration_date DATE;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_stability_days INT;  -- từ product config
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_opened_by UUID REFERENCES auth.users(id);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS recall_notice_id UUID;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS recall_blocked_at TIMESTAMPTZ;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS last_inventory_check_at TIMESTAMPTZ;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE lots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_expiration ON lots(expiration_date) WHERE status NOT IN ('DESTROYED', 'EXPIRED');
CREATE INDEX IF NOT EXISTS idx_lots_recall ON lots(recall_notice_id) WHERE recall_notice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lots_open_vial ON lots(open_vial_expiration_date) WHERE open_vial_expiration_date IS NOT NULL;

-- 5.1.8. Bảng lot_qc_records (lịch sử QC)
CREATE TABLE lot_qc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  qc_method TEXT,                    -- "Visual + pH", "Chạy control", "Đo OD", ...
  qc_result lot_qc_result NOT NULL,
  qc_notes TEXT,
  qc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qc_started_at TIMESTAMPTZ,
  qc_completed_at TIMESTAMPTZ,
  qc_officer_id UUID NOT NULL REFERENCES auth.users(id),

  -- Attachments (kết quả QC scan/file)
  attachments JSONB DEFAULT '[]'::jsonb,
  -- Format: [{file_name, file_url, file_size, mime_type}]

  -- Reference đến control/calibrator đã dùng (nếu có)
  control_lot_id UUID REFERENCES lots(id),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lot_qc_lot ON lot_qc_records(lot_id);
CREATE INDEX idx_lot_qc_officer ON lot_qc_records(qc_officer_id);

-- 5.1.9. Bảng open_vial_history (lịch sử mở nắp - 1 lô có thể mở nhiều lần)
CREATE TABLE open_vial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  quantity_before DECIMAL(15, 3) NOT NULL,
  quantity_after DECIMAL(15, 3) NOT NULL,    -- Lượng còn lại sau khi mở/lấy
  quantity_taken DECIMAL(15, 3),              -- Lượng lấy ra
  open_vial_expiration_date DATE,             -- Tính từ product config
  label_printed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ovh_lot ON open_vial_history(lot_id);
CREATE INDEX idx_ovh_opened_at ON open_vial_history(opened_at DESC);

-- 5.1.10. Bảng recall_notices
CREATE TABLE recall_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  recall_number TEXT NOT NULL,                -- Số recall từ NCC
  supplier_name TEXT NOT NULL,
  product_names TEXT[],                      -- Tên SP bị ảnh hưởng (thông tin từ NCC)

  reason TEXT NOT NULL,
  severity recall_severity NOT NULL,
  recall_date DATE NOT NULL,
  action_taken_by_supplier TEXT,              -- Hành động NCC đã làm (vd: "Ngừng sản xuất")

  -- Trạng thái
  status TEXT DEFAULT 'ACTIVE',               -- ACTIVE | RESOLVED | CLOSED
  resolved_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recall_tenant ON recall_notices(tenant_id);
CREATE INDEX idx_recall_status ON recall_notices(tenant_id, status);

-- Foreign key từ lots.recall_notice_id → recall_notices.id
ALTER TABLE lots ADD CONSTRAINT fk_lots_recall
  FOREIGN KEY (recall_notice_id) REFERENCES recall_notices(id) ON DELETE SET NULL;

-- 5.1.11. Bảng recall_lot_actions (hành động xử lý cho từng lô bị recall)
CREATE TABLE recall_lot_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_notice_id UUID NOT NULL REFERENCES recall_notices(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  -- Trạng thái kiểm tra vật lý
  still_in_stock BOOLEAN,
  already_used BOOLEAN,
  usage_notes TEXT,

  -- Hành động quyết định
  action recall_action NOT NULL,
  action_notes TEXT,

  -- Reference đến documents phát sinh
  disposal_request_id UUID,
  return_document_id UUID,
  investigation_task_id UUID,

  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rla_recall ON recall_lot_actions(recall_notice_id);
CREATE INDEX idx_rla_lot ON recall_lot_actions(lot_id);

-- 5.1.12. Bảng disposal_requests (phiếu đề nghị xuất hủy)
CREATE TABLE disposal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  request_number TEXT NOT NULL,              -- Số phiếu (auto-gen)
  reason TEXT NOT NULL,                      -- "Hết hạn", "QC_FAILED", "Recall", "Hỏng vật lý"

  -- Trạng thái
  status disposal_status NOT NULL DEFAULT 'PENDING',

  -- Thông tin hủy
  total_estimated_value DECIMAL(15, 2),
  requires_dept_head_approval BOOLEAN DEFAULT FALSE,

  -- Auto-generated hay manual
  auto_generated BOOLEAN DEFAULT FALSE,      -- TRUE nếu do cron tạo

  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),

  -- Biên bản hủy
  disposal_act_number TEXT,                  -- Số biên bản hủy
  disposal_act_url TEXT,                     -- File scan biên bản
  disposal_date DATE,
  disposal_method TEXT,                      -- "Đốt", "Chôn", "Trả NCC", ...

  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dr_tenant ON disposal_requests(tenant_id);
CREATE INDEX idx_dr_status ON disposal_requests(tenant_id, status);

-- 5.1.13. Bảng disposal_request_lines (chi tiết từng lô trong phiếu hủy)
CREATE TABLE disposal_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disposal_request_id UUID NOT NULL REFERENCES disposal_requests(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  quantity DECIMAL(15, 3) NOT NULL,
  unit_price DECIMAL(15, 2),
  estimated_value DECIMAL(15, 2),
  expiration_date DATE,                      -- Hạn dùng lúc hủy
  reason TEXT,                               -- Lý do hủy cụ thể cho lô này

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_drl_request ON disposal_request_lines(disposal_request_id);
CREATE INDEX idx_drl_lot ON disposal_request_lines(lot_id);

-- 5.1.14. Bảng lot_alerts (cảnh báo - có thể tích hợp với bảng alerts hiện có)
CREATE TABLE lot_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL,                  -- 'EXPIRING_SOON' | 'OPEN_VIAL_EXPIRING' | 'OUT_OF_STOCK' | 'RECALL'
  alert_level TEXT NOT NULL,                 -- 'INFO' | 'WARNING' | 'CRITICAL'
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,

  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_la_tenant ON lot_alerts(tenant_id, resolved);
CREATE INDEX idx_la_lot ON lot_alerts(lot_id);

-- 5.1.15. RLS Policies
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_qc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_vial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_lot_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposal_request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_alerts ENABLE ROW LEVEL SECURITY;

-- Lots: Thủ kho thấy lô trong kho mình
CREATE POLICY "rls_lots_tenant" ON lots
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "rls_lots_keeper_hc" ON lots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = lots.product_id
        AND p.product_group = 'HOA_CHAT_SINH_PHAM'
    )
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_HC_SP', 'KEEPER_DAILY_HC_SP', 'QC_OFFICER')
  );

CREATE POLICY "rls_lots_keeper_vtyt" ON lots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = lots.product_id
        AND p.product_group = 'VAT_TU_Y_TE'
    )
    AND (auth.jwt() ->> 'role') IN ('KEEPER_BULK_VTYT', 'KEEPER_DAILY_VTYT')
  );

-- QC Records: QC_OFFICER + DEPT_HEAD xem
CREATE POLICY "rls_qc_officer" ON lot_qc_records
  FOR ALL USING ((auth.jwt() ->> 'role') IN ('QC_OFFICER', 'DEPT_HEAD'));

CREATE POLICY "rls_qc_keeper_read" ON lot_qc_records
  FOR SELECT USING (true);  -- keeper chỉ xem, không sửa

-- Disposal: KEEPER tạo, DEPT_HEAD duyệt
CREATE POLICY "rls_dr_keeper" ON disposal_requests
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') LIKE 'KEEPER_%');

CREATE POLICY "rls_dr_dept_head" ON disposal_requests
  FOR UPDATE USING ((auth.jwt() ->> 'role') = 'DEPT_HEAD');

-- Recall: Chỉ DEPT_HEAD + ADMIN tạo
CREATE POLICY "rls_recall_create" ON recall_notices
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') IN ('DEPT_HEAD', 'ADMIN'));

-- 5.1.16. View tiện truy vấn
CREATE OR REPLACE VIEW v_lot_summary AS
SELECT
  l.id AS lot_id,
  l.tenant_id,
  l.lot_number,
  l.expiration_date,
  l.status,
  l.storage_condition,
  l.open_vial_opened_at,
  l.open_vial_expiration_date,
  p.id AS product_id,
  p.code AS product_code,
  p.name AS product_name,
  p.product_group,
  p.unit,
  w.id AS warehouse_id,
  w.role AS warehouse_role,

  -- Tính cảnh báo
  CASE
    WHEN l.expiration_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN l.expiration_date < CURRENT_DATE + INTERVAL '7 days' THEN 'CRITICAL'
    WHEN l.expiration_date < CURRENT_DATE + INTERVAL '15 days' THEN 'WARNING'
    WHEN l.expiration_date < CURRENT_DATE + INTERVAL '30 days' THEN 'INFO'
    ELSE 'OK'
  END AS expiration_alert_level,

  CASE
    WHEN l.open_vial_expiration_date IS NOT NULL
     AND l.open_vial_expiration_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN l.open_vial_expiration_date IS NOT NULL
     AND l.open_vial_expiration_date < CURRENT_DATE + INTERVAL '7 days' THEN 'CRITICAL'
    WHEN l.open_vial_expiration_date IS NOT NULL
     AND l.open_vial_expiration_date < CURRENT_DATE + INTERVAL '15 days' THEN 'WARNING'
    ELSE 'OK'
  END AS open_vial_alert_level,

  l.recall_notice_id IS NOT NULL AS is_recalled

FROM lots l
JOIN products p ON p.id = l.product_id
LEFT JOIN warehouses w ON w.id = l.warehouse_id;

-- 5.1.17. Function cảnh báo sắp hết hạn (gọi bởi cron)
CREATE OR REPLACE FUNCTION fn_check_lot_expirations()
RETURNS TABLE(
  lot_id UUID,
  alert_type TEXT,
  alert_level TEXT,
  message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lot RECORD;
BEGIN
  -- Tìm lô sắp hết hạn
  FOR v_lot IN
    SELECT l.id, l.lot_number, l.expiration_date, p.name AS product_name, p.product_group
    FROM lots l
    JOIN products p ON p.id = l.product_id
    WHERE l.status IN ('APPROVED', 'IN_USE', 'PENDING_QC', 'IN_QC')
      AND l.expiration_date < CURRENT_DATE + INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM lot_alerts la
        WHERE la.lot_id = l.id
          AND la.alert_type = 'EXPIRING_SOON'
          AND la.resolved = FALSE
      )
  LOOP
    IF v_lot.expiration_date < CURRENT_DATE THEN
      RETURN QUERY SELECT v_lot.id, 'EXPIRED', 'CRITICAL',
        format('%s (lô %s) đã hết hạn ngày %s', v_lot.product_name, v_lot.lot_number, v_lot.expiration_date);
    ELSIF v_lot.expiration_date < CURRENT_DATE + INTERVAL '7 days' THEN
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON', 'CRITICAL',
        format('%s (lô %s) sắp hết hạn trong %s ngày', v_lot.product_name, v_lot.lot_number, v_lot.expiration_date - CURRENT_DATE);
    ELSIF v_lot.expiration_date < CURRENT_DATE + INTERVAL '15 days' THEN
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON', 'WARNING',
        format('%s (lô %s) sắp hết hạn trong %s ngày', v_lot.product_name, v_lot.lot_number, v_lot.expiration_date - CURRENT_DATE);
    ELSE
      RETURN QUERY SELECT v_lot.id, 'EXPIRING_SOON', 'INFO',
        format('%s (lô %s) sẽ hết hạn trong %s ngày', v_lot.product_name, v_lot.lot_number, v_lot.expiration_date - CURRENT_DATE);
    END IF;
  END LOOP;
END;
$$;

-- 5.1.18. Function auto EXPIRED + tạo DisposalRequest
CREATE OR REPLACE FUNCTION fn_auto_expire_lots()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_disposal_id UUID;
  v_lot RECORD;
BEGIN
  -- Cập nhật status = EXPIRED
  UPDATE lots
  SET status = 'EXPIRED', updated_at = now()
  WHERE status IN ('APPROVED', 'IN_USE', 'PENDING_QC', 'IN_QC', 'QUARANTINE')
    AND expiration_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Tạo DisposalRequest cho mỗi lô EXPIRED còn tồn kho
  FOR v_lot IN
    SELECT l.id, l.tenant_id, l.product_id, l.quantity
    FROM lots l
    WHERE l.status = 'EXPIRED'
      AND l.quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM disposal_request_lines drl
        JOIN disposal_requests dr ON dr.id = drl.disposal_request_id
        WHERE drl.lot_id = l.id AND dr.status != 'CANCELLED'
      )
  LOOP
    -- Tạo DisposalRequest
    INSERT INTO disposal_requests (
      tenant_id, request_number, reason, status,
      auto_generated, total_estimated_value, requires_dept_head_approval
    ) VALUES (
      v_lot.tenant_id,
      'DR-AUTO-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || substring(v_lot.id::text, 1, 8),
      'Hết hạn sử dụng',
      'PENDING',
      TRUE,
      COALESCE(v_lot.quantity * (SELECT unit_price FROM products WHERE id = v_lot.product_id), 0),
      (COALESCE(v_lot.quantity * (SELECT unit_price FROM products WHERE id = v_lot.product_id), 0)) > 5000000
    )
    RETURNING id INTO v_disposal_id;

    -- Tạo line
    INSERT INTO disposal_request_lines (
      disposal_request_id, lot_id, product_id, quantity, expiration_date, reason
    ) VALUES (
      v_disposal_id, v_lot.id, v_lot.product_id, v_lot.quantity, CURRENT_DATE - 1, 'Hết hạn sử dụng'
    );
  END LOOP;

  RETURN v_count;
END;
$$;

-- 5.1.19. Function auto BLOCK lô khi recall
CREATE OR REPLACE FUNCTION fn_apply_recall_to_lots(p_recall_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_recall RECORD;
BEGIN
  SELECT * INTO v_recall FROM recall_notices WHERE id = p_recall_id;

  UPDATE lots
  SET status = 'BLOCKED',
      recall_notice_id = p_recall_id,
      recall_blocked_at = now(),
      updated_at = now()
  WHERE lot_number = ANY(v_recall.affected_lot_numbers)  -- (giả định có cột affected_lot_numbers ở recall_notices - thực tế cần bảng riêng)
    AND status NOT IN ('DESTROYED', 'EXPIRED');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5.1.20. Cron schedule
-- EXPIRED + DisposalRequest: 00:30 sáng hàng ngày
-- Cảnh báo: 06:00 sáng hàng ngày

COMMENT ON TABLE lots IS 'Quản lý lô - vòng đời từ QUARANTINE đến DESTROYED';
COMMENT ON TABLE lot_qc_records IS 'Lịch sử QC cho từng lô HC-SP';
COMMENT ON TABLE open_vial_history IS 'Lịch sử mở nắp (1 lô có thể mở nhiều lần)';
COMMENT ON TABLE recall_notices IS 'Thông báo recall từ nhà cung cấp';
COMMENT ON TABLE disposal_requests IS 'Phiếu đề nghị xuất hủy (auto-gen khi hết hạn hoặc manual)';
```

---

---

## 6. API HOOKS

```typescript
// src/lib/hooks/useLots.ts

// QUERIES
export function useLots(params: {
  productGroup?: 'HOA_CHAT_SINH_PHAM' | 'VAT_TU_Y_TE';
  status?: LotStatus;
  warehouseRole?: WarehouseRole;
  expiringWithin?: number; // days
  search?: string;
  limit?: number;
}) { /* ... */ }

export function useLot(id: string) { /* ... */ }
export function usePendingQCLots() { /* QC view: lô chờ QC duyệt */ }
export function useExpiringLots(days: number) { /* Dashboard cảnh báo */ }
export function useRecalledLots() { /* Lô bị recall */ }
export function useOpenVialLots() { /* Lô đang mở nắp */ }

// MUTATIONS
export function useCreateLot() { /* Tạo lô từ GoodsReceipt */ }
export function useStartQC() { /* QC_OFFICER: PENDING_QC → IN_QC */ }
export function useCompleteQC() { /* QC_OFFICER: IN_QC → APPROVED/QC_FAILED */ }
export function useRecordOpenVial() { /* Ghi nhận mở nắp */ }
export function useCreateRecallNotice() { /* DEPT_HEAD: tạo recall */ }
export function useProcessRecallLot() { /* Ghi nhận xử lý lô recall */ }
export function useCreateDisposalRequest() { /* Tạo phiếu hủy */ }
export function useApproveDisposalRequest() { /* DEPT_HEAD duyệt */ }
export function useCompleteDisposal() { /* Thực hiện hủy xong */ }

// EDGE FUNCTIONS
// fn_check_lot_expirations: chạy hàng ngày (cron)
// fn_auto_expire_lots: chạy 00:30 sáng (cron)
// fn_apply_recall_to_lots: trigger khi tạo recall
```

---

## 7. UI WIREFRAMES

### 7.1. Dashboard cảnh báo `/lots`

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: UserMenu | Logo | PillNav                              │
├──────────────────────────────────────────────────────────────────┤
│  📦 Quản lý lô                                                    │
│  [HC-SP] [VTYT] [Tất cả]                                        │
│                                                                  │
│  ┌─── ⚠️ Cảnh báo hạn (12) ───────────────────────────────┐    │
│  │ 🔴 7 ngày: Glucose L123 (10/06/2026)                     │    │
│  │ 🔴 7 ngày: HBsAg L456 (11/06/2026)                      │    │
│  │ 🟡 15 ngày: Urea L789 (20/06/2026)                      │    │
│  │ 🟢 30 ngày: Creatinine L012 (01/07/2026)                 │    │
│  │                                                          │    │
│  │ ⚠️ Open-vial sắp hết hạn (3)                            │    │
│  │ 🔴 2 ngày: Glucose L100 (mở 10/05, ổn định 28 ngày)    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── 🔴 Recall (2) ────────────────────────────────────────┐    │
│  │ REC-2026-005: Hãng Roche, lô GL-2024-001-005            │    │
│  │ Lý do: Nhiễm chéo, 5 lô bị ảnh hưởng                    │    │
│  │ Severity: HIGH  |  Ngày recall: 13/06/2026               │    │
│  │                                          [Xem chi tiết →] │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─── Bảng lô ─────────────────────────────────────────────┐    │
│  │ Bộ lọc: [Tất cả] [APPROVED] [IN_USE] [PENDING_QC] [BLOCKED]│   │
│  │ Tìm: [________]                                          │    │
│  │                                                          │    │
│  │ Mã lô │ SP     │ Kho   │ Tồn │ HSD      │ Trạng thái │ QC│    │
│  │───────┼────────┼───────┼─────┼──────────┼────────────┼───│    │
│  │ L123  │Glucose │ BULK  │ 50  │ 17/06 ⚠️ │ APPROVED  │ ✓ │    │
│  │ L100  │Glucose │ DAILY │ 5   │ 12/06 🔴 │ IN_USE    │ ✓ │    │
│  │       │        │       │     │(open-vial│           │   │    │
│  │       │        │       │     │ 16/06)   │           │   │    │
│  │───────┼────────┼───────┼─────┼──────────┼────────────┼───│    │
│  │ L456  │HBsAg   │ BULK  │ 0🔴 │ 11/06 🔴 │ BLOCKED   │ ✓ │    │
│  │       │        │       │     │          │ (Recall)   │   │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2. Trang QC `/lots/pending-qc`

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Lô chờ QC duyệt (HC-SP)                                     │
│  [Tất cả] [IN_QC] [PENDING_QC] [QC_FAILED]                       │
│                                                                  │
│  ┌─── Lô PENDING_QC ────────────────────────────────────────┐   │
│  │ Mã lô: L456  |  SP: HBsAg Test                            │   │
│  │ Kho: BULK_HC_SP  |  Tồn: 30 test  |  HSD: 11/06/2026     │   │
│  │ Nhập: 14/06/2026 bởi Khoa Dược                            │   │
│  │ CoA: [📄 certificate.pdf]                                 │   │
│  │                                            [Bắt đầu QC →]│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─── Lô IN_QC (đang kiểm tra) ────────────────────────────┐   │
│  │ Mã lô: L789  |  SP: Glucose                              │   │
│  │ QC Officer: Nguyễn Thị B  |  Bắt đầu: 14/06 09:30       │   │
│  │                                            [Hoàn tất QC →]│  │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3. Modal hoàn tất QC

```
┌─────────────────────────────────────────────────┐
│  ✅ Hoàn tất kiểm tra QC                        │
│  ─────────────────────────────────────────────  │
│  Lô: L789 - Glucose (HC-SP)                      │
│  Kho: BULK_HC_SP | Tồn: 50                       │
│  HSD: 20/06/2026                                  │
│                                                  │
│  Phương pháp QC:                                 │
│  [Visual + pH check (2-level control)_______]   │
│                                                  │
│  Kết quả: ● PASS  ○ FAIL                         │
│                                                  │
│  Control lot sử dụng: [L-CONTROL-001 (▼)]       │
│                                                  │
│  Ghi chú:                                        │
│  [Kết quả trong tầm kiểm soát, không bất______] │
│  [thường._____________________________________]  │
│                                                  │
│  File đính kèm (optional):                       │
│  [📎 Upload kết quả QC PDF/ảnh]                  │
│                                                  │
│              [Hủy]  [💾 Hoàn tất]               │
└─────────────────────────────────────────────────┘
```

### 7.4. Modal ghi nhận mở nắp (Open-Vial)

```
┌─────────────────────────────────────────────────┐
│  🧪 Ghi nhận mở nắp lô                          │
│  ─────────────────────────────────────────────  │
│  Lô: L100 - Glucose (HC-SP)                      │
│  Kho: DAILY_HC_SP | Tồn: 100ml                   │
│  HSD gốc: 12/06/2026                              │
│  Open-vial stability: 28 ngày (từ product config)│
│                                                  │
│  Ngày mở: 14/06/2026 (mặc định hôm nay)         │
│  Open-vial expiration: 12/07/2026 (auto)         │
│                                                  │
│  Lượng lấy ra: [___5___] ml                      │
│  Lượng còn lại: [__95___] ml (auto)              │
│                                                  │
│  ⓘ Sau khi lưu:                                  │
│  - In nhãn dán "Mở 14/06, Hết hạn 12/07"        │
│  - FEFO sẽ ưu tiên dùng lô này trước            │
│                                                  │
│              [Hủy]  [🖨️ Lưu & In nhãn]          │
└─────────────────────────────────────────────────┘
```

---

## 8. EDGE CASES & XỬ LÝ LỖI

| Tình huống | Xử lý |
|---|---|
| 2 QC_OFFICER cùng complete QC cho 1 lô | Optimistic lock + check status = IN_QC mới cho phép |
| Open-vial lần 2 cho cùng lô | Append vào `open_vial_history`, không overwrite; lấy mở nắp đầu tiên làm gốc |
| Recall lô đã DESTROYED | Bỏ qua, ghi log |
| Auto EXPIRED chạy 2 lần (idempotency) | Check status trước khi update |
| Tạo Disposal cho lô recall + đã sử dụng một phần | Cho phép, action = "INVESTIGATE" tự động |
| Lô nhập trùng `lot_number` trong cùng tenant | Cảnh báo, cho phép nếu user xác nhận (vd: cùng NCC, 2 lần nhập) |
| QC_FAIL nhưng đã dùng một phần trước đó | Khóa, không cho xuất tiếp, tạo investigation task |
| Cron chạy chậm (chậm 1-2 phút) | Acceptable; check `expiration_date < CURRENT_DATE` (không phụ thuộc giờ) |
| Storage condition không khớp với product yêu cầu | Cảnh báo vàng, không block (cho linh hoạt) |
| Nhập lô có `expiration_date` < `manufacture_date` | Validation fail |

---

## 9. ACCEPTANCE CRITERIA

### 9.1. Functional
- [ ] **AC-1**: HC-SP tạo lô → status = PENDING_QC; VTYT tạo lô → status = APPROVED
- [ ] **AC-2**: QC_OFFICER complete QC PASS → status = APPROVED; FAIL → QC_FAILED
- [ ] **AC-3**: Open-vial ghi nhận ngày mở + tính open_vial_expiration từ product config
- [ ] **AC-4**: Cron 00:30 sáng auto EXPIRED lô hết hạn + tạo DisposalRequest
- [ ] **AC-5**: Cảnh báo 30/15/7 ngày trước hạn (CRITICAL/WARNING/INFO)
- [ ] **AC-6**: Tạo Recall → tự động BLOCK tất cả lots matching
- [ ] **AC-7**: Cảnh báo open-vial 7/3/1 ngày trước hết hạn open-vial
- [ ] **AC-8**: DisposalRequest flow: PENDING → APPROVED → COMPLETED
- [ ] **AC-9**: RLS: thủ kho VTYT không thấy lô HC-SP
- [ ] **AC-10**: QR code in cho mỗi lô
- [ ] **AC-11**: Audit log đầy đủ cho TT54

### 9.2. Non-functional
- [ ] **AC-12**: Cron EXPIRED chạy trong < 10 giây (1000 lô)
- [ ] **AC-13**: Mobile responsive
- [ ] **AC-14**: QR code scan nhanh < 1 giây

### 9.3. Test cases
| # | Test case | Expected |
|---|---|---|
| TC-1 | Tạo lô HC-SP mới | status = PENDING_QC, notification QC_OFFICER |
| TC-2 | Tạo lô VTYT mới | status = APPROVED (bỏ qua QC) |
| TC-3 | QC_OFFICER complete QC PASS | status = APPROVED |
| TC-4 | QC_OFFICER complete QC FAIL | status = QC_FAILED, notification thủ kho + TK khoa |
| TC-5 | Ghi nhận open-vial | Tính đúng open_vial_expiration, log history |
| TC-6 | Cron EXPIRED chạy với lô hết hạn | status = EXPIRED, tạo DisposalRequest |
| TC-7 | Tạo recall cho 5 lô | Tất cả matching → BLOCKED |
| TC-8 | Lô recall đã dùng một phần | Tạo investigation task |
| TC-9 | Thủ kho VTYT cố truy cập lô HC-SP | 403 |
| TC-10 | Tạo 2 DisposalRequest cho cùng lô | Validation fail (UNIQUE) |
| TC-11 | Lô có `expiration_date` < hôm nay khi nhập | Validation fail |
| TC-12 | Open-vial không có config stability | Flag "CHUA_CONFIG", vẫn cho ghi nhận |

---

## PHỤ LỤC

### A. Effort estimate
- Schema + function + trigger: 1.5 tuần
- Edge Function (cron): 0.5 tuần
- API hooks: 0.5 tuần
- UI (dashboard + 4 modal): 1.5 tuần
- QR code: 0.5 tuần (in tích hợp với máy in nhãn)
- **Tổng: 4.5 tuần**

### B. Phụ thuộc
- Cần modules N1, N2, N3
- Cần module Open-Vial (SPEC #7) - sẽ gộp vào module này
- Cần cấu hình `open_vial_stability_days` cho từng sản phẩm HC-SP

### C. Câu hỏi mở
- QR code format: chỉ lot_id hay thêm cả thông tin khác (expiration, quantity)?
- Biên bản hủy chất thải nguy hại (HC-SP hết hạn) — cần kết nối với hệ thống nào không?
- Lot-to-Lot Validation (CLSI EP26-A) có cần gộp vào SPEC này hay tách riêng P1?
- Open-vial: cho phép "đóng nắp lại" (vd: nghỉ giữa chừng) — có cần không?

---

**Người viết**: Claude
**Ngày**: 2026-06-14
**Trạng thái**: ⏸️ CHỜ USER REVIEW


