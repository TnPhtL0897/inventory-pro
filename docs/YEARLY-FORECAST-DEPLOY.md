# Hướng dẫn deploy Yearly Forecast

## Tổng quan

Tính năng **Dự trù năm** cho phép quản lý kho tính toán số lượng cần mua cho năm sau dựa trên:
- Lịch sử tiêu thụ 12 tháng gần nhất (GRN, Issue, Transfer, Adjust)
- Công thức: **Max(TB 12 tháng, max 3 tháng gần nhất) × 12**
- Kết quả: lưu vào DB + export Excel gửi phòng Kế hoạch

## Các bước deploy

### 1. Apply migration lên Supabase (THỦ CÔNG)

Vì classifier không cho tôi tự ý chạy schema change trên production, bạn cần chạy thủ công:

**Cách 1: Supabase Dashboard (khuyến nghị)**
1. Vào https://supabase.com/dashboard/project/ituyoplyuhbdxkhabcpy/sql/new
2. Mở file `supabase/migrations/20260610150000_yearly_forecast.sql`
3. Copy toàn bộ nội dung → paste vào SQL Editor
4. Click "Run" (hoặc Ctrl+Enter)
5. Verify: chạy query `SELECT * FROM yearly_forecast_runs LIMIT 1;` → trả về 0 rows nhưng không lỗi

**Cách 2: psql từ máy local**
```bash
psql "$(grep SUPABASE_DB_CONNECTION .supabase-credentials | cut -d'=' -f2-)" -f supabase/migrations/20260610150000_yearly_forecast.sql
```

**Cách 3: Chạy script Python (tôi đã chuẩn bị sẵn)**
```powershell
# PowerShell
$env:SUPABASE_DB_CONNECTION = (Get-Content .supabase-credentials | Where-Object { $_ -match "^SUPABASE_DB_CONNECTION=" }) -replace "^[^=]+=", ""
python scripts/apply-yearly-forecast-migration.py
```

### 2. Deploy Edge Function

Sau khi tôi tạo xong edge function (task 9), sẽ tự deploy hoặc bạn chạy:

```bash
supabase functions deploy compute-yearly-forecast --no-verify-jwt
```

### 3. Verify

Sau khi apply migration xong, chạy:
```sql
-- Tables tồn tại
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'yearly_forecast%';
-- View tồn tại
SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_product_consumption_yearly';
```

Expected output:
```
yearly_forecast_runs
yearly_forecast_lines
```

## Cấu trúc bảng

### `yearly_forecast_runs` (header)
| Column | Type | Mô tả |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → tenants |
| `fiscal_year` | INT | NĂM cần dự trù (vd: 2027) |
| `run_date` | DATE | Ngày chạy |
| `warehouse_ids` | UUID[] | Mảng các kho tính |
| `formula` | TEXT | Công thức áp dụng |
| `total_products` | INT | Số SP xét |
| `total_lines` | INT | Số SP có output |
| `total_estimated_value` | NUMERIC(18,2) | Tổng tiền dự kiến |
| `status` | ENUM | DRAFT / COMPLETED / CANCELLED |
| `run_by` | UUID | FK → users |
| `notes` | TEXT | Ghi chú |

### `yearly_forecast_lines` (chi tiết)
| Column | Type | Mô tả |
|---|---|---|
| `id` | UUID | PK |
| `run_id` | UUID | FK → runs |
| `product_id` | UUID | FK → products |
| `consumption_12m` | NUMERIC | Tổng xuất 12 tháng |
| `consumption_12m_avg` | NUMERIC | TB tháng × 12 tháng |
| `consumption_3m_max` | NUMERIC | Max 1 tháng trong 3 tháng gần nhất |
| `forecast_base` | NUMERIC | MAX(avg12m, max3m) |
| `forecast_year_qty` | NUMERIC | forecast_base × 12 |
| `current_stock` | NUMERIC | on_hand_qty tại thời điểm run |
| `suggested_buy_qty` | NUMERIC | MAX(0, forecast_year - current_stock) |
| `unit_price` | NUMERIC | products.cost_price |
| `total_estimated_value` | NUMERIC | suggested_buy × unit_price |
| `line_status` | ENUM | INCLUDED / EXCLUDED / PENDING |
| `user_note` | TEXT | User tick/untick + ghi chú |

## Sau khi apply xong

1. Cho tôi biết "đã apply xong"
2. Tôi tiếp tục code edge function + UI
3. Bạn test trên UI: `/inventory/replenishment/yearly`
