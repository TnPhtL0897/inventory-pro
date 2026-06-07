namespace InventoryPro.Domain.Inventory;

using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Common;

/// <summary>
/// Loại movement. Cùng value với SQL enum stock_movement_type.
/// </summary>
public enum StockMovementType
{
    IN = 0,
    OUT = 1,
    TRANSFER_IN = 2,
    TRANSFER_OUT = 3,
    ADJUST_IN = 4,
    ADJUST_OUT = 5,
    RETURN_IN = 6,
    RETURN_OUT = 7,
}

public enum StockMovementStatus
{
    Pending = 0,
    Posted = 1,
    Reversed = 2,
    Cancelled = 3,
}

public enum StockReferenceType
{
    Manual = 0,
    Grn = 1,
    Issue = 2,
    Transfer = 3,
    StockTake = 4,
    SaleReturn = 5,
    PurchaseReturn = 6,
}

/// <summary>
/// Append-only event log mọi thay đổi tồn. Composite PK (id, created_at) do partition theo created_at.
/// </summary>
public class StockMovement : BranchScopedEntity
{
    public Guid WarehouseId { get; set; }
    public Guid LocationId { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public StockMovementType MovementType { get; set; }
    public StockMovementStatus Status { get; set; } = StockMovementStatus.Posted;
    public decimal Quantity { get; set; }                    // số dương (>0); dấu suy ra từ MovementType
    public decimal? UnitCost { get; set; }
    public StockReferenceType RefType { get; set; } = StockReferenceType.Manual;
    public Guid? RefId { get; set; }
    public Guid? RefLineId { get; set; }
    public string? Notes { get; set; }
    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public Guid IdempotencyKey { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime PostedAt { get; set; } = DateTime.UtcNow;
    public string Metadata { get; set; } = "{}";

    // FK tới lô thầu (auto-fill từ GRN). Dùng để truy vết kiểm toán.
    public Guid? BidLotId { get; set; }

    // Navigation
    public Warehouse? Warehouse { get; set; }
    public Location? Location { get; set; }
    public Catalog.Product? Product { get; set; }
    public Catalog.UnitOfMeasure? Unit { get; set; }
    public Bidding.BidLot? BidLot { get; set; }
}
