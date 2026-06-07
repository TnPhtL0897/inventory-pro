using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Inventory;

public enum StockTakeStatus
{
    Draft = 0,        // đang đếm
    Counted = 1,      // đã nhập số đếm, chưa chốt
    Posted = 2,       // đã chốt (tạo ADJUST_IN/OUT movements)
    Cancelled = 3,
}

public enum StockTakeLineStatus
{
    Pending = 0,     // chưa đếm
    Counted = 1,     // đã nhập số đếm
    Adjusted = 2,    // đã tạo movement điều chỉnh
    Skipped = 3,     // bỏ qua (không cần điều chỉnh, qty khớp)
    Cancelled = 4,
}

/// <summary>
/// Phiếu kiểm kê. Workflow:
/// DRAFT → COUNTED (user nhập counted_qty) → POSTED (sinh ADJUST_IN/OUT movements)
/// Có thể CANCELLED từ DRAFT hoặc COUNTED.
/// Snapshot system_qty tại thời điểm tạo để so sánh với counted_qty.
/// </summary>
public class StockTake : BranchScopedEntity
{
    public string StockTakeNumber { get; set; } = string.Empty;
    public Guid WarehouseId { get; set; }
    public DateTime StockTakeDate { get; set; } = DateTime.UtcNow.Date;
    public string? Notes { get; set; }
    public StockTakeStatus Status { get; set; } = StockTakeStatus.Draft;

    public Guid? CountedBy { get; set; }
    public DateTime? CountedAt { get; set; }
    public Guid? PostedBy { get; set; }
    public DateTime? PostedAt { get; set; }
    public string? CancelReason { get; set; }
    public Guid? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }
    public Guid? CreatedBy { get; set; }

    // Navigation
    public Warehouse? Warehouse { get; set; }
    public ICollection<StockTakeLine> Lines { get; set; } = new List<StockTakeLine>();
}

/// <summary>
/// Dòng kiểm kê. system_qty chụp tại thời điểm tạo (hoặc start counting).
/// counted_qty user nhập. variance = counted - system.
/// Khi POST: variance > 0 → ADJUST_IN, variance < 0 → ADJUST_OUT.
/// </summary>
public class StockTakeLine : TenantScopedEntity
{
    public Guid StockTakeId { get; set; }
    public int LineNo { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public Guid LocationId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string UnitCode { get; set; } = string.Empty;
    public string LocationCode { get; set; } = string.Empty;

    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }

    public decimal SystemQty { get; set; }
    public decimal? CountedQty { get; set; } // null = chưa đếm
    public decimal Variance => CountedQty.HasValue ? CountedQty.Value - SystemQty : 0;
    public decimal? UnitCost { get; set; }

    public string? Notes { get; set; }
    public Guid? AdjustMovementId { get; set; }
    public StockTakeLineStatus Status { get; set; } = StockTakeLineStatus.Pending;

    // Navigation
    public StockTake? StockTake { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
    public Location? Location { get; set; }
}
