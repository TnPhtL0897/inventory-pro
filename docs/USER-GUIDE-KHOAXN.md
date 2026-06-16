# 🔬 Hướng dẫn sử dụng chi tiết — Khoa Xét Nghiệm

> **Dành cho**: Thủ kho, KTV xét nghiệm (QC), Trưởng khoa
> **Module đặc thù**: FEFO, Open-Vial, QC, Recall, Audit, Bid Tracking
> **Phiên bản**: 2.0 (2026-06-16)

---

## 1. 4 Kho vật lý

| Mã kho | Tên | Vai trò | Nhóm sản phẩm |
|--------|-----|---------|----------------|
| `XN-BULK-HC` | Kho chẵn HC-SP | Nhận hàng từ NCC | Hóa chất - Sinh phẩm |
| `XN-DAILY-HC` | Kho lẻ HC-SP | Sử dụng nội bộ | Hóa chất - Sinh phẩm |
| `XN-BULK-VT` | Kho chẵn VTYT | Nhận hàng từ NCC | Vật tư y tế |
| `XN-DAILY-VT` | Kho lẻ VTYT | Sử dụng nội bộ | Vật tư y tế |

**Luồng hàng**: NCC → BULK → chuyển sang DAILY (khi cần dùng)

## 2. Module FEFO (First-Expire-First-Out)

### 2.1. Nguyên tắc
Hệ thống **tự động chọn lô** khi xuất theo thứ tự ưu tiên:
1. **Lô đã mở nắp** (open-vial) → lô có `open_vial_expiration_date` sớm nhất
2. **Lô chưa mở** → lô có `expiration_date` (hạn gốc) sớm nhất
3. Nếu lô đầu không đủ → pick tiếp lô sau

### 2.2. Workflow

**Bước 1**: Tạo phiếu xuất (`/stock-issues`)
- Chọn sản phẩm + số lượng cần xuất

**Bước 2**: Hệ thống hiển thị auto-pick
```
📦 Xuất 10 chai Glucose từ BULK_HC_SP
────────────────────────────────────────
⭐ L001  | HSD 12/06 🔴 | Open-vial: 16/06 (mở 10/05)
   Sẵn: 5 chai
────────────────────────────────────────
2️⃣ L002  | HSD 17/06 🟡 | Chưa mở
   Sẵn: 30 chai
────────────────────────────────────────
Tổng sẽ lấy: L001 (5) + L002 (5) = 10 chai
```

**Bước 3**: Chọn
- ✅ **Dùng auto-pick**: tuân thủ FEFO (khuyến nghị)
- 📝 **Chọn lô khác**: cần nhập lý do → audit log WARNING
- 🔴 **Dùng lô hết hạn**: cần lý do ≥ 50 ký tự + cam kết → audit CRITICAL

### 2.3. Lý do Override (chọn lô khác)

| Lý do | Khi nào dùng |
|-------|--------------|
| `FEFO_INSUFFICIENT` | Lô FEFO đầu không đủ số lượng |
| `FEFO_EXPIRED_SOON` | Lô FEFO sắp hết hạn, chờ nhập lô mới |
| `FEFO_RECALLED` | Lô FEFO bị recall |
| `EMERGENCY` | Cấp cứu (vd: bệnh nhân cấp cứu 23h) |
| `NO_OTHER_LOT` | Hết lô APPROVED |
| `OTHER` | Khác (mô tả chi tiết) |

### 2.4. Báo cáo FEFO Compliance

Vào `/fefo` → chọn tháng/năm → xem:
- Tổng xuất
- Tuân thủ FEFO (95%+ mục tiêu)
- Top sản phẩm hay bị override
- Top thủ kho hay override
- Audit log gần đây

**Tiêu chí chất lượng**: tỷ lệ tuân thủ ≥ 95% là tốt.

## 3. Module Open-Vial Tracking

### 3.1. Khái niệm

Sau khi **mở nắp** lọ HC-SP, hóa chất chỉ ổn định trong **N ngày** (tùy sản phẩm, vd: Glucose 28 ngày).

```
Lần mở đầu tiên: 01/06/2026
  → open_vial_expiration_date = 29/06/2026
  → Sau 29/06: PHẢI QC lại hoặc hủy
```

### 3.2. Workflow mở nắp

**Bước 1**: Vào `/open-vial` → Click "Mở nắp"
- Nhập **lượng lấy ra** (vd: 10ml)
- Nhập **lượng còn lại** (vd: 90ml)
- Ghi chú (tùy chọn)

**Bước 2**: Hệ thống tự động:
- ✅ Tính `open_vial_expiration_date`
- ✅ Update `lots.status = IN_USE`
- ✅ Tạo `open_vial_history` (lịch sử mở)
- ✅ Tạo `open_vial_print_queue` → in nhãn
- ✅ Tạo lot_alert cho DEPT_HEAD

**Bước 3**: Thủ kho in nhãn và dán lên lọ
```
┌──────────────────────────────────┐
│ MỞ NẮP: 14/06/2026              │
│ HẾT HẠN OPEN-VIAL: 12/07/2026   │
│ Sản phẩm: Glucose (HO-001)      │
│ Lô: L001                         │
│ Kho: DAILY_HC_SP                 │
│ Người mở: Nguyễn Văn A          │
└──────────────────────────────────┘
```

### 3.3. QC lại khi quá hạn open-vial

Khi open-vial **hết hạn**:
1. Hệ thống **BLOẶCK** sử dụng lô
2. Cron 06:00 tạo `lot_alert` CRITICAL
3. QC_OFFICER thấy trong `/open-vial` → danh sách "Sắp hết hạn"
4. Click "🧪 QC lại" → thực hiện QC với control normal + pathological
5. Ghi nhận kết quả + file đính kèm
6. **PASS** → lô tiếp tục dùng + thêm hạn mới
7. **FAIL** → status = QC_FAILED → xử lý hủy

### 3.4. QR Scanner (mobile)

Trên mobile, mở `/open-vial` → click icon 📷 → cho phép camera → quét QR trên lọ → tự động mở dialog mở nắp.

## 4. Module Recall

### 4.1. Khi nào tạo recall?

- NCC thông báo **thu hồi lô** (vd: lỗi sản xuất, nhiễm bẩn)
- **KHÔNG được dùng lô bị recall** dù còn hạn

### 4.2. Workflow

**Bước 1**: Vào `/recalls` → Click "Tạo recall mới"

**Bước 2**: Nhập thông tin
- Số recall từ NCC
- Lý do (vd: "Nhiễm chéo glucose")
- Severity: LOW / MEDIUM / HIGH / CRITICAL
- Danh sách `lot_number` bị ảnh hưởng

**Bước 3**: Hệ thống tự động
- ✅ Tạo `recall_notices` ACTIVE
- ✅ Trigger: UPDATE `lots` SET status = BLOCKED WHERE lot_number IN (...)
- ✅ Tạo `lot_alert` CRITICAL cho tất cả thủ kho
- ✅ Ghi audit log

**Bước 4**: Theo dõi + xử lý
- Lô BLOCKED không pick được (FEFO bỏ qua)
- Sau khi NCC xử lý xong → mark RESOLVED

## 5. Module Audit Log

### 5.1. Mục đích
Tuân thủ **TT 54/2017/BYT**: lưu trữ hồ sơ ≥ 5 năm.

### 5.2. Hệ thống tự động ghi log
- **INSERT** → ghi `new_data`
- **UPDATE** → ghi `old_data` + `new_data` + `changed_fields`
- **DELETE** → ghi `old_data`

Áp dụng cho 13 bảng: products, lots, stock_movements, stocktakes, bid_contracts, bid_lots, purchase_requests, goods_receipts, stock_issues, stock_transfers, fefo_audit_log, user_warehouse_roles, user_global_roles.

### 5.3. Tra cứu

Vào `/audit-log` → filter theo:
- Bảng (table_name)
- Thao tác (INSERT/UPDATE/DELETE)
- User email
- Khoảng thời gian

Click vào 1 row → xem diff (old_data vs new_data) dạng JSON.

**Export Excel** → button "📥 Xuất Excel" → tải file .xlsx.

## 6. Module Bid Tracking

### 6.1. Dashboard (`/bid-tracking`)

4 KPI cards:
- Tổng HĐ (12 ACTIVE / 18 tổng)
- Tổng giá trị HĐ (vd: 8.5 tỷ VNĐ)
- % sử dụng trung bình (vd: 37.65%)
- Số HĐ sắp hết hạn (trong 30/60/90 ngày)

### 6.2. Bảng HĐ sắp hết hạn

| Badge | Ý nghĩa | Hành động |
|-------|----------|-----------|
| 🔴 30 ngày | CRITICAL | Tạo đề nghị đấu thầu NGAY |
| 🟡 60 ngày | WARNING | Lên kế hoạch đấu thầu |
| ℹ️ 90 ngày | INFO | Theo dõi |

### 6.3. Quản lý HĐ (`/bidding/contracts`)

- Tạo/sửa HĐ thủ công hoặc import Excel
- Mỗi HĐ có: số HĐ, NCC, ngày ký, hạn, danh sách sản phẩm, đơn giá, cơ số
- File đính kèm: HĐ PDF, quyết định phê duyệt

## 7. Cron Jobs (chạy tự động)

| Cron | Thời gian | Mục đích |
|------|-----------|----------|
| `fn_auto_expire_lots` | 00:30 hàng ngày | Tự động EXPIRED lô hết hạn + tạo phiếu hủy |
| `fn_check_lot_expirations` | 06:00 hàng ngày | Cảnh báo 30/15/7 ngày hết hạn |
| `fn_list_open_vial_expiring` | 06:00 hàng ngày | Cảnh báo open-vial sắp hết hạn |
| `fn_compute_weekly_replenishment` | 02:00 T2 hàng tuần | Tính dự trù tuần |
| `fn_archive_old_audit_logs` | 00:00 01/01 hàng năm | Xóa audit log > 5 năm |

Xem chi tiết: `docs/CRON-JOBS.md`

## 8. Tips cho người mới

1. **Đọc nhãn lọ** trước khi pick: kiểm tra HSD + open-vial expiration
2. **Dùng QR scanner** trên mobile thay vì nhập tay
3. **Auto-pick FEFO** là mặc định → chỉ override khi thật cần
4. **Ghi chú lý do override** càng chi tiết càng tốt (≥ 10 ký tự)
5. **Backup data** mỗi tuần (export Excel từ /audit-log)

## 9. Liên hệ hỗ trợ

- 📧 support@quankho.vn
- 📞 0292-xxx-xxx
- 📖 SPEC kỹ thuật: `docs/plans/2026-06-14-*-spec.md`
