using InventoryPro.Domain.Purchasing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class PurchaseOrderConfiguration : IEntityTypeConfiguration<PurchaseOrder>
{
    public void Configure(EntityTypeBuilder<PurchaseOrder> b)
    {
        b.ToTable("purchase_orders");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.PoNumber).HasColumnName("po_number").HasMaxLength(30).IsRequired();
        b.Property(x => x.PartyId).HasColumnName("party_id").IsRequired();
        b.Property(x => x.OrderDate).HasColumnName("order_date");
        b.Property(x => x.ExpectedDate).HasColumnName("expected_date");
        b.Property(x => x.Currency).HasColumnName("currency").HasMaxLength(3).HasDefaultValue("VND");
        b.Property(x => x.ExchangeRate).HasColumnName("exchange_rate").HasPrecision(18, 6).HasDefaultValue(1);
        b.Property(x => x.Subtotal).HasColumnName("subtotal").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.DiscountAmount).HasColumnName("discount_amount").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.TaxAmount).HasColumnName("tax_amount").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.ShippingAmount).HasColumnName("shipping_amount").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.Total).HasColumnName("total").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.PaidAmount).HasColumnName("paid_amount").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.PaymentTerms).HasColumnName("payment_terms").HasDefaultValue(0);
        b.Property(x => x.ShippingAddress).HasColumnName("shipping_address");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.InternalNotes).HasColumnName("internal_notes");
        b.Property(x => x.ApprovedBy).HasColumnName("approved_by");
        b.Property(x => x.ApprovedAt).HasColumnName("approved_at");
        b.Property(x => x.PostedBy).HasColumnName("posted_by");
        b.Property(x => x.PostedAt).HasColumnName("posted_at");
        b.Property(x => x.CompletedAt).HasColumnName("completed_at");
        b.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
        b.Property(x => x.CancelReason).HasColumnName("cancel_reason");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.Property(x => x.BidContractId).HasColumnName("bid_contract_id");
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id");

        b.HasIndex(x => new { x.TenantId, x.PoNumber }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.BranchId });
        b.HasIndex(x => x.PartyId);
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.OrderDate });
        b.HasIndex(x => x.BidContractId);
        b.HasIndex(x => x.BidLotId);
    }
}

public class PurchaseOrderLineConfiguration : IEntityTypeConfiguration<PurchaseOrderLine>
{
    public void Configure(EntityTypeBuilder<PurchaseOrderLine> b)
    {
        b.ToTable("purchase_order_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.PurchaseOrderId).HasColumnName("purchase_order_id").IsRequired();
        b.Property(x => x.LineNo).HasColumnName("line_no").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.ProductName).HasColumnName("product_name").HasMaxLength(200).IsRequired();
        b.Property(x => x.UnitCode).HasColumnName("unit_code").HasMaxLength(20).IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.ReceivedQty).HasColumnName("received_qty").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.UnitPrice).HasColumnName("unit_price").HasPrecision(18, 4);
        b.Property(x => x.DiscountPct).HasColumnName("discount_pct").HasPrecision(5, 2).HasDefaultValue(0);
        b.Property(x => x.TaxPct).HasColumnName("tax_pct").HasPrecision(5, 2).HasDefaultValue(0);
        b.Property(x => x.LineTotal).HasColumnName("line_total").HasPrecision(18, 4);
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.PurchaseOrderId, x.LineNo }).IsUnique();
        b.HasIndex(x => x.ProductId);
        b.HasIndex(x => new { x.TenantId, x.Status });
    }
}
