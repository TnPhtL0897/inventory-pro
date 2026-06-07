using InventoryPro.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class StockTakeConfiguration : IEntityTypeConfiguration<StockTake>
{
    public void Configure(EntityTypeBuilder<StockTake> b)
    {
        b.ToTable("stock_takes");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.WarehouseId).HasColumnName("warehouse_id").IsRequired();
        b.Property(x => x.StockTakeNumber).HasColumnName("stock_take_number").HasMaxLength(50).IsRequired();
        b.Property(x => x.StockTakeDate).HasColumnName("stock_take_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(x => x.CountedBy).HasColumnName("counted_by");
        b.Property(x => x.CountedAt).HasColumnName("counted_at");
        b.Property(x => x.PostedBy).HasColumnName("posted_by");
        b.Property(x => x.PostedAt).HasColumnName("posted_at");
        b.Property(x => x.CancelReason).HasColumnName("cancel_reason");
        b.Property(x => x.CancelledBy).HasColumnName("cancelled_by");
        b.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.TenantId, x.StockTakeNumber }).IsUnique();
        b.HasIndex(x => x.TenantId);
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.WarehouseId, x.StockTakeDate });

        b.HasMany(x => x.Lines)
            .WithOne(x => x.StockTake!)
            .HasForeignKey(x => x.StockTakeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class StockTakeLineConfiguration : IEntityTypeConfiguration<StockTakeLine>
{
    public void Configure(EntityTypeBuilder<StockTakeLine> b)
    {
        b.ToTable("stock_take_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.StockTakeId).HasColumnName("stock_take_id").IsRequired();
        b.Property(x => x.LineNo).HasColumnName("line_no").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.LocationId).HasColumnName("location_id").IsRequired();
        b.Property(x => x.ProductName).HasColumnName("product_name").HasMaxLength(200).IsRequired();
        b.Property(x => x.UnitCode).HasColumnName("unit_code").HasMaxLength(20).IsRequired();
        b.Property(x => x.LocationCode).HasColumnName("location_code").HasMaxLength(80).IsRequired();
        b.Property(x => x.BatchNo).HasColumnName("batch_no").HasMaxLength(100);
        b.Property(x => x.SerialNo).HasColumnName("serial_no").HasMaxLength(100);
        b.Property(x => x.SystemQty).HasColumnName("system_qty").HasPrecision(18, 4);
        b.Property(x => x.CountedQty).HasColumnName("counted_qty").HasPrecision(18, 4);
        b.Property(x => x.UnitCost).HasColumnName("unit_cost").HasPrecision(18, 4);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.AdjustMovementId).HasColumnName("adjust_movement_id");
        b.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => x.StockTakeId);
        b.HasIndex(x => new { x.StockTakeId, x.LineNo }).IsUnique();
    }
}
