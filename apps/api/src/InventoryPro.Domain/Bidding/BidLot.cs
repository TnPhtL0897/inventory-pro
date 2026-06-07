using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;
using InventoryPro.Domain.Parties;

namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Phần/Lô thầu - đơn vị mua sắm thực tế. Mỗi lô có thể trúng 1 nhà thầu riêng.
/// Quan trọng nhất: đây là nơi định nghĩa chính xác vật tư, SL, NCC trúng.
/// </summary>
public class BidLot : TenantScopedEntity
{
    public Guid BidPackageId { get; set; }
    public string LotNo { get; set; } = string.Empty;
    public string LotName { get; set; } = string.Empty;
    public BidLotStatus BidLotStatus { get; set; } = BidLotStatus.Draft;
    public string? ProductCategory { get; set; }
    public decimal? EstimatedValue { get; set; }
    public decimal? QuantityTotal { get; set; }
    public string? Unit { get; set; }

    // Sau khi trúng thầu:
    public Guid? AwardedBidderId { get; set; }
    public decimal? AwardedValue { get; set; }
    public DateTime? AwardedDate { get; set; }
    public string? DecisionNo { get; set; }  // Số QĐ phê duyệt kết quả trúng thầu

    // Link 1-1 tới HĐ thầu (set sau khi tạo HĐ)
    public Guid? ContractId { get; set; }
    public Guid? CreatedBy { get; set; }

    // Navigation
    public BidPackage? BidPackage { get; set; }
    public Party? AwardedBidder { get; set; }
    public BidContract? Contract { get; set; }
    public ICollection<BidLotLine> Lines { get; set; } = new List<BidLotLine>();
    public ICollection<BidBidder> Bidders { get; set; } = new List<BidBidder>();
}

/// <summary>
/// Dòng vật tư trong lô thầu. Định nghĩa chính xác SP, SL, đơn giá dự kiến.
/// </summary>
public class BidLotLine : TenantScopedEntity
{
    public Guid BidLotId { get; set; }
    public Guid ProductId { get; set; }
    public decimal Quantity { get; set; }
    public Guid UnitId { get; set; }
    public decimal? EstimatedUnitPrice { get; set; }
    public string? Notes { get; set; }

    // Navigation
    public BidLot? BidLot { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
}
