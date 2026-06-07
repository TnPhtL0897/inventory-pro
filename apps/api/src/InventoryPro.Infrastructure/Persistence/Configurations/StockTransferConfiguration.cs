using InventoryPro.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class StockTransferConfiguration : IEntityTypeConfiguration<StockTransfer>
{
    public void Configure(EntityTypeBuilder<StockTransfer> b)
    {
        b.ToTable("stock_transfers");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.TransferNumber).HasColumnName("transfer_number").HasMaxLength(50).IsRequired();
        b.Property(x => x.FromBranchId).HasColumnName("from_branch_id").IsRequired();
        b.Property(x => x.FromWarehouseId).HasColumnName("from_warehouse_id").IsRequired();
        b.Property(x => x.ToBranchId).HasColumnName("to_branch_id").IsRequired();
        b.Property(x => x.ToWarehouseId).HasColumnName("to_warehouse_id").IsRequired();
        b.Property(x => x.TransferDate).HasColumnName("transfer_date");
        b.Property(x => x.ExpectedReceiptDate).HasColumnName("expected_receipt_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(x => x.OutShippedBy).HasColumnName("out_shipped_by");
        b.Property(x => x.OutShippedAt).HasColumnName("out_shipped_at");
        b.Property(x => x.InReceivedBy).HasColumnName("in_received_by");
        b.Property(x => x.InReceivedAt).HasColumnName("in_received_at");
        b.Property(x => x.CancelReason).HasColumnName("cancel_reason");
        b.Property(x => x.CancelledBy).HasColumnName("cancelled_by");
        b.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.TenantId, x.TransferNumber }).IsUnique();
        b.HasIndex(x => x.TenantId);
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => x.FromWarehouseId);
        b.HasIndex(x => x.ToWarehouseId);

        b.HasMany(x => x.Lines)
            .WithOne(x => x.StockTransfer!)
            .HasForeignKey(x => x.StockTransferId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class StockTransferLineConfiguration : IEntityTypeConfiguration<StockTransferLine>
{
    public void Configure(EntityTypeBuilder<StockTransferLine> b)
    {
        b.ToTable("stock_transfer_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.StockTransferId).HasColumnName("stock_transfer_id").IsRequired();
        b.Property(x => x.LineNo).HasColumnName("line_no").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.ProductName).HasColumnName("product_name").HasMaxLength(200).IsRequired();
        b.Property(x => x.UnitCode).HasColumnName("unit_code").HasMaxLength(20).IsRequired();
        b.Property(x => x.FromLocationId).HasColumnName("from_location_id").IsRequired();
        b.Property(x => x.FromLocationCode).HasColumnName("from_location_code").HasMaxLength(80).IsRequired();
        b.Property(x => x.ToLocationId).HasColumnName("to_location_id").IsRequired();
        b.Property(x => x.ToLocationCode).HasColumnName("to_location_code").HasMaxLength(80).IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.ShippedQty).HasColumnName("shipped_qty").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.ReceivedQty).HasColumnName("received_qty").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.BatchNo).HasColumnName("batch_no").HasMaxLength(100);
        b.Property(x => x.SerialNo).HasColumnName("serial_no").HasMaxLength(100);
        b.Property(x => x.ExpiryDate).HasColumnName("expiry_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.OutMovementId).HasColumnName("out_movement_id");
        b.Property(x => x.InMovementId).HasColumnName("in_movement_id");
        b.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20).IsRequired();
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => x.StockTransferId);
        b.HasIndex(x => new { x.StockTransferId, x.LineNo }).IsUnique();
    }
}
