namespace InventoryPro.Application.Inventory.Warehouses;

public record WarehouseDto(
    Guid Id,
    Guid BranchId,
    string Name,
    string Code,
    string? Address,
    string? Phone,
    Guid? ManagerId,
    bool IsDefault,
    bool AllowNegative,
    string Status,
    string Type,
    int LocationCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateWarehouseRequest(
    Guid BranchId,
    string Name,
    string Code,
    string? Address,
    string? Phone,
    Guid? ManagerId,
    bool IsDefault = false,
    bool AllowNegative = false,
    string? Type = null);

public record UpdateWarehouseRequest(
    string? Name,
    string? Code,
    string? Address,
    string? Phone,
    Guid? ManagerId,
    bool? IsDefault,
    bool? AllowNegative,
    string? Status,
    string? Type = null);

public record LocationDto(
    Guid Id,
    Guid WarehouseId,
    Guid? ParentId,
    string Name,
    string Code,
    string? Barcode,
    string LocationType,
    string Status,
    bool IsPickable,
    int PickSequence);

public record CreateLocationRequest(
    Guid WarehouseId,
    Guid? ParentId,
    string Name,
    string Code,
    string? Barcode,
    string? LocationType,
    int PickSequence = 0,
    bool IsPickable = true);

public record UpdateLocationRequest(
    string? Name,
    string? Code,
    string? Barcode,
    string? LocationType,
    int? PickSequence,
    bool? IsPickable,
    string? Status);
