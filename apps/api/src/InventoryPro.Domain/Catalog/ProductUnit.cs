namespace InventoryPro.Domain.Catalog;

using InventoryPro.Domain.Common;

/// <summary>
/// Đơn vị quy đổi cho 1 product. 1 unit này = Factor * base unit.
/// VD: 1 THÙNG = 24 CÁI → Factor = 24.
/// </summary>
public class ProductUnit : TenantScopedEntity
{
    public Guid ProductId { get; set; }
    public Guid UnitId { get; set; }
    public decimal Factor { get; set; } = 1;
    public bool IsPurchase { get; set; } = false;
    public bool IsSale { get; set; } = false;
    public string? Barcode { get; set; }
    public int SortOrder { get; set; } = 0;

    // Navigation
    public Product? Product { get; set; }
    public UnitOfMeasure? Unit { get; set; }
}
