namespace InventoryPro.Domain.Catalog;

using InventoryPro.Domain.Common;

/// <summary>
/// Danh mục sản phẩm dạng cây. Mỗi tenant tự tổ chức.
/// </summary>
public class Category : TenantScopedEntity
{
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;

    // Navigation
    public Category? Parent { get; set; }
    public ICollection<Category> Children { get; set; } = new List<Category>();
    public ICollection<Product> Products { get; set; } = new List<Product>();
}
