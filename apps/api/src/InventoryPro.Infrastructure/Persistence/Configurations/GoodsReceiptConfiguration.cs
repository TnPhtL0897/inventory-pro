using InventoryPro.Domain.Purchasing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class GoodsReceiptConfiguration : IEntityTypeConfiguration<GoodsReceipt>
{
    public void Configure(EntityTypeBuilder<GoodsReceipt> b)
    {
        b.ToTable("goods_receipts");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.GrnNumber).HasColumnName("grn_number").HasMaxLength(30).IsRequired();
        b.Property(x => x.PurchaseOrderId).HasColumnName("purchase_order_id");
        b.Property(x => x.PartyId).HasColumnName("party_id").IsRequired();
        b.Property(x => x.WarehouseId).HasColumnName("warehouse_id").IsRequired();
        b.Property(x => x.ReceiptDate).HasColumnName("receipt_date");
        b.Property(x => x.SupplierInvoiceNo).HasColumnName("supplier_invoice_no").HasMaxLength(100);
        b.Property(x => x.SupplierInvoiceDate).HasColumnName("supplier_invoice_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.PostedBy).HasColumnName("posted_by");
        b.Property(x => x.PostedAt).HasColumnName("posted_at");
        b.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
        b.Property(x => x.CancelReason).HasColumnName("cancel_reason");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.Property(x => x.BidContractId).HasColumnName("bid_contract_id");
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id");

        b.HasIndex(x => new { x.TenantId, x.GrnNumber }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.BranchId });
        b.HasIndex(x => x.PurchaseOrderId);
        b.HasIndex(x => x.PartyId);
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => x.BidContractId);
        b.HasIndex(x => x.BidLotId);
    }
}

public class GoodsReceiptLineConfiguration : IEntityTypeConfiguration<GoodsReceiptLine>
{
    public void Configure(EntityTypeBuilder<GoodsReceiptLine> b)
    {
        b.ToTable("goods_receipt_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.GoodsReceiptId).HasColumnName("goods_receipt_id").IsRequired();
        b.Property(x => x.PoLineId).HasColumnName("po_line_id");
        b.Property(x => x.LineNo).HasColumnName("line_no").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.LocationId).HasColumnName("location_id").IsRequired();
        b.Property(x => x.ProductName).HasColumnName("product_name").HasMaxLength(200).IsRequired();
        b.Property(x => x.UnitCode).HasColumnName("unit_code").HasMaxLength(20).IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.UnitCost).HasColumnName("unit_cost").HasPrecision(18, 4);
        b.Property(x => x.BatchNo).HasColumnName("batch_no").HasMaxLength(100);
        b.Property(x => x.SerialNo).HasColumnName("serial_no").HasMaxLength(100);
        b.Property(x => x.ExpiryDate).HasColumnName("expiry_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.MovementId).HasColumnName("movement_id");
        b.Property(x => x.IdempotencyKey).HasColumnName("idempotency_key");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.GoodsReceiptId, x.LineNo }).IsUnique();
        b.HasIndex(x => x.PoLineId);
        b.HasIndex(x => x.ProductId);
    }
}
