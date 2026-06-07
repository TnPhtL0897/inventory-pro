using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Replenishment;

/// <summary>
/// Lịch sử 1 lần chạy dự trù cuối tháng cho kho chẵn (RECEIVING).
/// Idempotent: 1 record / (tenant, fiscal_year, fiscal_month) - enforced bởi DB UNIQUE constraint.
/// Algorithm (xem Application.Replenishment.ReplenishmentHandlers):
///   1. Tính tồn kho hiện tại từ stock (materialized)
///   2. Tính consumption 3 tháng gần nhất từ stock_movements OUT/TransferOut/Issue
///   3. Forecast tháng tới = avg_daily_out × 30
///   4. Đề xuất = max(0, forecast + min_stock - tồn). Fallback: max_stock - tồn.
///   5. Match với BidContract ACTIVE cùng product category (nếu có)
///   6. Nếu SaveAsPurchaseRequest = true → tạo 1 PR DRAFT gom tất cả lines
/// </summary>
public class MonthEndForecastRun : TenantScopedEntity
{
    public ReplenishmentRunType RunType { get; set; } = ReplenishmentRunType.Manual;
    public int FiscalYear { get; set; }
    public int FiscalMonth { get; set; }  // 1..12
    public DateTime AsOfDate { get; set; }

    /// <summary>User bấm tay; null nếu SCHEDULED.</summary>
    public Guid? TriggeredByUser { get; set; }

    public ReplenishmentRunStatus Status { get; set; } = ReplenishmentRunStatus.Completed;

    /// <summary>Số kho RECEIVING trong tenant được xét.</summary>
    public int WarehouseCount { get; set; }

    /// <summary>Số sản phẩm được đề xuất bổ sung.</summary>
    public int ProductCount { get; set; }

    /// <summary>Tổng giá trị ước tính (sum SuggestedReplenishQty × LastUnitCost).</summary>
    public decimal TotalEstimatedValue { get; set; }

    /// <summary>Danh sách ID PurchaseRequest DRAFT được tạo từ run này.</summary>
    public List<Guid> CreatedPurchaseRequestIds { get; set; } = new();

    /// <summary>Thông báo lỗi nếu Status = Failed.</summary>
    public string? ErrorMessage { get; set; }
}
