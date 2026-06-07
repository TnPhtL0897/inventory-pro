using InventoryPro.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> b)
    {
        b.ToTable("products");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.Sku).HasColumnName("sku").HasMaxLength(50).IsRequired();
        b.Property(x => x.Barcode).HasColumnName("barcode").HasMaxLength(50);
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasColumnName("description");
        b.Property(x => x.CategoryId).HasColumnName("category_id");
        b.Property(x => x.BaseUnitId).HasColumnName("base_unit_id").IsRequired();
        b.Property(x => x.ProductType)
            .HasColumnName("product_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.CostPrice).HasColumnName("cost_price").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.SellPrice).HasColumnName("sell_price").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.MinStock).HasColumnName("min_stock").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.MaxStock).HasColumnName("max_stock").HasPrecision(18, 4);
        b.Property(x => x.IsBatchTracked).HasColumnName("is_batch_tracked").HasDefaultValue(false);
        b.Property(x => x.IsSerialTracked).HasColumnName("is_serial_tracked").HasDefaultValue(false);
        b.Property(x => x.IsExpiryTracked).HasColumnName("is_expiry_tracked").HasDefaultValue(false);
        b.Property(x => x.Weight).HasColumnName("weight").HasPrecision(18, 4);
        b.Property(x => x.Volume).HasColumnName("volume").HasPrecision(18, 4);
        b.Property(x => x.Attributes).HasColumnName("attributes").HasColumnType("jsonb").HasDefaultValue("{}");
        b.Property(x => x.ImageUrl).HasColumnName("image_url");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.TenantId, x.Sku }).IsUnique();
        b.HasIndex(x => x.TenantId);
        b.HasIndex(x => x.CategoryId);
        b.HasIndex(x => new { x.TenantId, x.Status });

        b.HasOne(x => x.Category)
            .WithMany(x => x.Products)
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        b.HasOne(x => x.BaseUnit)
            .WithMany(x => x.ProductsAsBase)
            .HasForeignKey(x => x.BaseUnitId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class ProductUnitConfiguration : IEntityTypeConfiguration<ProductUnit>
{
    public void Configure(EntityTypeBuilder<ProductUnit> b)
    {
        b.ToTable("product_units");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.Factor).HasColumnName("factor").HasPrecision(18, 6);
        b.Property(x => x.IsPurchase).HasColumnName("is_purchase").HasDefaultValue(false);
        b.Property(x => x.IsSale).HasColumnName("is_sale").HasDefaultValue(false);
        b.Property(x => x.Barcode).HasColumnName("barcode").HasMaxLength(50);
        b.Property(x => x.SortOrder).HasColumnName("sort_order").HasDefaultValue(0);
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.ProductId, x.UnitId }).IsUnique();
        b.HasIndex(x => x.TenantId);

        b.HasOne(x => x.Product)
            .WithMany(x => x.Units)
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Cascade);

        b.HasOne(x => x.Unit)
            .WithMany(x => x.ProductUnits)
            .HasForeignKey(x => x.UnitId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
