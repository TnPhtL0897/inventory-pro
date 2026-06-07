namespace InventoryPro.Domain.Inventory;

using InventoryPro.Domain.Common;

/// <summary>
/// Phân loại vị trí trong kho.
/// </summary>
public enum LocationType
{
    Receiving = 0,
    Storage = 1,
    Picking = 2,
    Packing = 3,
    Shipping = 4,
    Quarantine = 5,
    Transit = 6,
    Return = 7,
}

public enum LocationStatus
{
    Active = 0,
    Inactive = 1,
    Blocked = 2,
}

/// <summary>
/// Vị trí / bin trong warehouse. Có thể lồng nhau (zone > aisle > shelf > bin).
/// </summary>
public class Location : BranchScopedEntity
{
    public Guid WarehouseId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public LocationType LocationType { get; set; } = LocationType.Storage;
    public decimal? CapacityVolume { get; set; }
    public decimal? CapacityWeight { get; set; }
    public decimal? MaxQtyHint { get; set; }
    public int PickSequence { get; set; } = 0;
    public bool IsPickable { get; set; } = true;
    public LocationStatus Status { get; set; } = LocationStatus.Active;
    public string Attributes { get; set; } = "{}";

    // Navigation
    public Warehouse? Warehouse { get; set; }
    public Location? Parent { get; set; }
    public ICollection<Location> Children { get; set; } = new List<Location>();
}
