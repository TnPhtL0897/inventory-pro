namespace InventoryPro.Application.Inventory.StockTakes;

public record StockTakeLineDto(
    Guid Id,
    int LineNo,
    Guid ProductId,
    string? ProductSku,
    string ProductName,
    Guid UnitId,
    string? UnitCode,
    Guid LocationId,
    string? LocationCode,
    string? BatchNo,
    string? SerialNo,
    decimal SystemQty,
    decimal? CountedQty,
    decimal Variance,
    decimal? UnitCost,
    string? Notes,
    Guid? AdjustMovementId,
    string Status);

public record StockTakeDto(
    Guid Id,
    string StockTakeNumber,
    Guid BranchId,
    Guid WarehouseId,
    string? WarehouseCode,
    DateTime StockTakeDate,
    string? Notes,
    string Status,
    Guid? CountedBy,
    DateTime? CountedAt,
    Guid? PostedBy,
    DateTime? PostedAt,
    string? CancelReason,
    int LineCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// Snapshot stock theo (warehouse, location, product, batch, serial) khi tạo phiếu kiểm kê.
/// Mỗi dòng tương ứng 1 SKU tại 1 vị trí, có system_qty lưu từ bảng stock.
/// </summary>
public record CreateStockTakeRequest(
    Guid BranchId,
    Guid WarehouseId,
    DateTime StockTakeDate,
    string? Notes,
    /// <summary>Nếu null/empty, sẽ auto-snapshot tất cả stock trong warehouse này.</summary>
    List<CreateStockTakeLineRequest>? Lines);

public record CreateStockTakeLineRequest(
    Guid ProductId,
    Guid UnitId,
    Guid LocationId,
    string? BatchNo,
    string? SerialNo);

public record UpdateStockTakeCountedQtyRequest(
    Guid LineId,
    decimal? CountedQty,
    string? Notes);

public record BulkUpdateCountedQtyRequest(
    List<UpdateStockTakeCountedQtyRequest> Updates);

public record CancelStockTakeRequest(string Reason);
