using InventoryPro.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class StockIssueConfiguration : IEntityTypeConfiguration<StockIssue>
{
    public void Configure(EntityTypeBuilder<StockIssue> b)
    {
        b.ToTable("stock_issues");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.IssueNumber).HasColumnName("issue_number").HasMaxLength(30).IsRequired();
        b.Property(x => x.PartyId).HasColumnName("party_id");
        b.Property(x => x.WarehouseId).HasColumnName("warehouse_id").IsRequired();
        b.Property(x => x.Purpose)
            .HasColumnName("purpose")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.IssueDate).HasColumnName("issue_date");
        b.Property(x => x.ReferenceNo).HasColumnName("reference_no").HasMaxLength(100);
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

        b.HasIndex(x => new { x.TenantId, x.IssueNumber }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.BranchId });
        b.HasIndex(x => x.PartyId);
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.Purpose });
    }
}

public class StockIssueLineConfiguration : IEntityTypeConfiguration<StockIssueLine>
{
    public void Configure(EntityTypeBuilder<StockIssueLine> b)
    {
        b.ToTable("stock_issue_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.StockIssueId).HasColumnName("stock_issue_id").IsRequired();
        b.Property(x => x.LineNo).HasColumnName("line_no").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.LocationId).HasColumnName("location_id").IsRequired();
        b.Property(x => x.ProductName).HasColumnName("product_name").HasMaxLength(200).IsRequired();
        b.Property(x => x.UnitCode).HasColumnName("unit_code").HasMaxLength(20).IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.UnitPrice).HasColumnName("unit_price").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.BatchNo).HasColumnName("batch_no").HasMaxLength(100);
        b.Property(x => x.SerialNo).HasColumnName("serial_no").HasMaxLength(100);
        b.Property(x => x.ExpiryDate).HasColumnName("expiry_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.MovementId).HasColumnName("movement_id");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.StockIssueId, x.LineNo }).IsUnique();
        b.HasIndex(x => x.ProductId);
    }
}
