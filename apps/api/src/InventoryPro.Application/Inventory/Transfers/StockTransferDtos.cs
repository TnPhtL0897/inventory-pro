namespace InventoryPro.Application.Inventory.Transfers;

public record StockTransferLineDto(
    Guid Id,
    int LineNo,
    Guid ProductId,
    string? ProductSku,
    string ProductName,
    Guid UnitId,
    string? UnitCode,
    Guid FromLocationId,
    string? FromLocationCode,
    Guid ToLocationId,
    string? ToLocationCode,
    decimal Quantity,
    decimal ShippedQty,
    decimal ReceivedQty,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes,
    Guid? OutMovementId,
    Guid? InMovementId,
    string Status);

public record StockTransferDto(
    Guid Id,
    string TransferNumber,
    Guid FromBranchId,
    Guid FromWarehouseId,
    string? FromWarehouseCode,
    Guid ToBranchId,
    Guid ToWarehouseId,
    string? ToWarehouseCode,
    DateTime TransferDate,
    DateTime? ExpectedReceiptDate,
    string? Notes,
    string Status,
    Guid? OutShippedBy,
    DateTime? OutShippedAt,
    Guid? InReceivedBy,
    DateTime? InReceivedAt,
    string? CancelReason,
    int LineCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateStockTransferLineRequest(
    Guid ProductId,
    Guid UnitId,
    Guid FromLocationId,
    Guid ToLocationId,
    decimal Quantity,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes,
    Guid IdempotencyKey);

public record CreateStockTransferRequest(
    Guid FromBranchId,
    Guid FromWarehouseId,
    Guid ToBranchId,
    Guid ToWarehouseId,
    DateTime TransferDate,
    DateTime? ExpectedReceiptDate,
    string? Notes,
    List<CreateStockTransferLineRequest> Lines);

public record UpdateStockTransferRequest(
    DateTime? TransferDate,
    DateTime? ExpectedReceiptDate,
    string? Notes,
    List<CreateStockTransferLineRequest>? Lines);

public record ReceiveStockTransferLineRequest(
    Guid LineId,
    decimal ReceivedQty);

public record ReceiveStockTransferRequest(
    List<ReceiveStockTransferLineRequest> Lines,
    string? Notes);
