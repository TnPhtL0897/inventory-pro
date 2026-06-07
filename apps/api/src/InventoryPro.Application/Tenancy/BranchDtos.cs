namespace InventoryPro.Application.Tenancy;

public record BranchDto(
    Guid Id,
    string Name,
    string Code,
    string? Address,
    string? Phone,
    bool IsDefault,
    string Status,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateBranchRequest(
    string Name,
    string Code,
    string? Address,
    string? Phone,
    bool IsDefault = false);

public record UpdateBranchRequest(
    string? Name,
    string? Code,
    string? Address,
    string? Phone,
    bool? IsDefault,
    string? Status);
