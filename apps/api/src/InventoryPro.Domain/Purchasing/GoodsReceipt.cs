namespace InventoryPro.Domain.Purchasing;

using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;

public enum GoodsReceiptStatus
{
    Draft = 0,
    Posted = 1,
    Cancelled = 2,
}

public enum GoodsReceiptLineStatus
{
    Open = 0,
    Posted = 1,
    Cancelled = 2,
}

/// <summary>
/// Phiếu nhập kho (GRN). Có thể tạo từ PO hoặc nhập tay.
/// POSTED sẽ tạo N stock_movements (ref_type=GRN, ref_id=grn.id).
/// </summary>
public class GoodsReceipt : BranchScopedEntity
{
    public string GrnNumber { get; set; } = string.Empty;
    public Guid? PurchaseOrderId { get; set; }
    public Guid PartyId { get; set; }
    public Guid WarehouseId { get; set; }
    public DateTime ReceiptDate { get; set; } = DateTime.UtcNow.Date;
    public string? SupplierInvoiceNo { get; set; }
    public DateTime? SupplierInvoiceDate { get; set; }
    public string? Notes { get; set; }
    public GoodsReceiptStatus Status { get; set; } = GoodsReceiptStatus.Draft;
    public Guid? PostedBy { get; set; }
    public DateTime? PostedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }

    // FK tới lô thầu (auto-fill từ PO khi tạo GRN)
    public Guid? BidContractId { get; set; }
    public Guid? BidLotId { get; set; }

    // Navigation
    public PurchaseOrder? PurchaseOrder { get; set; }
    public Party? Party { get; set; }
    public Warehouse? Warehouse { get; set; }
    public BidContract? BidContract { get; set; }
    public BidLot? BidLot { get; set; }
    public ICollection<GoodsReceiptLine> Lines { get; set; } = new List<GoodsReceiptLine>();
}

/// <summary>
/// Dòng GRN. Mỗi dòng sẽ tạo 1 stock_movement khi POSTED.
/// movement_id lưu tham chiếu tới stock_movements.id (không FK cứng vì stock_movements partitioned).
/// </summary>
public class GoodsReceiptLine : TenantScopedEntity
{
    public Guid GoodsReceiptId { get; set; }
    public Guid? PoLineId { get; set; }
    public int LineNo { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public Guid LocationId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string UnitCode { get; set; } = string.Empty;
    public decimal Quantity { get; set; } = 0;
    public decimal UnitCost { get; set; } = 0;
    public string? BatchNo { get; set; }
    public string? SerialNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string? Notes { get; set; }
    public Guid? MovementId { get; set; }
    public Guid IdempotencyKey { get; set; }
    public GoodsReceiptLineStatus Status { get; set; } = GoodsReceiptLineStatus.Open;

    // Navigation
    public GoodsReceipt? GoodsReceipt { get; set; }
    public PurchaseOrderLine? PoLine { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
    public Location? Location { get; set; }
}
