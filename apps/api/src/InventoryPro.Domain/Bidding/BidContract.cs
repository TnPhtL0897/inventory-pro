using InventoryPro.Domain.Common;
using InventoryPro.Domain.Parties;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Hợp đồng thầu đã ký với nhà thầu trúng. Mỗi PO phải link tới 1 HĐ thầu.
/// used_value tự cập nhật từ GRN (trigger DB).
/// </summary>
public class BidContract : TenantScopedEntity
{
    public Guid BidLotId { get; set; }
    public string ContractNo { get; set; } = string.Empty;
    public string? ContractName { get; set; }
    public Guid WinningPartyId { get; set; }
    public decimal ContractValue { get; set; }
    public DateTime ContractStartDate { get; set; }
    public DateTime ContractEndDate { get; set; }
    public decimal UsedValue { get; set; } = 0;
    public BidContractStatus BidContractStatus { get; set; } = BidContractStatus.Active;
    public int? PaymentTerms { get; set; }
    public decimal? AdvancePaymentPct { get; set; }
    public decimal? RetentionPct { get; set; }
    public int? WarrantyMonths { get; set; }
    public DateTime? SigningDate { get; set; }
    public string? Notes { get; set; }
    public Guid? CreatedBy { get; set; }

    // Computed
    public decimal RemainingValue => ContractValue - UsedValue;
    public int DaysToExpiry => (int)(ContractEndDate - DateTime.UtcNow.Date).TotalDays;

    // Navigation
    public BidLot? BidLot { get; set; }
    public Party? WinningParty { get; set; }
}
