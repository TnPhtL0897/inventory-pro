namespace InventoryPro.Domain.Catalog;

using InventoryPro.Domain.Common;

/// <summary>
/// Loại đơn vị tính (phân loại để check conversion hợp lệ).
/// </summary>
public enum UnitType
{
    Count = 0,
    Weight = 1,
    Volume = 2,
    Length = 3,
    Area = 4,
    Time = 5,
}

/// <summary>
/// Đơn vị tính. Tenant tự định nghĩa.
/// </summary>
public class UnitOfMeasure : TenantScopedEntity
{
    public string Code { get; set; } = string.Empty;     // CÁI, KG, LÍT, MÉT...
    public string Name { get; set; } = string.Empty;     // Cái, Kilogram, Lít, Mét...
    public UnitType UnitType { get; set; } = UnitType.Count;
    public bool IsActive { get; set; } = true;

    // Navigation
    public ICollection<Product> ProductsAsBase { get; set; } = new List<Product>();
    public ICollection<ProductUnit> ProductUnits { get; set; } = new List<ProductUnit>();
}
