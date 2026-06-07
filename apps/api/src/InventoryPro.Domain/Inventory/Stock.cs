namespace InventoryPro.Domain.Inventory;

using InventoryPro.Domain.Common;

/// <summary>
/// Tồn kho hiện tại (materialized từ stock_movements). Composite PK + concurrency token.
/// </summary>
public class Stock : BranchScopedEntity
{
    public Guid WarehouseId { get; set; }
    public Guid LocationId { get; set; }
    public Guid ProductId { get; set; }
    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }
    public decimal Quantity { get; set; } = 0;
    public decimal ReservedQty { get; set; } = 0;
    public decimal AvgCost { get; set; } = 0;
    public DateTime? LastMovementAt { get; set; }

    /// <summary>Optimistic locking token. Tăng mỗi lần update qua trigger.</summary>
    public int Version { get; set; } = 0;

    // Navigation
    public Warehouse? Warehouse { get; set; }
    public Location? Location { get; set; }
    public Catalog.Product? Product { get; set; }
}
