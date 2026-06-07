using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Gói thầu. Có thể chia thành nhiều lô/phần (BidLot).
/// Ví dụ: "Gói thầu mua sắm VTTH năm 2026" gồm 3 lô: Bút+Giấy, Mực in, Hóa chất.
/// </summary>
public class BidPackage : TenantScopedEntity
{
    public Guid? BidPlanId { get; set; }
    public string PackageNo { get; set; } = string.Empty;
    public string PackageName { get; set; } = string.Empty;
    public BidPackageType BidPackageType { get; set; } = BidPackageType.Open;
    public BidPackageStatus BidPackageStatus { get; set; } = BidPackageStatus.Draft;
    public DateTime? PublishDate { get; set; }
    public DateTime? BidOpenDate { get; set; }
    public DateTime? BidCloseDate { get; set; }
    public decimal? TotalEstimatedValue { get; set; }
    public string? ProcurementMethod { get; set; }
    public string? DecisionNo { get; set; }  // Số QĐ phê duyệt gói thầu
    public DateTime? DecisionDate { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedBy { get; set; }

    // Navigation
    public BidPlan? BidPlan { get; set; }
    public ICollection<BidLot> Lots { get; set; } = new List<BidLot>();
}
