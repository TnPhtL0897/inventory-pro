# SPEC #7: Open-Vial Tracking — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: #4 (P0)
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 3.4
> **Phụ thuộc**: SPEC #3 (Lot Lifecycle) + SPEC #5 (Permission)

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
Quản lý chi tiết **vòng đời open-vial** cho Hóa chất - Sinh phẩm (HC-SP):
- Ghi nhận **ngày mở nắp** + **hạn sau mở** (open-vial stability)
- Tự động in nhãn sau mở nắp
- **Bắt buộc QC lại** khi dùng lô open-vial sau ngày kết thúc ổn định (đã chốt: nghiêm ngặt)
- Cảnh báo trước khi hết hạn open-vial
- Theo dõi lượng còn lại trong lọ (volume tracking)

### 1.2. Phạm vi
- **Trong scope**:
  - Workflow mở nắp (ghi nhận + in nhãn)
  - Tính open_vial_expiration từ product config (open_vial_stability_days)
  - Bắt buộc QC lại khi dùng quá hạn open-vial (ghi nhận kết quả QC)
  - Volume tracking (lượng còn lại trong lọ)
  - Cảnh báo 7/3/1 ngày trước hết hạn open-vial
- **Ngoài scope**:
  - Open-vial stability từng sản phẩm (cần config trong Product — đã có ở SPEC #5)
  - Tự động ghi nhận mở nắp khi xuất (cần cân nhắc trong tương lai)

### 1.3. Tuân thủ
- **ISO 15189:2022** Điều 6.5.3: Kiểm soát vật tư sau mở
- **QĐ 2429/BYT** Tiêu chí 7.2: Quản lý HC-SP sau mở
- **Hướng dẫn nhà sản xuất**: Mỗi sản phẩm có open-vial stability khác nhau (28 ngày, 14 ngày, 7 ngày...)

---

## 2. ACTORS

| Actor | Quyền |
|---|---|
| **Thủ kho** (DAILY HC-SP) | Mở nắp, ghi nhận, in nhãn, cập nhật volume |
| **KTV xét nghiệm (QC_OFFICER)** | QC lại khi dùng quá hạn open-vial |
| **Trưởng khoa (DEPT_HEAD)** | Xem báo cáo, duyệt ngoại lệ |

---

## 3. WORKFLOW

### 3.1. Workflow mở nắp (mỗi lần mở)

```
[Thủ kho / KTV] Scan QR code lô → app hiển thị thông tin
        ↓
Nhấn "🧪 Ghi nhận mở nắp"
        ↓
Nhập thông tin:
  - Ngày mở (mặc định = hôm nay)
  - Lượng lấy ra (volume_taken)
  - Lượng còn lại (volume_remaining = mặc định = old_remaining - taken)
  - Người mở
        ↓
[Hệ thống] Tính:
  - open_vial_expiration_date = opened_at + product.open_vial_stability_days
  - Cập nhật lots: open_vial_opened_at, open_vial_expiration_date, open_vial_quantity_remaining
  - Ghi vào open_vial_history
        ↓
[Hệ thống] Tự động in nhãn (đã chốt: tự động):
  ┌──────────────────────────────────┐
  │ MỞ NẮP: 14/06/2026              │
  │ HẾT HẠN OPEN-VIAL: 12/07/2026   │
  │ Sản phẩm: Glucose (HO-001)      │
  │ Lô: L001                         │
  │ Kho: DAILY_HC_SP                 │
  │ Người mở: Nguyễn Văn A          │
  └──────────────────────────────────┘
        ↓
[Thủ kho] Dán nhãn lên lọ, lưu lại
        ↓
Status → IN_USE (chuyển từ APPROVED)
```

### 3.2. Workflow QC lại khi dùng quá hạn open-vial (đã chốt: bắt buộc)

```
[Kho lẻ] Cần dùng lô Glucose L001 cho XN
        ↓
FEFO pick lô L001 (đang mở, open-vial exp = 12/07/2026)
        ↓
Ngày hiện tại: 15/07/2026 → ĐÃ QUÁ HẠN open-vial (3 ngày)
        ↓
[Hệ thống] BLOCK sử dụng + yêu cầu QC lại:
  "Lô L001 đã hết hạn open-vial. BẮT BUỘC chạy QC lại trước khi dùng."
        ↓
[QC_OFFICER] Nhận notification
        ↓
QC_OFFICER mở app → /qc/open-vial-retest
        ↓
Chạy QC lại:
  - Sử dụng control mẫu (2-level: normal + pathological)
  - Ghi nhận kết quả
  - Đính kèm file kết quả
        ↓
Kết quả:
  ├─ PASS → Mở khóa lô, cho phép dùng tiếp (cộng thêm X ngày tùy QC_OFFICER quyết định)
  └─ FAIL → status = QC_FAILED, xử lý theo quy trình hủy
        ↓
Ghi vào lot_qc_records với qc_type = 'OPEN_VIAL_RETEST'
```

### 3.3. Workflow cảnh báo hết hạn open-vial

```
[CRON chạy hàng ngày 06:00 sáng]
        ↓
Quét lots có open_vial_expiration_date:
  - 7 ngày trước: WARNING (vàng)
  - 3 ngày trước: CRITICAL (đỏ)
  - 1 ngày trước: CRITICAL (đỏ) + email
  - Đã quá hạn: CRITICAL + BLOCK sử dụng + yêu cầu QC lại
        ↓
Notify thủ kho + KTV
```

---

## 4. LOGIC

### 4.1. Tính open_vial_expiration

```
open_vial_expiration_date = opened_at_date + product.open_vial_stability_days

# Nếu product.open_vial_stability_days = NULL:
  → Cảnh báo "Chưa cấu hình open-vial stability"
  → Cho phép ghi nhận nhưng KHÔNG có expiration → KHÔNG áp dụng FEFO open-vial
  → Cần admin/thủ kho cấu hình sau
```

### 4.2. Volume tracking

```
# Khi mở nắp lần đầu:
volume_remaining = product.package_volume (vd: lọ 100ml)
# Lấy ra:
volume_remaining -= volume_taken

# Khi mở nắp lần 2 (đã từng mở):
volume_remaining = lots.open_vial_quantity_remaining
# Lấy ra thêm:
volume_remaining -= volume_taken

# Khi volume_remaining = 0:
→ Status = DEPLETED, không cho dùng tiếp
```

### 4.3. QC lại workflow

```sql
-- Khi cần dùng lô open-vial đã quá hạn:
-- 1. Kiểm tra: CURRENT_DATE > open_vial_expiration_date
-- 2. Nếu CÓ → check lot_qc_records có record OPEN_VIAL_RETEST gần nhất PASS không
-- 3. Nếu KHÔNG hoặc FAIL → block + yêu cầu QC lại

-- QC_PASS cho phép dùng thêm:
qc_valid_until = CURRENT_DATE + qc_officer_decision_days
-- Mặc định: 7 ngày (QC_OFFICER có thể chỉnh)
```

### 4.4. FEFO + Open-Vial (tích hợp với SPEC #6)

```
# Priority trong FEFO:
1. Lô đã mở nắp + open_vial_expiration_date sớm nhất (ưu tiên cao nhất)
2. Lô chưa mở + expiration_date sớm nhất

# Nếu lô FEFO đã quá hạn open-vial:
→ KHÔNG pick (trừ khi có QC_PASS gần đây)
→ Cảnh báo "Lô L001 quá hạn open-vial, cần QC lại"
```

### 4.5. Edge cases

| Tình huống | Xử lý |
|---|---|
| Mở nắp nhiều lần trong ngày | Append vào open_vial_history, KHÔNG ghi đè |
| Volume_taken > volume_remaining | Validation fail |
| Volume_remaining = 0 sau khi lấy | Status = DEPLETED, không cho mở nắp nữa |
| Lô hết hạn gốc (expiration_date) trước open-vial exp | Dùng hạn gốc (luôn dùng min) |
| Sản phẩm không có open_vial_stability_days | Cảnh báo + cho phép ghi nhận nhưng không có open-vial tracking |
| QC lại FAIL | Status = QC_FAILED, xử lý theo SPEC #3 |
| QC lại PASS nhưng sau đó lại quá hạn open-vial | Lặp lại QC lại (có thể nhiều lần) |
| Nhiều thủ kho cùng mở nắp 1 lô | Optimistic lock + warning |
| Lô đã DESTROYED/EXPIRED mà cố mở nắp | Validation fail |
| Volume_remaining < 1ml | Cảnh báo "Lô gần hết (còn X ml)" |

---

---

## 5. SCHEMA

```sql
-- ============================================================
-- MODULE #4: OPEN-VIAL TRACKING
-- File: supabase/migrations/20260614_open_vial_tracking.sql
-- ============================================================

-- 5.1. Mở rộng bảng lots (đã có schema ở SPEC #3, bổ sung cột volume)
ALTER TABLE lots ADD COLUMN IF NOT EXISTS package_volume DECIMAL(15, 3);  -- Volume ban đầu (vd: 100ml)
ALTER TABLE lots ADD COLUMN IF NOT EXISTS open_vial_count INT DEFAULT 0;  -- Số lần đã mở
ALTER TABLE lots ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS last_qc_retest_at TIMESTAMPTZ;  -- QC lại gần nhất
ALTER TABLE lots ADD COLUMN IF NOT EXISTS last_qc_retest_result lot_qc_result;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS qc_retest_valid_until DATE;     -- QC lại có hiệu lực đến

-- 5.2. Bảng open_vial_print_queue (hàng đợi in nhãn)
CREATE TABLE open_vial_print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  open_vial_history_id UUID NOT NULL REFERENCES open_vial_history(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'PENDING',  -- PENDING | PRINTED | FAILED
  printed_at TIMESTAMPTZ,
  printed_by UUID REFERENCES auth.users(id),
  printer_id TEXT,                  -- ID máy in (nếu có nhiều máy)
  error_message TEXT,
  retry_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ovpq_status ON open_vial_print_queue(status, created_at);

-- 5.3. Bảng open_vial_qc_retest (lịch sử QC lại riêng cho open-vial)
-- Lưu ý: có thể dùng lot_qc_records với qc_type = 'OPEN_VIAL_RETEST'
-- Nhưng tạo bảng riêng cho dễ query
CREATE TABLE open_vial_qc_retest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  open_vial_history_id UUID REFERENCES open_vial_history(id),

  qc_officer_id UUID NOT NULL REFERENCES auth.users(id),
  qc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qc_method TEXT NOT NULL,                  -- "2-level control", "3-level control", ...
  qc_result lot_qc_result NOT NULL,
  qc_notes TEXT,

  -- Control mẫu đã dùng
  control_normal_lot_id UUID REFERENCES lots(id),
  control_pathological_lot_id UUID REFERENCES lots(id),

  -- Quyết định
  valid_until DATE NOT NULL,                -- QC có hiệu lực đến
  decision_notes TEXT,

  attachments JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ovqr_lot ON open_vial_qc_retest(lot_id);
CREATE INDEX idx_ovqr_valid ON open_vial_qc_retest(lot_id, valid_until DESC);

-- 5.4. Function: check open-vial có cần QC lại không
CREATE OR REPLACE FUNCTION fn_check_open_vial_needs_retest(p_lot_id UUID)
RETURNS TABLE(
  needs_retest BOOLEAN,
  reason TEXT,
  days_expired INT,
  last_retest_date DATE,
  last_retest_valid_until DATE
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_lot RECORD;
  v_last_retest RECORD;
BEGIN
  SELECT l.*, p.open_vial_stability_days
  INTO v_lot
  FROM lots l
  JOIN products p ON p.id = l.product_id
  WHERE l.id = p_lot_id;

  -- Nếu lô chưa mở nắp → không cần QC
  IF v_lot.open_vial_opened_at IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Chưa mở nắp', 0, NULL::DATE, NULL::DATE;
    RETURN;
  END IF;

  -- Nếu lô không có open_vial_stability_days → không áp dụng
  IF v_lot.open_vial_stability_days IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Chưa cấu hình open-vial stability', 0, NULL::DATE, NULL::DATE;
    RETURN;
  END IF;

  -- Nếu lô chưa quá hạn open-vial
  IF CURRENT_DATE <= v_lot.open_vial_expiration_date THEN
    RETURN QUERY SELECT FALSE, 'Còn hạn open-vial', 0, NULL::DATE, NULL::DATE;
    RETURN;
  END IF;

  -- Lô đã quá hạn open-vial → check QC lại gần nhất
  SELECT * INTO v_last_retest
  FROM open_vial_qc_retest
  WHERE lot_id = p_lot_id
    AND qc_result = 'PASS'
  ORDER BY qc_date DESC
  LIMIT 1;

  IF v_last_retest IS NULL THEN
    RETURN QUERY SELECT TRUE, 'Quá hạn open-vial, chưa QC lại',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT,
      NULL::DATE, NULL::DATE;
  ELSIF v_last_retest.valid_until < CURRENT_DATE THEN
    RETURN QUERY SELECT TRUE, 'QC lại đã hết hiệu lực',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT,
      v_last_retest.qc_date, v_last_retest.valid_until;
  ELSE
    RETURN QUERY SELECT FALSE, 'Đã có QC lại còn hiệu lực',
      (CURRENT_DATE - v_lot.open_vial_expiration_date)::INT,
      v_last_retest.qc_date, v_last_retest.valid_until;
  END IF;
END;
$$;

-- 5.5. Trigger: cập nhật open_vial fields khi ghi open_vial_history
CREATE OR REPLACE FUNCTION trg_update_lot_open_vial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE lots
  SET
    open_vial_opened_at = NEW.opened_at,
    open_vial_quantity_remaining = NEW.quantity_after,
    open_vial_expiration_date = NEW.open_vial_expiration_date,
    open_vial_opened_by = NEW.opened_by,
    open_vial_stability_days = (SELECT open_vial_stability_days FROM products WHERE id = lots.product_id),
    open_vial_count = COALESCE(open_vial_count, 0) + 1,
    last_opened_at = NEW.opened_at,
    status = CASE
      WHEN NEW.quantity_after = 0 THEN 'DEPLETED'
      WHEN status = 'APPROVED' THEN 'IN_USE'
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.lot_id;

  -- Thêm vào print queue
  INSERT INTO open_vial_print_queue (tenant_id, open_vial_history_id)
  VALUES (NEW.tenant_id, NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_open_vial_history
  AFTER INSERT ON open_vial_history
  FOR EACH ROW
  EXECUTE FUNCTION trg_update_lot_open_vial();

-- 5.6. Cron cảnh báo (6:00 sáng hàng ngày)
-- Cảnh báo 7/3/1 ngày + quá hạn

-- 5.7. RLS
ALTER TABLE open_vial_qc_retest ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_vial_print_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_ovqr_officer" ON open_vial_qc_retest
  FOR ALL USING ((auth.jwt() ->> 'role') IN ('QC_OFFICER', 'DEPT_HEAD', 'ADMIN'));

CREATE POLICY "rls_ovqr_keeper_read" ON open_vial_qc_retest
  FOR SELECT USING (true);

COMMENT ON TABLE open_vial_qc_retest IS 'Lịch sử QC lại cho lô open-vial đã quá hạn';
COMMENT ON TABLE open_vial_print_queue IS 'Hàng đợi in nhãn open-vial (tự động in sau khi lưu)';
```

---

## 6. API HOOKS

```typescript
// src/lib/hooks/useOpenVial.ts

export function useRecordOpenVial() { /* Ghi nhận mở nắp */ }
export function useCheckOpenVialNeedsRetest(lotId: string) { /* Check cần QC lại */ }
export function useOpenVialRetestHistory(lotId: string) { /* Lịch sử QC lại */ }
export function useRecordOpenVialRetest() { /* QC_OFFICER ghi nhận QC lại */ }
export function useExpiringOpenVialLots(days: number) { /* Dashboard cảnh báo */ }
export function usePrintQueue() { /* Hàng đợi in nhãn */ }
```

---

## 7. UI

### 7.1. Modal mở nắp (đã có ở SPEC #3, bổ sung volume tracking)

```
┌─────────────────────────────────────────────────┐
│  🧪 Ghi nhận mở nắp lô                          │
│  ─────────────────────────────────────────────  │
│  Lô: L001 - Glucose (HC-SP) | Kho: DAILY_HC_SP  │
│  HSD gốc: 12/06/2026                             │
│  Open-vial stability: 28 ngày                    │
│  Volume ban đầu: 100ml                           │
│  Volume còn (lần mở trước): 95ml                 │
│  Lần mở thứ: 2                                   │
│                                                  │
│  Ngày mở: 14/06/2026 (mặc định)                  │
│  → Open-vial expiration: 12/07/2026 (auto)       │
│                                                  │
│  Lượng lấy ra: [___5___] ml                      │
│  → Volume còn lại: 90 ml (auto)                  │
│                                                  │
│  🖨️ Sau khi lưu:                                 │
│  - Tự động in nhãn "Mở 14/06, Hết hạn 12/07"    │
│  - FEFO ưu tiên dùng lô này trước                │
│  - Cảnh báo trước 7/3/1 ngày                     │
│                                                  │
│              [Hủy]  [💾 Lưu & In nhãn]          │
└─────────────────────────────────────────────────┘
```

### 7.2. Cảnh báo khi dùng lô open-vial quá hạn

```
┌─────────────────────────────────────────────────┐
│  🔴 BLOCK: Lô quá hạn open-vial                  │
│  ─────────────────────────────────────────────  │
│  Lô: L001 - Glucose                              │
│  Open-vial expiration: 12/07/2026                │
│  Hôm nay: 15/07/2026 (quá 3 ngày)               │
│                                                  │
│  BẮT BUỘC chạy QC lại trước khi dùng:            │
│  - 2-level control (normal + pathological)       │
│  - Ghi nhận kết quả                              │
│  - QC_OFFICER quyết định dùng tiếp hay hủy       │
│                                                  │
│  Lý do cần dùng (bắt buộc):                      │
│  [Bệnh nhân cấp cứu, không có lô khác_______]  │
│                                                  │
│  [📋 Mở QC lại]  [❌ Hủy, dùng lô khác]          │
└─────────────────────────────────────────────────┘
```

### 7.3. Modal QC lại (QC_OFFICER)

```
┌─────────────────────────────────────────────────┐
│  ✅ QC lại lô open-vial                          │
│  ─────────────────────────────────────────────  │
│  Lô: L001 - Glucose (đã mở, quá hạn 3 ngày)     │
│  Kho: DAILY_HC_SP | Người yêu cầu: Nguyễn A    │
│                                                  │
│  Phương pháp: ● 2-level ○ 3-level                │
│                                                  │
│  Control mẫu:                                    │
│  - Normal: [L-CONTROL-N-001 (▼)]                │
│  - Pathological: [L-CONTROL-P-001 (▼)]           │
│                                                  │
│  Kết quả: ● PASS  ○ FAIL                         │
│                                                  │
│  QC có hiệu lực đến: [22/07/2026] (mặc định 7 ngày)│
│                                                  │
│  Ghi chú:                                        │
│  [Kết quả trong tầm kiểm soát. Cho dùng tiếp__]│
│                                                  │
│  File kết quả:                                   │
│  [📎 Upload PDF/ảnh]                              │
│                                                  │
│              [Hủy]  [💾 Lưu QC]                  │
└─────────────────────────────────────────────────┘
```

### 7.4. Nhãn in (template)

```
┌──────────────────────────────────┐
│  ⚠️ MỞ NẮP                       │
│  ────────────────────────────    │
│  Ngày mở: 14/06/2026             │
│  Hết hạn open-vial: 12/07/2026   │
│  ────────────────────────────    │
│  SP: Glucose (HO-001)            │
│  Lô: L001                        │
│  Kho: DAILY_HC_SP                │
│  Volume: 100ml → còn 90ml         │
│  ────────────────────────────    │
│  Người mở: Nguyễn Văn A         │
│  Khoa XN BV Trường ĐHYD Cần Thơ  │
│  ────────────────────────────    │
│  ⓘ Dùng trước các lô khác         │
└──────────────────────────────────┘
```

---

## 8. EDGE CASES

| Tình huống | Xử lý |
|---|---|
| Mở nắp nhiều lần cùng ngày | Append history, ghi nhiều dòng |
| Volume_taken > volume_remaining | Validation fail |
| Volume_remaining = 0 | Status = DEPLETED, không cho mở nữa |
| Lô hết hạn gốc trước open-vial exp | Dùng hạn gốc |
| Sản phẩm không có open_vial_stability | Cảnh báo + cho ghi nhận nhưng không có tracking |
| QC lại FAIL | Status = QC_FAILED, xử lý theo SPEC #3 |
| QC lại PASS nhiều lần liên tiếp | Cho phép, log mỗi lần |
| Máy in lỗi | Retry queue, sau 3 lần fail → thông báo manual in |
| Thay đổi open_vial_stability sau khi đã mở | KHÔNG áp dụng ngược (giữ giá trị cũ) |
| Mở nắp khi status != APPROVED | Validation fail (trừ IN_USE đã có open-vial tracking) |

---

## 9. ACCEPTANCE CRITERIA

- [ ] **AC-1**: Mở nắp ghi nhận + tính open_vial_expiration từ product config
- [ ] **AC-2**: Tự động in nhãn sau khi lưu (vào print queue)
- [ ] **AC-3**: Volume tracking chính xác (lượng còn lại giảm dần)
- [ ] **AC-4**: Block sử dụng lô open-vial quá hạn (nếu chưa QC lại)
- [ ] **AC-5**: QC lại PASS → cho dùng tiếp với valid_until
- [ ] **AC-6**: QC lại FAIL → status = QC_FAILED
- [ ] **AC-7**: Cảnh báo 7/3/1 ngày + email
- [ ] **AC-8**: Status tự động: APPROVED → IN_USE → DEPLETED
- [ ] **AC-9**: RLS: chỉ thủ kho HC-SP mới thấy open-vial tracking HC-SP
- [ ] **AC-10**: Audit log cho mỗi lần mở nắp + QC lại

### Test cases chính
| # | Test | Expected |
|---|---|---|
| TC-1 | Mở nắp lần 1, lấy 5ml | Tính expiration = opened + 28 ngày, in nhãn |
| TC-2 | Mở nắp lần 2, lấy 10ml | Append history, volume = 85ml |
| TC-3 | Lấy 95ml (volume_remaining < 5) | Validation OK, volume = 0, status = DEPLETED |
| TC-4 | Lấy 100ml (volume_taken > remaining) | Validation fail |
| TC-5 | Dùng lô quá hạn open-vial | Block, yêu cầu QC lại |
| TC-6 | QC lại PASS, valid_until = +7 ngày | Mở khóa, dùng được |
| TC-7 | QC lại FAIL | Status = QC_FAILED, xử lý hủy |
| TC-8 | Cron cảnh báo 7 ngày trước | Email + in-app notification |
| TC-9 | Sản phẩm không có open_vial_stability | Cảnh báo, cho ghi nhận không có expiration |
| TC-10 | Máy in fail 3 lần | Thông báo manual in |

---

## Effort: 2 tuần**

- Schema + function + trigger: 0.5 tuần
- Print queue + cron: 0.5 tuần
- API + UI: 1 tuần

**Phụ thuộc**: SPEC #3 + #5

**Câu hỏi mở**:
- Khi nào tự động mở nắp (vd: tự ghi nhận khi xuất lần đầu)?
- Tích hợp với máy in nhãn nào (Zebra, Brother, ...)?
- Có cần barcode/QR trên nhãn không?
- Mở nắp trong bao lâu thì tính là "lần 2" (cùng ngày vs khác ngày)?

---

**Người viết**: Claude | **Ngày**: 2026-06-14 | **Trạng thái**: ⏸️ CHỜ USER REVIEW

