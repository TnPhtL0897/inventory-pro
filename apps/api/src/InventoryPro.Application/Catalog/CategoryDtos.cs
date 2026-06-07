namespace InventoryPro.Application.Catalog;

public record CategoryDto(
    Guid Id,
    Guid? ParentId,
    string Name,
    string Code,
    string? Description,
    int SortOrder,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateCategoryRequest(
    Guid? ParentId,
    string Name,
    string Code,
    string? Description,
    int SortOrder = 0,
    bool IsActive = true);

public record UpdateCategoryRequest(
    Guid? ParentId,
    string? Name,
    string? Code,
    string? Description,
    int? SortOrder,
    bool? IsActive);
