using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Kế hoạch đấu thầu năm. Gom các gói thầu dự kiến trong năm tài chính.
/// Tenant-scoped: mỗi tenant có KHĐT riêng cho từng năm.
/// </summary>
public class BidPlan : TenantScopedEntity
{
    public string PlanNo { get; set; } = string.Empty;
    public int FiscalYear { get; set; }
    public string Title { get; set; } = string.Empty;
    public decimal? TotalEstimatedValue { get; set; }
    public string Status { get; set; } = "DRAFT"; // DRAFT, APPROVED, IN_PROGRESS, CLOSED
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedBy { get; set; }

    // Navigation
    public ICollection<BidPackage> Packages { get; set; } = new List<BidPackage>();
}
