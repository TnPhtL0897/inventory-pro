# Phase 6c — Import Stock Snapshot from Excel (Bootstrap)

**Date:** 2026-06-10
**Status:** Design validated, implementation in progress
**Author:** Claude (brainstorming → design → code)

## 1. Problem

Tenants mới onboard (đặc biệt là bệnh viện vừa migrate từ Excel/HTKK cũ) đã có
sẵn tồn kho thực tế trong kho. Hiện tại cách duy nhất để seed là tạo GRN thủ
công cho từng dòng — không khả thi với hàng trăm/hàng nghìn SKU.

Cần 1 luồng cho phép user upload file Excel `Báo cáo tồn kho` (snapshot tại
1 thời điểm) để bootstrap ban đầu cho 1 warehouse cụ thể.

## 2. Scope

**Trong scope:**
- File Excel định dạng chuẩn của bệnh viện (BỘ Y TẾ / BỆNH VIỆN ...)
- Mỗi dòng trong file → 1 `stock_movement` IN với idempotency_key deterministic
- Edge function validate + insert qua `record_stock_movement` RPC (đã có sẵn)
- UI 4 bước: upload → parse → preview/validate → commit

**Ngoài scope (post-MVP):**
- Auto-create products từ SKU chưa tồn tại (cần import products trước)
- Undo snapshot (rollback movements theo `metadata->>source`)
- Reconciliation (so sánh file vs system)

## 3. Excel format

| Dòng | Nội dung | Xử lý |
|---|---|---|
| 0-2 | Header bệnh viện ("BỘ Y TẾ", "BÁO CÁO TỒN KHO") | Bỏ qua |
| 4 | Header cột | Dùng để map fields |
| 5, 9 | Tiêu đề phân nhóm ("Hóa chất", "Vật tư") | Bỏ qua |
| 6-7, 10 | Dòng trống | Bỏ qua |
| 11+ | Dữ liệu thật | Parse |

**Ánh xạ cột:**

| Cột Excel | Field nội bộ | Ghi chú |
|---|---|---|
| `STT` | — | Bỏ |
| `Tên thuốc, hóa chất, VTYT` | `productName` + `sku` | SKU extract bằng regex `/M[ãa]\s*:\s*([A-Z0-9.\-_]+)/i` |
| `ĐVT` | `unitCode` | Map VN → EN (Cái→PCS, Gram→GRAM, Lọ→BOTTLE, ...) |
| `Số lô` | `batchNo` | Trực tiếp |
| `Nhà cung cấp` | `supplierName` | Lưu vào `metadata.supplier_name` |
| `Thông tin thầu` | — | Bỏ |
| `Đơn giá` | `unitCost` | Numeric |
| `Đơn giá BH` | — | Bỏ |
| `Số lượng tồn` | `quantity` | Numeric, bỏ qua nếu ≤0 |
| `Thành tiền` | — | (Optional) verify `qty × unit_cost ≈ thành tiền` |

## 4. Architecture

```
[User Upload] → [apps/web parseExcelFile]
                          ↓
        [apps/web extractSkuFromName + mapUnitCode]
                          ↓
              [Preview + Validation UI]
                          ↓
        POST /functions/v1/import-stock-snapshot
                          ↓
   [Edge Function: validate FK, dedup idempotency_key]
                          ↓
       INSERT qua RPC record_stock_movement()
                          ↓
   [Trigger apply_stock_movement tự cập nhật stock]
```

**Idempotency:**
- Key = `sha256(sku + '|' + batchNo + '|' + reportDate + '|' + warehouseId).slice(0, 32)`
- Hex 32 char (UUID-shaped) → safe cho cột `idempotency_key UUID`
- Re-import cùng file → skip, không error

**Tại sao dùng `record_stock_movement` RPC thay vì insert trực tiếp:**
- Trigger `apply_stock_movement` tự cập nhật `stock` (weighted avg, check allow_negative)
- `SECURITY DEFINER` bypass RLS nhưng vẫn check `auth_tenant_id()`
- Bảo đảm business logic đồng nhất với GRN/Issue/Transfer

## 5. Files

**Mới:**
- `supabase/functions/import-stock-snapshot/index.ts` (~250 LOC, mirror import-products)
- `apps/web/src/features/stock/import-stock-snapshot-client.tsx` (~300 LOC)
- `apps/web/src/app/(dashboard)/inventory/stock/snapshot/page.tsx` (8 LOC)

**Sửa:**
- `apps/web/src/lib/excel-parser.ts` (+ STOCK_FIELD_MAP, extractSkuFromName, mapUnitCode ~70 LOC)
- Sidebar/layout (+ menu link)

## 6. Testing

- Unit: `extractSkuFromName()` (5 case), `mapUnitCode()` (10 case tiếng Việt có/không dấu)
- Integration: upload file 53 dòng → 3 products pre-seeded → expect inserted=53
- Idempotency: re-upload cùng file → inserted=0, no error
- Verify `v_stock_levels` có dữ liệu đúng sau commit

## 7. Rollout

```bash
supabase functions deploy import-stock-snapshot --no-verify-jwt
git add -A && git commit -m "feat(stock): import stock snapshot from Excel (phase 6c)"
git push origin main   # Cloudflare Pages auto-build
```

**Không cần:** migration mới, RLS thay đổi, env var mới, cron job.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Import sai warehouse | UI confirm trước commit; post-MVP: helper undo |
| File Excel format khác (không có regex `Mã:`) | UI hiển thị "0 dòng hợp lệ" + hướng dẫn |
| Concurrent import cùng file | idempotency_key chống duplicate |
| Quantity ≤ 0 | Bỏ qua dòng (constraint `quantity <> 0` ở DB) |
| Warehouse không có MAIN location | UI yêu cầu chọn location thủ công |
