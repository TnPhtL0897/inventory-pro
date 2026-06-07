namespace InventoryPro.Domain.Catalog;

using InventoryPro.Domain.Common;

/// <summary>
/// Phân loại sản phẩm.
/// </summary>
public enum ProductType
{
    Goods = 0,
    Service = 1,
    RawMaterial = 2,
    FinishedGood = 3,
    Consumable = 4,
}

/// <summary>
/// Trạng thái sản phẩm.
/// </summary>
public enum ProductStatus
{
    Active = 0,
    Inactive = 1,
    Archived = 2,
}

/// <summary>
/// Sản phẩm / vật tư. SKU unique theo tenant.
/// </summary>
public class Product : TenantScopedEntity
{
    public string Sku { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid BaseUnitId { get; set; }
    public ProductType ProductType { get; set; } = ProductType.Goods;
    public decimal CostPrice { get; set; } = 0;
    public decimal SellPrice { get; set; } = 0;
    public decimal MinStock { get; set; } = 0;
    public decimal? MaxStock { get; set; }
    public bool IsBatchTracked { get; set; } = false;
    public bool IsSerialTracked { get; set; } = false;
    public bool IsExpiryTracked { get; set; } = false;
    public decimal? Weight { get; set; }      // gram
    public decimal? Volume { get; set; }      // cm3
    public string Attributes { get; set; } = "{}";  // JSONB string
    public string? ImageUrl { get; set; }
    public ProductStatus Status { get; set; } = ProductStatus.Active;

    // Navigation
    public Category? Category { get; set; }
    public UnitOfMeasure? BaseUnit { get; set; }
    public ICollection<ProductUnit> Units { get; set; } = new List<ProductUnit>();
}
