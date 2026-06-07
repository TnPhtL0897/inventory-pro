namespace InventoryPro.Application.Inventory.Stock;

public record StockLevelDto(
    Guid ProductId,
    string ProductSku,
    string ProductName,
    string? BaseUnitCode,
    Guid BranchId,
    Guid WarehouseId,
    string WarehouseCode,
    Guid LocationId,
    string LocationCode,
    string? BatchNo,
    string? SerialNo,
    decimal Quantity,
    decimal ReservedQty,
    decimal AvailableQty,
    decimal AvgCost,
    DateTime? LastMovementAt);

public record RecordMovementRequest(
    Guid BranchId,
    Guid WarehouseId,
    Guid LocationId,
    Guid ProductId,
    Guid UnitId,
    string MovementType,        // IN, OUT, TRANSFER_IN, ...
    decimal Quantity,
    decimal? UnitCost,
    string? Notes,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate);

public record StockMovementDto(
    Guid Id,
    Guid BranchId,
    Guid WarehouseId,
    Guid LocationId,
    Guid ProductId,
    string? ProductSku,
    string? ProductName,
    Guid UnitId,
    string MovementType,
    decimal Quantity,
    decimal? UnitCost,
    string RefType,
    Guid? RefId,
    string? Notes,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    Guid IdempotencyKey,
    DateTime PostedAt);
