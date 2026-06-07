namespace InventoryPro.Application.Bidding;

// =============================================================================
// BID PLAN
// =============================================================================
public record BidPlanDto(
    Guid Id,
    string PlanNo,
    int FiscalYear,
    string Title,
    decimal? TotalEstimatedValue,
    string Status,
    Guid? ApprovedBy,
    DateTime? ApprovedAt,
    string? Notes,
    int PackageCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateBidPlanRequest(
    int FiscalYear,
    string Title,
    decimal? TotalEstimatedValue,
    string? Notes);

public record UpdateBidPlanRequest(
    string Title,
    decimal? TotalEstimatedValue,
    string? Notes);

public record ApproveBidPlanRequest(string? Notes);

// =============================================================================
// PURCHASE REQUEST
// =============================================================================
public record PurchaseRequestLineDto(
    Guid Id,
    Guid ProductId,
    string? ProductSku,
    string? ProductName,
    Guid UnitId,
    string? UnitCode,
    decimal Quantity,
    decimal? EstimatedUnitPrice,
    decimal? EstimatedTotal,
    string? Notes);

public record PurchaseRequestDto(
    Guid Id,
    string PrNumber,
    Guid BranchId,
    string? BranchName,
    Guid? BidPlanId,
    string? BidPlanNo,
    string RequestDept,
    Guid? RequesterId,
    int? FiscalYear,
    string Status,
    DateTime RequestedDate,
    Guid? ApprovedBy,
    DateTime? ApprovedAt,
    string? Notes,
    List<PurchaseRequestLineDto> Lines,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreatePurchaseRequestLineRequest(
    Guid ProductId,
    Guid UnitId,
    decimal Quantity,
    decimal? EstimatedUnitPrice,
    string? Notes);

public record CreatePurchaseRequestRequest(
    Guid BranchId,
    Guid? BidPlanId,
    string RequestDept,
    int? FiscalYear,
    DateTime? RequestedDate,
    string? Notes,
    List<CreatePurchaseRequestLineRequest> Lines);

public record UpdatePurchaseRequestRequest(
    string RequestDept,
    string? Notes,
    List<CreatePurchaseRequestLineRequest> Lines);

public record SubmitPurchaseRequestRequest();
public record ApprovePurchaseRequestRequest(string? Notes);

// =============================================================================
// BID PACKAGE
// =============================================================================
public record BidPackageDto(
    Guid Id,
    string PackageNo,
    string PackageName,
    Guid? BidPlanId,
    string? BidPlanNo,
    string BidPackageType,
    string BidPackageStatus,
    DateTime? PublishDate,
    DateTime? BidOpenDate,
    DateTime? BidCloseDate,
    decimal? TotalEstimatedValue,
    string? ProcurementMethod,
    string? DecisionNo,
    DateTime? DecisionDate,
    string? Notes,
    int LotCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateBidPackageRequest(
    string PackageName,
    Guid? BidPlanId,
    string BidPackageType,
    DateTime? PublishDate,
    DateTime? BidOpenDate,
    DateTime? BidCloseDate,
    decimal? TotalEstimatedValue,
    string? ProcurementMethod,
    string? DecisionNo,
    DateTime? DecisionDate,
    string? Notes);

public record UpdateBidPackageRequest(
    string PackageName,
    DateTime? PublishDate,
    DateTime? BidOpenDate,
    DateTime? BidCloseDate,
    decimal? TotalEstimatedValue,
    string? ProcurementMethod,
    string? DecisionNo,
    DateTime? DecisionDate,
    string? Notes);

public record PublishBidPackageRequest(DateTime PublishDate, DateTime? BidOpenDate, DateTime? BidCloseDate);

// =============================================================================
// BID LOT
// =============================================================================
public record BidLotLineDto(
    Guid Id,
    Guid ProductId,
    string? ProductSku,
    string? ProductName,
    Guid UnitId,
    string? UnitCode,
    decimal Quantity,
    decimal? EstimatedUnitPrice,
    decimal? EstimatedTotal,
    string? Notes);

public record BidBidderDto(
    Guid Id,
    Guid PartyId,
    string? PartyName,
    string? PartyCode,
    decimal? BidPrice,
    DateTime? BidDate,
    bool IsWinner,
    int? Rank,
    decimal? EvaluationScore,
    string? Notes);

public record BidLotDto(
    Guid Id,
    string LotNo,
    string LotName,
    Guid BidPackageId,
    string? BidPackageNo,
    string BidLotStatus,
    string? ProductCategory,
    decimal? EstimatedValue,
    decimal? QuantityTotal,
    string? Unit,
    Guid? AwardedBidderId,
    string? AwardedBidderName,
    decimal? AwardedValue,
    DateTime? AwardedDate,
    string? DecisionNo,
    Guid? ContractId,
    string? ContractNo,
    List<BidLotLineDto> Lines,
    List<BidBidderDto> Bidders,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateBidLotLineRequest(
    Guid ProductId,
    Guid UnitId,
    decimal Quantity,
    decimal? EstimatedUnitPrice,
    string? Notes);

public record CreateBidLotRequest(
    string LotNo,
    string LotName,
    Guid BidPackageId,
    string? ProductCategory,
    decimal? EstimatedValue,
    decimal? QuantityTotal,
    string? Unit,
    List<CreateBidLotLineRequest> Lines);

public record UpdateBidLotRequest(
    string LotName,
    string? ProductCategory,
    decimal? EstimatedValue,
    decimal? QuantityTotal,
    string? Unit,
    List<CreateBidLotLineRequest>? Lines);

public record PublishBidLotRequest();
public record AddBidderRequest(Guid PartyId, decimal? BidPrice, DateTime? BidDate, decimal? EvaluationScore, int? Rank, string? Notes);
public record AwardBidLotRequest(Guid BidderId, decimal AwardedValue, DateTime AwardedDate, string? DecisionNo);

// =============================================================================
// BID CONTRACT
// =============================================================================
public record BidContractDto(
    Guid Id,
    string ContractNo,
    string? ContractName,
    Guid BidLotId,
    string? LotNo,
    string? LotName,
    Guid WinningPartyId,
    string? WinningPartyName,
    string? WinningPartyCode,
    decimal ContractValue,
    DateTime ContractStartDate,
    DateTime ContractEndDate,
    decimal UsedValue,
    decimal RemainingValue,
    int DaysToExpiry,
    string BidContractStatus,
    int? PaymentTerms,
    decimal? AdvancePaymentPct,
    decimal? RetentionPct,
    int? WarrantyMonths,
    DateTime? SigningDate,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateBidContractRequest(
    Guid BidLotId,
    string ContractNo,
    string? ContractName,
    Guid WinningPartyId,
    decimal ContractValue,
    DateTime ContractStartDate,
    DateTime ContractEndDate,
    int? PaymentTerms,
    decimal? AdvancePaymentPct,
    decimal? RetentionPct,
    int? WarrantyMonths,
    DateTime? SigningDate,
    string? Notes);

public record UpdateBidContractRequest(
    string? ContractName,
    decimal ContractValue,
    DateTime ContractStartDate,
    DateTime ContractEndDate,
    int? PaymentTerms,
    decimal? AdvancePaymentPct,
    decimal? RetentionPct,
    int? WarrantyMonths,
    DateTime? SigningDate,
    string? Notes);

public record TerminateBidContractRequest(string Reason);

// =============================================================================
// LOOKUP - dùng cho dropdown tạo PO
// =============================================================================
public record BidContractLookupDto(
    Guid Id,
    string ContractNo,
    string? ContractName,
    Guid BidLotId,
    string? LotNo,
    string? LotName,
    Guid WinningPartyId,
    string WinningPartyName,
    string WinningPartyCode,
    decimal ContractValue,
    decimal UsedValue,
    decimal RemainingValue,
    DateTime ContractStartDate,
    DateTime ContractEndDate,
    int DaysToExpiry,
    string Status);
