namespace InventoryPro.Application.Replenishment;

// =============================================================================
// DỰ TRÙ CUỐI THÁNG (MONTH-END REPLENISHMENT FORECASTING)
// =============================================================================

/// <summary>
/// 1 dòng đề xuất bổ sung cho 1 sản phẩm.
/// </summary>
public record ForecastLineDto(
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid UnitId,
    string UnitCode,

    /// <summary>Tồn kho hiện tại (gộp tất cả locations trong các kho RECEIVING).</summary>
    decimal CurrentStock,

    decimal MinStock,
    decimal? MaxStock,

    /// <summary>Trung bình xuất / ngày (90 ngày gần nhất).</summary>
    decimal AvgDailyOut,

    /// <summary>Forecast xuất trong tháng tới = AvgDailyOut × 30.</summary>
    decimal ForecastNextMonth,

    /// <summary>Số lượng đề xuất bổ sung (đã làm tròn).</summary>
    decimal SuggestedReplenishQty,

    /// <summary>Đơn giá ước tính (lấy từ CostPrice của Product).</summary>
    decimal EstimatedUnitPrice,

    /// <summary>= SuggestedReplenishQty × EstimatedUnitPrice.</summary>
    decimal EstimatedTotal,

    /// <summary>HĐ thầu ACTIVE được gợi ý (null nếu không có HĐ phù hợp).</summary>
    Guid? BidContractId,
    string? BidContractNo,
    Guid? BidLotId,
    string? BidLotName,

    /// <summary>Lý do đề xuất: "Trend 3 tháng", "Fallback max_stock", "Tồn > forecast"...</summary>
    string Reason);

/// <summary>
/// Kết quả preview forecast (dry-run, không save gì cả).
/// </summary>
public record ForecastPreviewDto(
    Guid TenantId,
    DateTime AsOfDate,
    int FiscalYear,
    int FiscalMonth,
    int WarehouseCount,
    int ProductCount,
    decimal TotalEstimatedValue,
    List<ForecastLineDto> Lines);

/// <summary>
/// Request body cho POST /preview và POST /run.
/// </summary>
public record RunReplenishmentRequest(
    int FiscalYear,
    int FiscalMonth,
    DateTime? AsOfDate,
    bool SaveAsPurchaseRequest,
    string? Notes);

/// <summary>
/// DTO trả về cho 1 lần chạy dự trù (dùng cho GET /runs).
/// </summary>
public record MonthEndForecastRunDto(
    Guid Id,
    string RunType,           // "Manual" | "Scheduled"
    int FiscalYear,
    int FiscalMonth,
    DateTime AsOfDate,
    Guid? TriggeredByUser,
    string Status,            // "Completed" | "Failed"
    int WarehouseCount,
    int ProductCount,
    decimal TotalEstimatedValue,
    List<Guid> CreatedPurchaseRequestIds,
    string? ErrorMessage,
    DateTime CreatedAt);
