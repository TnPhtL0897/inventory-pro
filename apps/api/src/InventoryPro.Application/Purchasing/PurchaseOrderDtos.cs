namespace InventoryPro.Application.Purchasing;

public record PurchaseOrderLineDto(
    Guid Id,
    int LineNo,
    Guid ProductId,
    string? ProductSku,
    string ProductName,
    Guid UnitId,
    string UnitCode,
    decimal Quantity,
    decimal ReceivedQty,
    decimal UnitPrice,
    decimal DiscountPct,
    decimal TaxPct,
    decimal LineTotal,
    string Status,
    string? Notes);

public record PurchaseOrderDto(
    Guid Id,
    string PoNumber,
    Guid BranchId,
    Guid PartyId,
    string? PartyName,
    string? PartyCode,
    DateTime OrderDate,
    DateTime? ExpectedDate,
    string Currency,
    decimal ExchangeRate,
    decimal Subtotal,
    decimal DiscountAmount,
    decimal TaxAmount,
    decimal ShippingAmount,
    decimal Total,
    decimal PaidAmount,
    string Status,
    int PaymentTerms,
    string? ShippingAddress,
    string? Notes,
    string? InternalNotes,
    Guid? ApprovedBy,
    DateTime? ApprovedAt,
    Guid? PostedBy,
    DateTime? PostedAt,
    DateTime? CompletedAt,
    DateTime? CancelledAt,
    string? CancelReason,
    int LineCount,
    // Thông tin thầu (mới)
    Guid? BidContractId,
    string? BidContractNo,
    decimal? BidContractValue,
    decimal? BidContractUsedValue,
    decimal? BidContractRemainingValue,
    DateTime? BidContractEndDate,
    int? BidContractDaysToExpiry,
    Guid? BidLotId,
    string? BidLotName,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreatePurchaseOrderLineRequest(
    Guid ProductId,
    Guid UnitId,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountPct = 0,
    decimal TaxPct = 0,
    string? Notes = null);

public record CreatePurchaseOrderRequest(
    Guid BranchId,
    Guid PartyId,
    DateTime OrderDate,
    DateTime? ExpectedDate,
    string? Currency,
    decimal? ExchangeRate,
    decimal? DiscountAmount,
    decimal? ShippingAmount,
    int? PaymentTerms,
    string? ShippingAddress,
    string? Notes,
    string? InternalNotes,
    // BẮT BUỘC: Mỗi PO phải gắn với 1 HĐ thầu
    Guid BidContractId,
    Guid? BidLotId,
    List<CreatePurchaseOrderLineRequest> Lines);

public record UpdatePurchaseOrderRequest(
    Guid PartyId,
    DateTime OrderDate,
    DateTime? ExpectedDate,
    decimal? DiscountAmount,
    decimal? ShippingAmount,
    string? ShippingAddress,
    string? Notes,
    string? InternalNotes,
    List<CreatePurchaseOrderLineRequest>? Lines);

public record ApprovePurchaseOrderRequest(string? Notes);
public record CancelPurchaseOrderRequest(string Reason);
