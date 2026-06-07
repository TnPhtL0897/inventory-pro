using InventoryPro.Domain.Parties;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class SupplierProductConfiguration : IEntityTypeConfiguration<SupplierProduct>
{
    public void Configure(EntityTypeBuilder<SupplierProduct> b)
    {
        b.ToTable("supplier_products");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.PartyId).HasColumnName("party_id").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.SupplierSku).HasColumnName("supplier_sku").HasMaxLength(100);
        b.Property(x => x.CostPrice).HasColumnName("cost_price").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.MinOrderQty).HasColumnName("min_order_qty").HasPrecision(18, 4).HasDefaultValue(1);
        b.Property(x => x.LeadTimeDays).HasColumnName("lead_time_days").HasDefaultValue(7);
        b.Property(x => x.IsPreferred).HasColumnName("is_preferred").HasDefaultValue(false);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.PartyId, x.ProductId }).IsUnique();
        b.HasIndex(x => x.ProductId);
    }
}
