namespace InventoryPro.Application.Inventory.Issues;

public record StockIssueLineDto(
    Guid Id,
    int LineNo,
    Guid ProductId,
    string? ProductSku,
    string ProductName,
    Guid UnitId,
    string UnitCode,
    Guid LocationId,
    string? LocationCode,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes,
    Guid? MovementId,
    string Status);

public record StockIssueDto(
    Guid Id,
    string IssueNumber,
    Guid BranchId,
    Guid? PartyId,
    string? PartyName,
    Guid WarehouseId,
    string? WarehouseCode,
    string Purpose,
    DateTime IssueDate,
    string? ReferenceNo,
    string? Notes,
    string Status,
    Guid? PostedBy,
    DateTime? PostedAt,
    int LineCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateIssueLineRequest(
    Guid ProductId,
    Guid UnitId,
    Guid LocationId,
    decimal Quantity,
    decimal UnitPrice,
    string? BatchNo,
    string? SerialNo,
    DateTime? ExpiryDate,
    string? Notes);

public record CreateStockIssueRequest(
    Guid BranchId,
    Guid? PartyId,
    Guid WarehouseId,
    string Purpose,
    DateTime IssueDate,
    string? ReferenceNo,
    string? Notes,
    List<CreateIssueLineRequest> Lines,
    List<Guid> IdempotencyKeys);

public record UpdateStockIssueRequest(
    Guid? PartyId,
    DateTime IssueDate,
    string? ReferenceNo,
    string? Notes,
    List<CreateIssueLineRequest> Lines,
    List<Guid> IdempotencyKeys);

public record CancelStockIssueRequest(string Reason);
