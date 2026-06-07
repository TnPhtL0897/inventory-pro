namespace InventoryPro.Application.Purchasing;

public record GoodsReceiptLineDto(
    Guid Id,
    int LineNo,
    Guid? PoLineId,
    Guid ProductId,
    string? ProductSku,
    string ProductName,
    Guid UnitId,
    string UnitCode,
    Guid LocationId,
    string? LocationCode,
    decimal Quantity,
    decimal UnitCost,
    decimal LineTotal,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes,
    Guid? MovementId,
    string Status);

public record GoodsReceiptDto(
    Guid Id,
    string GrnNumber,
    Guid BranchId,
    Guid? PurchaseOrderId,
    string? PoNumber,
    Guid PartyId,
    string? PartyName,
    string? PartyCode,
    Guid WarehouseId,
    string? WarehouseCode,
    DateTime ReceiptDate,
    string? SupplierInvoiceNo,
    DateTime? SupplierInvoiceDate,
    string? Notes,
    string Status,
    Guid? PostedBy,
    DateTime? PostedAt,
    int LineCount,
    // Thông tin thầu (mới)
    Guid? BidContractId,
    string? BidContractNo,
    Guid? BidLotId,
    string? BidLotName,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateGrnLineRequest(
    Guid? PoLineId,
    Guid ProductId,
    Guid UnitId,
    Guid LocationId,
    decimal Quantity,
    decimal UnitCost,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes);

public record CreateGoodsReceiptRequest(
    Guid BranchId,
    Guid? PurchaseOrderId,
    Guid PartyId,
    Guid WarehouseId,
    DateTime ReceiptDate,
    string? SupplierInvoiceNo,
    DateTime? SupplierInvoiceDate,
    string? Notes,
    List<CreateGrnLineRequest> Lines,
    // Idempotency keys cho từng dòng (client cung cấp)
    List<Guid> IdempotencyKeys);

public record UpdateGoodsReceiptRequest(
    DateTime ReceiptDate,
    string? SupplierInvoiceNo,
    DateTime? SupplierInvoiceDate,
    string? Notes,
    List<CreateGrnLineRequest> Lines,
    List<Guid> IdempotencyKeys);

public record CancelGoodsReceiptRequest(string Reason);
