using InventoryPro.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class StockMovementConfiguration : IEntityTypeConfiguration<StockMovement>
{
    public void Configure(EntityTypeBuilder<StockMovement> b)
    {
        b.ToTable("stock_movements");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.WarehouseId).HasColumnName("warehouse_id").IsRequired();
        b.Property(x => x.LocationId).HasColumnName("location_id").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.MovementType)
            .HasColumnName("movement_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.UnitCost).HasColumnName("unit_cost").HasPrecision(18, 4);
        b.Property(x => x.RefType)
            .HasColumnName("ref_type")
            .HasConversion<string>()
            .HasMaxLength(30);
        b.Property(x => x.RefId).HasColumnName("ref_id");
        b.Property(x => x.RefLineId).HasColumnName("ref_line_id");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.BatchNo).HasColumnName("batch_no").HasMaxLength(100);
        b.Property(x => x.SerialNo).HasColumnName("serial_no").HasMaxLength(100);
        b.Property(x => x.ExpiryDate).HasColumnName("expiry_date");
        b.Property(x => x.IdempotencyKey).HasColumnName("idempotency_key").IsRequired();
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.Property(x => x.PostedAt).HasColumnName("posted_at");
        b.Property(x => x.Metadata).HasColumnName("metadata");
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id");

        b.HasIndex(x => new { x.TenantId, x.BranchId });
        b.HasIndex(x => new { x.TenantId, x.ProductId });
        b.HasIndex(x => new { x.TenantId, x.WarehouseId });
        b.HasIndex(x => new { x.RefType, x.RefId });
        b.HasIndex(x => new { x.TenantId, x.BidLotId });
        b.HasIndex(x => x.IdempotencyKey);
    }
}
