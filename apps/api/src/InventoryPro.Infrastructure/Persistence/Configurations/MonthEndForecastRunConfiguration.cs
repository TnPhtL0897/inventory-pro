using InventoryPro.Domain.Replenishment;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class MonthEndForecastRunConfiguration : IEntityTypeConfiguration<MonthEndForecastRun>
{
    public void Configure(EntityTypeBuilder<MonthEndForecastRun> b)
    {
        b.ToTable("month_end_forecast_runs");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.RunType)
            .HasColumnName("run_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.FiscalYear).HasColumnName("fiscal_year").IsRequired();
        b.Property(x => x.FiscalMonth).HasColumnName("fiscal_month").IsRequired();
        b.Property(x => x.AsOfDate).HasColumnName("as_of_date").IsRequired();
        b.Property(x => x.TriggeredByUser).HasColumnName("triggered_by_user");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.WarehouseCount).HasColumnName("warehouse_count").HasDefaultValue(0);
        b.Property(x => x.ProductCount).HasColumnName("product_count").HasDefaultValue(0);
        b.Property(x => x.TotalEstimatedValue)
            .HasColumnName("total_estimated_value")
            .HasPrecision(18, 2)
            .HasDefaultValue(0);
        b.Property(x => x.CreatedPurchaseRequestIds)
            .HasColumnName("created_purchase_request_ids")
            .HasColumnType("uuid[]");
        b.Property(x => x.ErrorMessage).HasColumnName("error_message");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        // UNIQUE constraint handled by DB (uq_forecast_run_per_month) - mirror here
        b.HasIndex(x => new { x.TenantId, x.FiscalYear, x.FiscalMonth }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FiscalYear });
    }
}
