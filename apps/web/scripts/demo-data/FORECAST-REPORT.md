# Báo cáo: Test thuật toán Forecast với dữ liệu thật BV Trường ĐHYD Cần Thơ

## 1. Nguồn dữ liệu
- **14 file Excel** từ `Dữ liệu Demo/DỰ TRÙ/` (9 file 2025 + 5 file 2026)
- Tổng: **98 dòng dự trù** (sau re-extract với layout B: **97 dòng** chuẩn)
- **34 mã thầu unique** thuộc 3 nhóm:
  - `XN25.*` (Xét Nghiệm)
  - `ALL25.*` (Tổng hợp)
  - `24VT4.*` (VTYT chung)
- **23 NCC/NSX** unique
- Khoa: **Khoa Xét Nghiệm - BV Trường ĐHYD Cần Thơ**

## 2. Cấu trúc dữ liệu Excel

Mỗi file có format:
| Cột | Ý nghĩa |
|-----|---------|
| 1 | Stt |
| 2 | Mã thầu |
| 3 | Tên hóa chất - VTYT |
| 4 | NSX - HSX |
| 5 | Qui cách |
| 6 | ĐVT |
| 7 | SL sử dụng tháng trước (kế hoạch) |
| 8 | SL tồn tháng trước (kế hoạch) |
| 9 | SL sử dụng tháng trước (thực tế) ← **quan trọng cho forecast** |
| 10 | Tồn tháng trước (thực tế) ← **quan trọng cho forecast** |
| 11 | SL dự trù trong tháng ← **giá trị cần dự đoán** |
| 12 | Đơn giá |
| 13 | Thành tiền |

## 3. Kết quả test thuật toán

### 3.1. Algorithm V1 (gốc - mean × 30 + min_stock)
```python
avg_daily = total_out_90d / 90
forecast = avg_daily * 30
suggested = max(0, forecast + min_stock(2000) - current_stock)
```
- **Sai số trung bình: 172%** (rất cao)
- **3/7 SP đạt < 30% sai số** (43%)
- **Vấn đề**: mean bị kéo xuống bởi tháng consumption=0, min_stock=2000 quá lớn

### 3.2. Algorithm V2 (max 3 tháng × 1.2 buffer)
```python
max_monthly = max(consumption 3 tháng gần nhất)
forecast = max_monthly * 1.2  # safety buffer
suggested = max(0, forecast + min_stock(2000) - current_stock)
```
- **Sai số trung bình: 1461%** (tệ hơn do safety buffer cộng với min_stock)
- Vẫn còn vấn đề min_stock=2000 quá lớn

### 3.3. Algorithm V3 (max 3 tháng, min_stock scale theo consumption)
```python
max_monthly = max(consumption 3 tháng)
forecast = max_monthly
min_stock = max(int(max_monthly * 0.3), 200)  # scale theo nhu cầu
suggested = max(0, forecast + min_stock - current_stock)
```
- **Sai số trung bình: 163%** | **Median: 31.7%**
- **16/34 (47%) đạt < 30% sai số**
- **High consumption (>1000): 13/19 (68%) - TỐT cho kho chẵn**

### 3.4. Algorithm V4 (min_stock_floor = 50) ← **KHUYẾN NGHỊ**
```python
max_monthly = max(consumption 3 tháng)
forecast = max_monthly
min_stock = max(int(max_monthly * 0.3), 50)  # floor thấp
suggested = max(0, forecast + min_stock - current_stock)
```
- **Sai số trung bình: 58.1%** | **Median: 27.8%** ← **TỐT**
- **17/34 (50%) đạt < 30% sai số**
- **High consumption: 13/19 (68%) - RẤT TỐT**
- **Mid consumption: 4/7 (57%) - TỐT**

## 4. Phân tích theo tier consumption

| Tier | n | Mean err | Median err | < 30% | < 50% |
|------|---|----------|------------|-------|-------|
| Low (< 100) | 8 | 106% | 80% | 0/8 | 2/8 |
| Mid (100-1000) | 7 | 34% | 13% | 4/7 | 5/7 |
| High (> 1000) | 19 | 47% | 17% | 13/19 | 14/19 |

**Insight quan trọng**: 
- Algorithm **rất hiệu quả cho sản phẩm tiêu hao nhiều** (kho chẵn) - đây chính là mục tiêu chính của tính năng
- Với SP consumption thấp (< 100/tháng), BV thường dự trù rất chính xác theo nhu cầu thực tế (do mua theo đợt nhỏ), algorithm khó match

## 5. Phát hiện từ dữ liệu thật

1. **Layout Excel có 2 dạng** (11 cột vs 14 cột) → script extract cần detect
2. **Cột "Tồn tháng trước" trong file Excel KHÔNG đáng tin** - nhiều dòng ghi 0 nhưng BV chắc chắn có tồn
3. **BV có xu hướng dự trù thấp hơn forecast an toàn** - vì họ biết rõ nhu cầu + có tồn từ thầu cũ
4. **Một số SP có consumption dao động cực đoan** (tháng 300, tháng 20000) - cần thêm flag cảnh báo

## 6. Khuyến nghị cập nhật algorithm hiện tại

**Trong `ReplenishmentCalculator.ComputeAsync` (file `ReplenishmentHandlers.cs`)**:

```csharp
// THAY ĐỔI từ:
avgDailyOut = totalOut90d / 90m;
forecastNextMonth = avgDailyOut * 30m;
suggestedQty = Math.Max(0m, forecastNextMonth + product.MinStock - currentStock);

// THÀNH:
if (outCount >= 3)
{
    // Lấy max consumption 3 tháng (worst case) thay vì mean
    var maxMonthly = outboundMovements.OrderByDescending(m => m.PostedAt)
                                        .Take(3).Max(m => m.Quantity);
    forecastNextMonth = maxMonthly;
    var minStock = Math.Max(maxMonthly * 0.3m, 50m);  // floor thấp
    suggestedQty = Math.Max(0m, forecastNextMonth + minStock - currentStock);
}
```

## 7. Files output
- `apps/web/scripts/demo-data/forecast-raw.json` - extract lần 1 (chỉ layout A)
- `apps/web/scripts/demo-data/forecast-raw-v2.json` - extract chuẩn (cả A + B layout)
- File này: `apps/web/scripts/demo-data/FORECAST-REPORT.md`

## 8. Kết luận

✅ **Thuật toán forecast hoạt động hiệu quả cho mục tiêu chính**: dự trù kho chẵn (RECEIVING) với sản phẩm tiêu hao nhiều (> 1000/tháng) - đạt **68% độ chính xác trong vòng 30%**.

⚠️ **Hạn chế**: Với sản phẩm consumption thấp, BV dự trù thủ công tốt hơn algorithm - cần cho phép user **override** giá trị đề xuất trong UI.

💡 **Cải tiến tiếp theo**:
- Thêm UI cho phép chỉnh sửa `suggestedQty` trước khi lưu PR
- Hiển thị `confidence score` (low/mid/high) dựa trên std deviation
- Cảnh báo khi consumption dao động > 50% giữa các tháng
- Tracking actual vs forecast để cải tiến algorithm theo thời gian
