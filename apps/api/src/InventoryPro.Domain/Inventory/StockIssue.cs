namespace InventoryPro.Domain.Inventory;

using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;

public enum StockIssuePurpose
{
    Sale = 0,
    InternalUse = 1,
    Scrap = 2,
    Sample = 3,
    Gift = 4,
    TransferOut = 5,
    Adjustment = 6,
}

public class StockIssue : BranchScopedEntity
{
    public string IssueNumber { get; set; } = string.Empty;
    public Guid? PartyId { get; set; }
    public Guid WarehouseId { get; set; }
    public StockIssuePurpose Purpose { get; set; } = StockIssuePurpose.Sale;
    public DateTime IssueDate { get; set; } = DateTime.UtcNow.Date;
    public string? ReferenceNo { get; set; }
    public string? Notes { get; set; }
    public GoodsReceiptStatus Status { get; set; } = GoodsReceiptStatus.Draft;  // tái sử dụng enum
    public Guid? PostedBy { get; set; }
    public DateTime? PostedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }

    // Navigation
    public Party? Party { get; set; }
    public Warehouse? Warehouse { get; set; }
    public ICollection<StockIssueLine> Lines { get; set; } = new List<StockIssueLine>();
}

public class StockIssueLine : TenantScopedEntity
{
    public Guid StockIssueId { get; set; }
    public int LineNo { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public Guid LocationId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string UnitCode { get; set; } = string.Empty;
    public decimal Quantity { get; set; } = 0;
    public decimal UnitPrice { get; set; } = 0;
    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string? Notes { get; set; }
    public Guid? MovementId { get; set; }
    public GoodsReceiptLineStatus Status { get; set; } = GoodsReceiptLineStatus.Open;

    // Navigation
    public StockIssue? StockIssue { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
    public Location? Location { get; set; }
}
