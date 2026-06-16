# 📖 Hướng dẫn sử dụng Quản kho

> **Phiên bản**: 2.0 (2026-06-16)
> **Sản phẩm**: Phần mềm Quản lý kho vật tư cho Khoa Xét Nghiệm
> **Demo**: https://quankho.pages.dev

---

## 1. Giới thiệu

**Quản kho** là phần mềm quản lý kho chuyên biệt cho **Khoa Xét Nghiệm** Bệnh viện Trường ĐHYD Cần Thơ, tuân thủ:
- QĐ 2429/BYT (Quản lý chất lượng xét nghiệm)
- ISO 15189:2022 (Tiêu chuẩn phòng xét nghiệm)
- TT 54/2017/BYT (Lưu trữ hồ sơ)
- Luật Đấu thầu 22/2023/QH15, NĐ 24/2024/NĐ-CP (Đấu thầu công)

## 2. Đăng nhập

Truy cập: https://quankho.pages.dev/login

Tài khoản demo (chỉ dev):
- `admin@quankho.vn` / `Admin@2026` - Toàn quyền
- `truongkhoa@quankho.vn` / `Head@2026` - Trưởng khoa
- `thukho@quankho.vn` / `Keeper@2026` - Thủ kho

## 3. Cấu trúc menu

### 📊 Tổng quan (`/dashboard`)
- Tổng tồn kho, sản phẩm sắp hết, lô sắp hết hạn
- Cảnh báo quan trọng
- Truy cập nhanh các chức năng

### 📦 Vật tư (`/inventory/products`)
- Danh sách sản phẩm (HC-SP, VTYT)
- Thêm/sửa/xóa sản phẩm
- Phân loại theo nhóm (Hóa chất sinh phẩm, Vật tư y tế)
- Import/Export Excel

### 🏢 Kho (`/warehouses`)
- 4 kho Khoa XN: BULK_HC_SP, DAILY_HC_SP, BULK_VTYT, DAILY_VTYT
- Kho chẵn (RECEIVING) vs Kho lẻ (DAILY)
- Thêm/sửa kho

### 📥 Nhập/Xuất (`/goods-receipts`, `/stock-issues`, `/transfers`)
- **Nhập kho (GRN)**: Tạo phiếu nhập từ NCC → cập nhật stock
- **Xuất kho**: Tạo phiếu xuất → trừ stock
- **Chuyển kho**: Chuyển hàng giữa các kho nội bộ

### 🔬 Quản lý Lô (`/lots`)
- Vòng đời lô: QUARANTINE → PENDING_QC → IN_QC → APPROVED → IN_USE → EXPIRED/DESTROYED
- QC cho HC-SP
- Recall workflow

### 🧪 FEFO (`/fefo`) - **Khoa XN**
- Tự động chọn lô theo FEFO (open-vial trước → HSD sớm nhất)
- Báo cáo tuân thủ FEFO theo tháng
- Override có lý do + audit log

### 🧪 Open-Vial (`/open-vial`) - **Khoa XN**
- Ghi nhận mở nắp HC-SP + in nhãn tự động
- Theo dõi volume + hạn open-vial
- QC lại khi quá hạn open-vial

### 📋 Đấu thầu (`/bidding/*`) - **Khoa XN**
- Kế hoạch đấu thầu năm
- Hợp đồng thầu + theo dõi
- Đề nghị đấu thầu

### 📊 Theo dõi HĐ thầu (`/bid-tracking`) - **Khoa XN**
- Dashboard tổng quan HĐ
- Cảnh báo 90/60/30 ngày hết hạn
- % sử dụng cơ số

### 🛡️ Recall (`/recalls`) - **Khoa XN**
- Quản lý recall_notices
- Auto-block lots matching lot_number
- Severity: LOW / MEDIUM / HIGH / CRITICAL

### 📜 Audit Log (`/audit-log`) - **Khoa XN**
- Tra cứu mọi thao tác INSERT/UPDATE/DELETE
- Diff display (old_data vs new_data)
- Lưu 5 năm theo TT54
- Export Excel

### 📈 Báo cáo & Dự trù (`/replenishment`)
- Dự trù cuối tháng (auto-PR)
- Dự trù tuần (cho BULK)
- Dự trù năm

### 🛠️ Admin (`/admin/*`)
- `/admin/users` - Quản lý user + role
- `/admin/cron-monitor` - Theo dõi cron jobs

## 4. Workflow nghiệp vụ chính

### 4.1. Nhập kho từ NCC
1. Vào `/goods-receipts` → Click "Tạo phiếu nhập mới"
2. Chọn NCC, kho nhập (BULK_HC_SP hoặc BULK_VTYT)
3. Chọn **HĐ thầu** (bắt buộc theo QĐ 2429)
4. Thêm sản phẩm + số lượng + lot_number + HSD
5. Lưu DRAFT → duyệt → cập nhật stock tự động

### 4.2. Mở nắp HC-SP
1. Vào `/open-vial` → Click "Mở nắp"
2. (Mobile: dùng QR scanner để scan lot_number)
3. Nhập lượng lấy ra + lượng còn lại
4. Hệ thống tự động:
   - Tính open_vial_expiration_date = hôm nay + product.open_vial_stability_days
   - Update lots.status = IN_USE
   - Tạo open_vial_print_queue (in nhãn)
   - Tạo lot_alert cho DEPT_HEAD

### 4.3. FEFO Pick khi xuất kho
1. Tạo phiếu xuất → chọn sản phẩm + số lượng
2. Hệ thống auto-pick theo FEFO:
   - Lô open-vial sắp hết open-vial
   - → Lô chưa mở có HSD sớm nhất
3. Nếu muốn chọn lô khác → phải nhập lý do
4. Dùng lô EXPIRED → cảnh báo CRITICAL + notify DEPT_HEAD

### 4.4. QC lại open-vial quá hạn
1. Khi open-vial hết hạn → cron 06:00 tạo lot_alert
2. QC_OFFICER vào `/open-vial` → thấy lô cần QC lại
3. Click "🧪 QC lại" → chọn control + chạy
4. Nhập kết quả (PASS/FAIL) + ghi chú
5. PASS → lô tiếp tục dùng được
6. FAIL → status = QC_FAILED → xử lý hủy

### 4.5. Tạo recall (khi NCC thu hồi)
1. Vào `/recalls` → Click "Tạo recall mới"
2. Nhập số recall từ NCC, lý do, severity
3. Nhập **danh sách lot_number bị ảnh hưởng**
4. Hệ thống tự động:
   - Tạo recall_notices
   - Trigger: UPDATE lots SET status = BLOCKED WHERE lot_number IN (...)
   - Tạo lot_alert CRITICAL cho tất cả thủ kho

### 4.6. Dự trù cuối tháng
1. Vào `/replenishment` → Click "Tạo dự trù tháng mới"
2. Chọn tháng/năm + as_of_date
3. Click "Xem trước" → hệ thống tính:
   - TB tiêu hao 3 tháng × 0.6 + tuần trước × 0.4
   - + buffer 1.5 tuần
   - Match với HĐ thầu ACTIVE
4. Click "Lưu thành PR" → tạo PurchaseRequest DRAFT
5. DEPT_HEAD duyệt → chuyển sang mua sắm

## 5. Tuân thủ quy định

### QĐ 2429/BYT
- ✅ Lot tracking đầy đủ
- ✅ FEFO enforcement
- ✅ Open-vial tracking + QC lại
- ✅ Audit log 5 năm
- ✅ HĐ thầu bắt buộc cho mọi GRN

### ISO 15189:2022
- ✅ Kiểm soát vật tư theo hạn
- ✅ QC cho HC-SP
- ✅ Recall workflow
- ✅ Truy xuất nguồn gốc (audit log)

### TT 54/2017/BYT
- ✅ Audit log lưu 5 năm
- ✅ Mọi thao tác INSERT/UPDATE/DELETE được ghi

### Luật Đấu thầu 22/2023
- ✅ HĐ thầu ACTIVE tracking
- ✅ Cảnh báo 90/60/30 ngày hết hạn
- ✅ Đề nghị đấu thầu tự động từ tiêu hao thực tế

## 6. Phím tắt & Tips

- **Ctrl+K**: Tìm kiếm nhanh (sắp ra mắt)
- **QR Scanner** trên mobile: nút to, có rung khi scan thành công
- **Excel Export**: Mọi bảng đều có nút xuất Excel
- **Filter**: Click icon filter trên header mỗi bảng

## 7. Hỗ trợ

- 📧 Email: support@quankho.vn
- 📞 Hotline: 0292-xxx-xxx
- 📖 Tài liệu chi tiết: `docs/USER-GUIDE-KHOAXN.md`
