using InventoryPro.Domain.Common;
using InventoryPro.Domain.Parties;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Nhà thầu tham gia dự thầu từng lô. Mỗi lô có nhiều bidder, 1 winner được chấm.
/// </summary>
public class BidBidder : TenantScopedEntity
{
    public Guid BidLotId { get; set; }
    public Guid PartyId { get; set; }
    public decimal? BidPrice { get; set; }
    public DateTime? BidDate { get; set; }
    public bool IsWinner { get; set; } = false;
    public int? Rank { get; set; }                  // 1, 2, 3 (xếp hạng)
    public decimal? EvaluationScore { get; set; }   // 0-100
    public string? Notes { get; set; }

    // Navigation
    public BidLot? BidLot { get; set; }
    public Party? Party { get; set; }
}
