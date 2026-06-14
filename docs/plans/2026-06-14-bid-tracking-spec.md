# SPEC #8: Bid Tracking — Theo dõi Hợp đồng Thầu — Khoa Xét Nghiệm

> **Ngày tạo**: 2026-06-14
> **Trạng thái**: Chờ user review
> **Module**: (P1) Bid Tracking
> **Liên quan**: `2026-06-14-khoa-xn-handover.md` mục 2.5, 3.6

---

## 1. MỤC ĐÍCH & PHẠM VI

### 1.1. Mục đích
**Full workflow quản lý đấu thầu nội bộ** cho Khoa XN: từ lập kế hoạch → đề nghị đấu thầu → theo dõi hợp đồng → cảnh báo hết hạn/cơ số. Đã chốt với user: scope là **full workflow nội bộ** (không chỉ read-only).

### 1.2. Phạm vi
- **Trong scope**:
  - Quản lý hợp đồng thầu: số HĐ, NCC, sản phẩm, cơ số, đơn giá, hạn HĐ
  - Lập kế hoạch đấu thầu năm (annual procurement plan)
  - Đề nghị đấu thầu (xuất file PDF/Excel gửi Khoa Dược/Phòng VTYT)
  - Cảnh báo 90/60/30 ngày hết HĐ, 80%/90% cơ số
  - Tạo tay + import Excel
  - Theo dõi lượng đã mua / còn lại theo HĐ
  - Lưu trữ biên bản đấu thầu, quyết định phê duyệt
- **Ngoài scope**:
  - Đấu thầu điện tử (e-tendering)
  - Tích hợp với hệ thống đấu thầu quốc gia
  - Đánh giá nhà cung cấp (sẽ là module #6 Internal Supplier Scorecard - SPEC riêng)

### 1.3. Tuân thủ
- **Nghị định 24/2024/NĐ-CP** (đấu thầu, mua sắm công)
- **Luật Đấu thầu 22/2023/QH15**
- **QĐ 2429/BYT** Tiêu chí 7.2

---

## 2. ACTORS

| Actor | Quyền |
|---|---|
| **Thủ kho** (BULK) | Xem HĐ, xem cảnh báo, tạo đề nghị đấu thầu (khi HĐ sắp hết) |
| **Trưởng khoa (DEPT_HEAD)** | Tạo/sửa HĐ, duyệt kế hoạch, duyệt đề nghị |
| **Admin** | Quản lý NCC, import/export, cấu hình |

---

## 3. WORKFLOW

### 3.1. Workflow HĐ mới

```
[DEPT_HEAD/Admin] Tạo HĐ thủ công hoặc import Excel
        ↓
Nhập thông tin:
  - Số HĐ, NCC, ngày ký, hạn HĐ
  - Sản phẩm, cơ số thầu, đơn giá
  - File đính kèm (HĐ PDF, quyết định phê duyệt)
        ↓
HĐ status = ACTIVE
        ↓
Cảnh báo tự động:
  - 90/60/30 ngày trước hết HĐ
  - 80%/90% cơ số đã mua
```

### 3.2. Workflow đề nghị đấu thầu (khi HĐ sắp hết)

```
[DEPT_HEAD/Thủ kho] Nhấn "Tạo đề nghị đấu thầu" từ HĐ sắp hết
        ↓
Hệ thống tự động generate dựa trên:
  - Lịch sử tiêu hao 12 tháng
  - Tồn kho hiện tại
  - Sản phẩm trong HĐ cũ
        ↓
Xuất file PDF/Excel theo mẫu Bệnh viện (X-N-BM 5.7.1 hoặc mẫu riêng)
        ↓
[DEPT_HEAD] Duyệt + ký số (hoặc in ra ký tay + scan)
        ↓
Gửi cho Khoa Dược / Phòng VTYT (qua email hoặc in nộp trực tiếp)
```

### 3.3. Workflow cảnh báo

```
[CRON hàng ngày]
        ↓
Quét tất cả HĐ ACTIVE:
  - Còn 90 ngày: INFO (in-app)
  - Còn 60 ngày: WARNING (in-app + email)
  - Còn 30 ngày: CRITICAL (in-app + email + SMS)
  - Quá hạn: EXPIRED
        ↓
Quét cơ số:
  - Đã mua 80%: INFO
  - Đã mua 90%: WARNING
  - Đã mua 100%: CRITICAL + block nhập thêm
```

---

## 4. LOGIC

### 4.1. Tính cơ số đã mua
```
purchased_qty = SUM(quantity) FROM stock_movements
  WHERE movement_type = 'INBOUND'
  AND reference_type = 'GOODS_RECEIPT'
  AND contract_id = ?

remaining_qty = contract.quantity_max - purchased_qty
utilization_rate = purchased_qty / contract.quantity_max
```

### 4.2. Tính cảnh báo hết HĐ
```
days_until_expiry = contract.expiration_date - CURRENT_DATE
if days_until_expiry <= 30: CRITICAL
elif days_until_expiry <= 60: WARNING
elif days_until_expiry <= 90: INFO
```

### 4.3. Tự động generate đề nghị đấu thầu
```
# Công thức đề xuất cơ số mới:
suggested_quantity = max(
  consumption_12m,                          # Tổng tiêu hao 12 tháng
  consumption_12m * 1.2,                    # + 20% buffer
)

# Cap: không vượt max của HĐ cũ
suggested_quantity = min(suggested_quantity, contract.quantity_max * 1.5)
```

### 4.4. Edge cases
| Tình huống | Xử lý |
|---|---|
| HĐ hết hạn nhưng chưa có HĐ mới | Cho phép nhập hàng "ngoài HĐ" (cờ đặc biệt) + cảnh báo |
| Sản phẩm trong HĐ cũ bị thay đổi NCC | Cho phép tạo HĐ mới với NCC khác |
| Cùng 1 sản phẩm có 2 HĐ active (trùng thời gian) | Cảnh báo, cần DEPT_HEAD xác nhận HĐ nào ưu tiên |
| HĐ có nhiều sản phẩm, 1 sản phẩm hết cơ số trước | Cảnh báo riêng cho sản phẩm đó |
| Cơ số vượt 100% do nhập bù | Cảnh báo + yêu cầu lý do |

---

---

## 5. SCHEMA

```sql
-- ============================================================
-- MODULE: BID TRACKING (FULL WORKFLOW)
-- File: supabase/migrations/20260614_bid_tracking.sql
-- ============================================================

CREATE TYPE contract_status AS ENUM (
  'DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED', 'CANCELLED'
);

CREATE TYPE procurement_request_status AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'COMPLETED', 'CANCELLED'
);

-- Bảng suppliers (NCC)
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Bảng contracts (HĐ thầu)
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  contract_name TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  product_group TEXT CHECK (product_group IN ('HOA_CHAT_SINH_PHAM', 'VAT_TU_Y_TE')),

  signed_date DATE NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  total_value DECIMAL(15, 2),

  status contract_status NOT NULL DEFAULT 'DRAFT',

  -- File đính kèm
  contract_file_url TEXT,
  approval_decision_url TEXT,

  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (tenant_id, contract_number)
);

CREATE INDEX idx_contracts_tenant ON contracts(tenant_id, status);
CREATE INDEX idx_contracts_expiration ON contracts(expiration_date) WHERE status = 'ACTIVE';

-- Bảng contract_lines (sản phẩm trong HĐ)
CREATE TABLE contract_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price DECIMAL(15, 2) NOT NULL,
  quantity_max DECIMAL(15, 3) NOT NULL,    -- Cơ số thầu tối đa
  quantity_purchased DECIMAL(15, 3) DEFAULT 0,  -- Đã mua (cached)
  notes TEXT,
  UNIQUE (contract_id, product_id)
);

CREATE INDEX idx_cl_contract ON contract_lines(contract_id);

-- Bảng procurement_requests (đề nghị đấu thầu)
CREATE TABLE procurement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL,
  request_type TEXT,                       -- 'RENEWAL' (gia hạn) | 'NEW' (mới) | 'EMERGENCY' (khẩn cấp)
  product_group TEXT,

  -- Reference đến HĐ cũ (nếu là gia hạn)
  old_contract_id UUID REFERENCES contracts(id),

  -- Trạng thái
  status procurement_request_status NOT NULL DEFAULT 'DRAFT',

  -- Files
  request_file_url TEXT,
  signed_request_file_url TEXT,

  total_estimated_value DECIMAL(15, 2),

  -- Người tham gia
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  sent_to TEXT[],                          -- Người nhận (Khoa Dược / Phòng VTYT)
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (tenant_id, request_number)
);

-- Bảng procurement_request_lines
CREATE TABLE procurement_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  suggested_quantity DECIMAL(15, 3),
  final_quantity DECIMAL(15, 3),
  unit_price DECIMAL(15, 2),
  estimated_value DECIMAL(15, 2),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng contract_alerts
CREATE TABLE contract_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id),
  alert_type TEXT NOT NULL,                -- 'EXPIRING' | 'QUOTA_80' | 'QUOTA_90' | 'QUOTA_100' | 'EXPIRED'
  alert_level TEXT NOT NULL,                -- 'INFO' | 'WARNING' | 'CRITICAL'
  message TEXT NOT NULL,
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Function: update purchased quantity
CREATE OR REPLACE FUNCTION fn_update_contract_purchased()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.movement_type = 'INBOUND' AND NEW.contract_id IS NOT NULL THEN
    UPDATE contract_lines
    SET quantity_purchased = COALESCE(quantity_purchased, 0) + NEW.quantity
    WHERE contract_id = NEW.contract_id AND product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

-- (Trigger từ stock_movements - giả định đã có cột contract_id)

COMMENT ON TABLE contracts IS 'Hợp đồng thầu với NCC (theo dõi hạn, cơ số)';
COMMENT ON TABLE procurement_requests IS 'Đề nghị đấu thầu gửi Khoa Dược/Phòng VTYT';
```

---

## 6. API + UI (tóm tắt)

### API
- `useContracts`, `useContract(id)`, `useCreateContract`, `useImportContractsExcel`
- `useContractAlerts` (sắp hết, sắp hết cơ số)
- `useProcurementRequests`, `useGenerateProcurementRequest` (auto-fill)
- `useApproveProcurementRequest`

### UI
- `/contracts` — danh sách HĐ với filter theo status, NCC, mảng
- `/contracts/[id]` — chi tiết HĐ + danh sách sản phẩm + lượng đã mua
- `/procurement-requests/new` — tạo đề nghị (auto-fill từ HĐ cũ)
- Dashboard: widget cảnh báo HĐ sắp hết + cơ số sắp hết

---

## 7. UI Wireframes

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Hợp đồng thầu                                                 │
│  [ACTIVE] [SẮP HẾT] [HẾT HẠN] [Tất cả]                          │
│                                                                  │
│  ┌─── Cảnh báo ─────────────────────────────────────────────┐  │
│  │ 🔴 30 ngày: HĐ HC-2025-001 (Roche)                      │  │
│  │ 🟡 60 ngày: HĐ VT-2025-003 (Bbraun)                     │  │
│  │ 🟡 Cơ số 85%: Glucose (HĐ HC-2025-001)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── Bảng HĐ ──────────────────────────────────────────────┐  │
│  │ Số HĐ      │ NCC        │ Mảng  │ Cơ số  │ Đã mua │ Hạn   │  │
│  │────────────┼────────────┼───────┼────────┼────────┼───────│  │
│  │ HC-2025-001│ Roche      │ HC-SP │ 50M    │ 42M(84%)│30d🔴│  │
│  │ HC-2025-002│ BioMérieux │ HC-SP │ 30M    │ 12M(40%)│180d │  │
│  │ VT-2025-003│ Bbraun     │ VTYT  │ 20M    │  8M(40%)│60d🟡│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [+ Tạo HĐ mới]  [📥 Import Excel]                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Edge cases

| Tình huống | Xử lý |
|---|---|
| HĐ hết hạn nhưng chưa có HĐ mới | Cho phép nhập ngoài HĐ (cờ), cảnh báo |
| Trùng sản phẩm 2 HĐ cùng thời gian | Cảnh báo, yêu cầu chọn HĐ ưu tiên |
| Nhập vượt cơ số | Validation fail, yêu cầu lý do |
| HĐ có nhiều sản phẩm, 1 SP hết cơ số | Cảnh báo riêng cho SP đó |
| Import Excel trùng số HĐ | Validation fail, yêu cầu cập nhật thay vì tạo mới |
| Đề nghị đấu thầu không có HĐ cũ (tạo mới hoàn toàn) | Cho phép, type = 'NEW' |
| Xóa HĐ đang có lịch sử nhập hàng | Không cho xóa cứng, soft delete (status = CANCELLED) |

---

## 9. Acceptance

- [ ] **AC-1**: Tạo HĐ thủ công + import Excel
- [ ] **AC-2**: Cảnh báo 90/60/30 ngày + 80/90/100% cơ số
- [ ] **AC-3**: Auto-generate đề nghị đấu thầu từ HĐ sắp hết
- [ ] **AC-4**: Xuất PDF/Excel đề nghị theo mẫu BV
- [ ] **AC-5**: Tracking quantity_purchased tự động khi nhập hàng
- [ ] **AC-6**: RLS: thủ kho VTYT không thấy HĐ HC-SP
- [ ] **AC-7**: Audit log đầy đủ

---

## Effort: 4 tuần**

- Schema: 1 tuần
- API + UI: 2 tuần
- Import Excel + export PDF: 1 tuần

**Phụ thuộc**: SPEC #5 (Permission)

**Câu hỏi mở**:
- Tích hợp chữ ký số?
- Mẫu PDF/Excel đề nghị đấu thầu: dùng mẫu BV hay tự thiết kế?
- Workflow phê duyệt đề nghị: ai duyệt cuối (TK khoa → phòng TCKT → giám đốc)?

---

**Người viết**: Claude | **Ngày**: 2026-06-14 | **Trạng thái**: ⏸️ CHỜ USER REVIEW

