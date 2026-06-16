# Yearly Forecast — Resume Quick Reference

> 📌 **Đọc file này trước khi restart session!**

## Trạng thái hiện tại (snapshot 2026-06-11)

**✅ Phase 6c (Import Stock Snapshot) — HOÀN THÀNH**
- Commit: `40ba1c8`, `302b64d`, `38b4b1c`, `c752069`
- 53 dòng từ `BaoCaoTonKho_20260610142711.xlsx` đã được nạp vào production
- Warehouse: `WH-SNAPSHOT` (Tủ trực Huyết học)
- 32 products + 53 GRN lines + 50 stock levels
- Đã fix units (base_unit_id + unit_id từ CÁI → đúng)

**⏳ Yearly Forecast (Dự trù năm) — PENDING**
- SQL migration đã viết xong nhưng CHƯA apply lên production
- Edge function `apply-migration` đã deploy nhưng fail auth (giữ làm fallback)
- Edge function `compute-yearly-forecast` CHƯA code
- UI page CHƯA code

## Việc cần làm tiếp theo (theo thứ tự)

### Bước 1: BẠN apply migration (30 giây)

1. Mở: https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/sql/new
2. Mở file: `D:\Tự động hóa\Quản kho Pro\supabase\migrations\20260610150000_yearly_forecast.sql`
3. Ctrl+A → Ctrl+C trong file
4. Ctrl+V vào SQL Editor → Ctrl+Enter
5. Verify: chạy query này trong editor:
   ```sql
   SELECT 'yearly_forecast_runs' as t, count(*) FROM yearly_forecast_runs
   UNION ALL
   SELECT 'yearly_forecast_lines', count(*) FROM yearly_forecast_lines
   UNION ALL
   SELECT 'v_product_consumption_yearly' as t, count(*) FROM v_product_consumption_yearly;
   ```
   Expected: 3 rows, mỗi count=0 (no error)

### Bước 2: Reply "đã apply" — TÔI sẽ code tiếp

Tôi sẽ tạo (theo thứ tự):

1. **`supabase/functions/compute-yearly-forecast/index.ts`** (~250 LOC)
   - Input: `fiscalYear`, `warehouseIds[]`
   - Query `v_stock_movements_history` cho 12 tháng + 3 tháng gần nhất
   - Áp dụng công thức `MAX(avg12m, max3m) × 12`
   - Insert vào `yearly_forecast_runs` + `yearly_forecast_lines`
   - Returns: `runId`, `totalProducts`, `totalEstimatedValue`

2. **`apps/web/src/app/(dashboard)/inventory/replenishment/yearly/page.tsx`** + **`features/replenishment/yearly-forecast-client.tsx`**
   - Form: chọn `fiscalYear` + multi-select warehouses
   - Nút "Chạy dự trù" → gọi edge function
   - Bảng kết quả 32 products × 5+ columns (SKU, Name, Avg12m, Max3m, Suggested Buy, Total)
   - Nút "Export Excel" dùng SheetJS (mirror phase 6c import pattern)

3. **Sidebar link** "Dự trù năm" trong `apps/web/src/app/(dashboard)/layout.tsx`

4. **Commit + push** lên main

5. **Verify trên production** (https://quankho.pages.dev/inventory/replenishment/yearly)

## Công thức tính (đã chốt với user)

```
For each product:
  consumption_12m_avg = SUM(out_last_12_months) / 12
  consumption_3m_max = MAX(monthly_out for last 3 months)
  forecast_base = MAX(consumption_12m_avg, consumption_3m_max)
  forecast_year_qty = forecast_base × 12
  current_stock = SUM(v_stock_levels.on_hand_qty) for selected warehouses
  suggested_buy_qty = MAX(0, forecast_year_qty - current_stock)
  total_estimated_value = suggested_buy_qty × products.cost_price
```

## Nguồn OUT movements

| Loại | Bảng | Điều kiện |
|---|---|---|
| Stock Issue | `stock_issue_lines` JOIN `stock_issues` | `status='POSTED'` |
| Stock Transfer | `stock_transfer_lines` JOIN `stock_transfers` | `status IN ('IN_TRANSIT','RECEIVED')` — lấy `shipped_qty` |
| Stock Take | (chưa có flow chính thức) | TODO |

## Production data hiện tại (cần dùng cho test)

- Tenant: `00000000-0000-0000-0000-000000000010` (Demo Company)
- Branch: `77d26733-8717-4a1b-bd90-fa626bd283e4` (Main Branch)
- Warehouse: `f926aeac-387f-44e0-801c-801d68fb2cf5` (WH-SNAPSHOT)
- 32 products (VTYT.*)
- 53 GRN lines (1 GRN document)
- 0 Issue lines (chưa có lịch sử xuất) → **forecast sẽ = 0 cho tất cả products**

## Files đã có (KHÔNG tạo lại)

- `supabase/migrations/20260610150000_yearly_forecast.sql` (210 dòng)
- `supabase/functions/apply-migration/index.ts` (deployed nhưng fail auth)
- `scripts/apply-migration-supabase-cli.ps1` (fail vì CLI network)
- `scripts/apply-yearly-forecast-migration.py` (fail vì psycopg2 DNS)
- `scripts/verify-yearly-forecast.sql`
- `docs/YEARLY-FORECAST-DEPLOY.md`

## Memory đã lưu

- `memory/yearly-forecast-state-2026-06-11.md` — full state snapshot
- `memory/MEMORY.md` — index

## Khi restart

1. Đọc `docs/YEARLY-FORECAST-RESUME.md` (file này)
2. Check git log: `git log --oneline -10`
3. Check task list bằng TaskList
4. Nếu user chưa apply migration → remind họ
5. Nếu đã apply → code edge function + UI

---

**Last updated:** 2026-06-11 by Claude (session 38b4b1c → c752069)
