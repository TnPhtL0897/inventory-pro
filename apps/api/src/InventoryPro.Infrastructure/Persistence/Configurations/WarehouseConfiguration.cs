using InventoryPro.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class WarehouseConfiguration : IEntityTypeConfiguration<Warehouse>
{
    public void Configure(EntityTypeBuilder<Warehouse> b)
    {
        b.ToTable("warehouses");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        b.Property(x => x.Code).HasColumnName("code").HasMaxLength(50).IsRequired();
        b.Property(x => x.Address).HasColumnName("address");
        b.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(50);
        b.Property(x => x.ManagerId).HasColumnName("manager_id");
        b.Property(x => x.IsDefault).HasColumnName("is_default").HasDefaultValue(false);
        b.Property(x => x.AllowNegative).HasColumnName("allow_negative").HasDefaultValue(false);
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Type)
            .HasColumnName("warehouse_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Attributes).HasColumnName("attributes").HasColumnType("jsonb").HasDefaultValue("{}");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.BranchId, x.Code }).IsUnique();
        b.HasIndex(x => x.TenantId);
        b.HasIndex(x => new { x.BranchId, x.Status });
        b.HasIndex(x => new { x.BranchId, x.Type });
    }
}

public class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> b)
    {
        b.ToTable("locations");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.WarehouseId).HasColumnName("warehouse_id").IsRequired();
        b.Property(x => x.ParentId).HasColumnName("parent_id");
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        b.Property(x => x.Code).HasColumnName("code").HasMaxLength(80).IsRequired();
        b.Property(x => x.Barcode).HasColumnName("barcode").HasMaxLength(100);
        b.Property(x => x.LocationType)
            .HasColumnName("location_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.CapacityVolume).HasColumnName("capacity_volume").HasPrecision(18, 4);
        b.Property(x => x.CapacityWeight).HasColumnName("capacity_weight").HasPrecision(18, 4);
        b.Property(x => x.MaxQtyHint).HasColumnName("max_qty_hint").HasPrecision(18, 4);
        b.Property(x => x.PickSequence).HasColumnName("pick_sequence").HasDefaultValue(0);
        b.Property(x => x.IsPickable).HasColumnName("is_pickable").HasDefaultValue(true);
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Attributes).HasColumnName("attributes").HasColumnType("jsonb").HasDefaultValue("{}");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.WarehouseId, x.Code }).IsUnique();
        b.HasIndex(x => x.TenantId);
        b.HasIndex(x => x.BranchId);
        b.HasIndex(x => x.ParentId);

        b.HasOne(x => x.Warehouse)
            .WithMany(x => x.Locations)
            .HasForeignKey(x => x.WarehouseId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne(x => x.Parent)
            .WithMany(x => x.Children)
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
