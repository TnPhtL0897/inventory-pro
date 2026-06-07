using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Tenancy;

public enum BranchStatus
{
    Active = 0,
    Inactive = 1,
    Closed = 2,
}

/// <summary>
/// Chi nhánh của tenant. Mỗi tenant có ít nhất 1 branch (main).
/// Kho/Stock/StockMovement đều scope theo branch.
/// </summary>
public class Branch : TenantScopedEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public bool IsDefault { get; set; } = false;
    public BranchStatus Status { get; set; } = BranchStatus.Active;
}
