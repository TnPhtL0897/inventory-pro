namespace InventoryPro.Domain.Parties;

using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Common;

/// <summary>
/// Mapping giữa Supplier (Party) và Product.
/// Lưu giá mua, MOQ, lead time. 1 product có thể có nhiều NCC,
/// chỉ 1 NCC được đánh dấu is_preferred = true (enforce bằng trigger).
/// </summary>
public class SupplierProduct : TenantScopedEntity
{
    public Guid PartyId { get; set; }
    public Guid ProductId { get; set; }
    public string? SupplierSku { get; set; }
    public decimal CostPrice { get; set; } = 0;
    public decimal MinOrderQty { get; set; } = 1;
    public int LeadTimeDays { get; set; } = 7;
    public bool IsPreferred { get; set; } = false;
    public string? Notes { get; set; }

    // Navigation
    public Party? Party { get; set; }
    public Product? Product { get; set; }
}
