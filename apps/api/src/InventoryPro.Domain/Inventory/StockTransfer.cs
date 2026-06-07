using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;

namespace InventoryPro.Domain.Inventory;

public enum StockTransferStatus
{
    Draft = 0,
    InTransit = 1,
    Received = 2,
    Cancelled = 3,
}

public enum StockTransferLineStatus
{
    Open = 0,
    InTransit = 1,
    Received = 2,
    Cancelled = 3,
}

/// <summary>
/// Phiếu chuyển kho nội bộ. Workflow:
/// DRAFT → IN_TRANSIT (đã xuất khỏi src warehouse) → RECEIVED (đã nhập vào dst warehouse)
/// Có thể CANCELLED từ DRAFT hoặc IN_TRANSIT (tùy nghiệp vụ).
/// Mỗi line khi POST sẽ tạo 2 movements: TRANSFER_OUT (src) + TRANSFER_IN (dst) cùng RefId.
/// Có thể transfer giữa 2 branches khác nhau (inter-branch) hoặc cùng branch.
/// </summary>
public class StockTransfer : TenantScopedEntity
{
    public string TransferNumber { get; set; } = string.Empty;
    public Guid FromBranchId { get; set; }
    public Guid FromWarehouseId { get; set; }
    public Guid ToBranchId { get; set; }
    public Guid ToWarehouseId { get; set; }
    public DateTime TransferDate { get; set; } = DateTime.UtcNow.Date;
    public DateTime? ExpectedReceiptDate { get; set; }
    public string? Notes { get; set; }
    public StockTransferStatus Status { get; set; } = StockTransferStatus.Draft;

    // Out (src) side
    public Guid? OutShippedBy { get; set; }
    public DateTime? OutShippedAt { get; set; }

    // In (dst) side
    public Guid? InReceivedBy { get; set; }
    public DateTime? InReceivedAt { get; set; }

    public string? CancelReason { get; set; }
    public Guid? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }

    public Guid? CreatedBy { get; set; }

    // Navigation
    public ICollection<StockTransferLine> Lines { get; set; } = new List<StockTransferLine>();
}

/// <summary>
/// Dòng chuyển kho. Snapshot product_name/unit_code tại thời điểm tạo.
/// shipped_qty: số lượng đã xuất khỏi src (ban đầu = quantity khi POST).
/// received_qty: số lượng đã nhập vào dst (có thể thiếu hàng → điều chỉnh).
/// </summary>
public class StockTransferLine : TenantScopedEntity
{
    public Guid StockTransferId { get; set; }
    public int LineNo { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string UnitCode { get; set; } = string.Empty;

    // Source side
    public Guid FromLocationId { get; set; }
    public string FromLocationCode { get; set; } = string.Empty;

    // Destination side
    public Guid ToLocationId { get; set; }
    public string ToLocationCode { get; set; } = string.Empty;

    public decimal Quantity { get; set; }
    public decimal ShippedQty { get; set; } = 0;
    public decimal ReceivedQty { get; set; } = 0;

    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string? Notes { get; set; }

    public Guid? OutMovementId { get; set; }
    public Guid? InMovementId { get; set; }

    public StockTransferLineStatus Status { get; set; } = StockTransferLineStatus.Open;

    // Navigation
    public StockTransfer? StockTransfer { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
    public Location? FromLocation { get; set; }
    public Location? ToLocation { get; set; }
}
