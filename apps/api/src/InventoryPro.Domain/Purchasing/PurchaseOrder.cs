namespace InventoryPro.Domain.Purchasing;

using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;
using InventoryPro.Domain.Parties;

/// <summary>
/// Trạng thái Purchase Order. Workflow:
/// DRAFT → APPROVED → POSTED → COMPLETED. Có thể CANCELLED từ bất kỳ trạng thái nào.
/// - DRAFT: tạo + sửa dòng thoải mái
/// - APPROVED: đã duyệt, không sửa dòng (chỉ có thể POST hoặc CANCEL)
/// - POSTED: đã đặt hàng với NCC, chờ GRN. Có thể nhận từng phần qua nhiều GRN
/// - COMPLETED: tất cả dòng đã nhận đủ (received_qty = quantity)
/// </summary>
public enum PurchaseOrderStatus
{
    Draft = 0,
    Approved = 1,
    Posted = 2,
    Completed = 3,
    Cancelled = 4,
}

public enum PurchaseOrderLineStatus
{
    Open = 0,
    Partial = 1,
    Received = 2,
    Cancelled = 3,
}

/// <summary>
/// Purchase Order header. Branch-scoped (mỗi PO thuộc 1 chi nhánh cụ thể).
/// party_id là supplier (Party với party_type SUPPLIER hoặc BOTH).
/// </summary>
public class PurchaseOrder : BranchScopedEntity
{
    public string PoNumber { get; set; } = string.Empty;
    public Guid PartyId { get; set; }
    public DateTime OrderDate { get; set; } = DateTime.UtcNow.Date;
    public DateTime? ExpectedDate { get; set; }
    public string Currency { get; set; } = "VND";
    public decimal ExchangeRate { get; set; } = 1;
    public decimal Subtotal { get; set; } = 0;
    public decimal DiscountAmount { get; set; } = 0;
    public decimal TaxAmount { get; set; } = 0;
    public decimal ShippingAmount { get; set; } = 0;
    public decimal Total { get; set; } = 0;
    public decimal PaidAmount { get; set; } = 0;
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public int PaymentTerms { get; set; } = 0;
    public string? ShippingAddress { get; set; }
    public string? Notes { get; set; }
    public string? InternalNotes { get; set; }
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public Guid? PostedBy { get; set; }
    public DateTime? PostedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }

    // FK tới hợp đồng thầu (BẮT BUỘC - validate ở handler)
    public Guid? BidContractId { get; set; }
    public Guid? BidLotId { get; set; }

    // Navigation
    public Parties.Party? Party { get; set; }
    public BidContract? BidContract { get; set; }
    public BidLot? BidLot { get; set; }
    public ICollection<PurchaseOrderLine> Lines { get; set; } = new List<PurchaseOrderLine>();
}

/// <summary>
/// Dòng chi tiết PO. Lưu product_name/unit_code tại thời điểm tạo (snapshot)
/// để tránh phụ thuộc vào việc product đổi tên/đổi đơn vị sau này.
/// received_qty được cập nhật bởi GRN handler (sẽ thêm ở module 0007).
/// </summary>
public class PurchaseOrderLine : TenantScopedEntity
{
    public Guid PurchaseOrderId { get; set; }
    public int LineNo { get; set; }
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string UnitCode { get; set; } = string.Empty;
    public decimal Quantity { get; set; } = 0;
    public decimal ReceivedQty { get; set; } = 0;
    public decimal UnitPrice { get; set; } = 0;
    public decimal DiscountPct { get; set; } = 0;
    public decimal TaxPct { get; set; } = 0;
    public decimal LineTotal { get; set; } = 0;
    public PurchaseOrderLineStatus Status { get; set; } = PurchaseOrderLineStatus.Open;
    public string? Notes { get; set; }

    // Navigation
    public PurchaseOrder? PurchaseOrder { get; set; }
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
}
