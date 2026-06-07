namespace InventoryPro.Domain.Bidding;

/// <summary>
/// Hình thức đấu thầu (theo Luật Đấu thầu 2023).
/// </summary>
public enum BidPackageType
{
    Open = 0,                 // Đấu thầu rộng rãi
    Limited = 1,              // Đấu thầu hạn chế
    Direct = 2,               // Chỉ định thầu
    CompetitiveQuote = 3      // Chào hàng cạnh tranh
}

/// <summary>
/// Trạng thái gói thầu.
/// </summary>
public enum BidPackageStatus
{
    Draft = 0,
    Approved = 1,
    Published = 2,
    Closed = 3,
    Awarded = 4,
    Cancelled = 5
}

/// <summary>
/// Trạng thái phần/lô thầu.
/// </summary>
public enum BidLotStatus
{
    Draft = 0,
    Published = 1,
    Evaluating = 2,
    Awarded = 3,
    Cancelled = 4,
    NoBidder = 5
}

/// <summary>
/// Trạng thái hợp đồng thầu.
/// </summary>
public enum BidContractStatus
{
    Draft = 0,
    Active = 1,
    Expired = 2,
    Terminated = 3,
    Completed = 4
}

/// <summary>
/// Trạng thái dự trù mua sắm.
/// </summary>
public enum PurchaseRequestStatus
{
    Draft = 0,
    Submitted = 1,
    Approved = 2,
    Rejected = 3,
    Merged = 4
}
