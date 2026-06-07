using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Dự trù mua sắm từ khoa/phòng. Sau khi approve có thể gom vào KHĐT + gói thầu.
/// Branch-scoped: mỗi khoa/phòng (branch) tạo dự trù riêng.
/// </summary>
public class PurchaseRequest : BranchScopedEntity
{
    public Guid? BidPlanId { get; set; }
    public string PrNumber { get; set; } = string.Empty;
    public string RequestDept { get; set; } = string.Empty;
    public Guid? RequesterId { get; set; }
    public int? FiscalYear { get; set; }
    public PurchaseRequestStatus Status { get; set; } = PurchaseRequestStatus.Draft;
    public DateTime RequestedDate { get; set; } = DateTime.UtcNow.Date;
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedBy { get; set; }

    // Navigation
    public BidPlan? BidPlan { get; set; }
    public ICollection<PurchaseRequestLine> Lines { get; set; } = new List<PurchaseRequestLine>();
}

/// <summary>
/// Dòng vật tư trong dự trù. Lưu productId, số lượng, đơn giá dự kiến.
/// </summary>
public class PurchaseRequestLine : TenantScopedEntity
{
    public Guid PurchaseRequestId { get; set; }
    public Guid ProductId { get; set; }
    public decimal Quantity { get; set; }
    public Guid UnitId { get; set; }
    public decimal? EstimatedUnitPrice { get; set; }
    public string? Notes { get; set; }

    // Navigation
    public PurchaseRequest? PurchaseRequest { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
}
