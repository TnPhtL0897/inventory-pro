namespace InventoryPro.Domain.Inventory;

using InventoryPro.Domain.Common;

/// <summary>
/// Trạng thái kho.
/// </summary>
public enum WarehouseStatus
{
    Active = 0,
    Inactive = 1,
    Closed = 2,
}

/// <summary>
/// Loại kho theo mục đích sử dụng.
/// - Receiving: kho chẵn - nhận hàng từ NCC (qua GRN). Không cho phép Issue.
/// - Issue:     kho lẻ   - sử dụng nội bộ (qua phiếu xuất). Không cho phép GRN.
/// </summary>
public enum WarehouseType
{
    Receiving = 0,
    Issue = 1,
}

/// <summary>
/// Kho vật lý. Scope theo branch.
/// </summary>
public class Warehouse : BranchScopedEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public Guid? ManagerId { get; set; }
    public bool IsDefault { get; set; } = false;
    public bool AllowNegative { get; set; } = false;
    public WarehouseStatus Status { get; set; } = WarehouseStatus.Active;
    public WarehouseType Type { get; set; } = WarehouseType.Receiving;
    public string Attributes { get; set; } = "{}";  // JSONB

    // Navigation
    public ICollection<Location> Locations { get; set; } = new List<Location>();
}
