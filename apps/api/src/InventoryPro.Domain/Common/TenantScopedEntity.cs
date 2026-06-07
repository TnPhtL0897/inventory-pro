namespace InventoryPro.Domain.Common;

/// <summary>
/// Entity có tenant scope (multi-tenancy). Bắt buộc mọi nghiệp vụ entity đều kế thừa.
/// </summary>
public abstract class TenantScopedEntity : BaseEntity
{
    public Guid TenantId { get; set; }
}

/// <summary>
/// Entity scope theo tenant + branch (kho, stock, movements...).
/// </summary>
public abstract class BranchScopedEntity : TenantScopedEntity
{
    public Guid BranchId { get; set; }
}
