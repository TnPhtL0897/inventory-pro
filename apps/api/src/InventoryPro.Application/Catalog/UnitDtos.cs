namespace InventoryPro.Application.Catalog;

public record UnitOfMeasureDto(
    Guid Id,
    string Code,
    string Name,
    string UnitType,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateUnitRequest(
    string Code,
    string Name,
    string? UnitType,
    bool IsActive = true);

public record UpdateUnitRequest(
    string? Code,
    string? Name,
    string? UnitType,
    bool? IsActive);
