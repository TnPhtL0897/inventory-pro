namespace InventoryPro.Domain.Common;

/// <summary>
/// Base entity cho tất cả aggregate roots. Có id, timestamps, soft delete.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
