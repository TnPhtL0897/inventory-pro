using InventoryPro.Domain.Bidding;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class BidPlanConfiguration : IEntityTypeConfiguration<BidPlan>
{
    public void Configure(EntityTypeBuilder<BidPlan> b)
    {
        b.ToTable("bid_plans");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.PlanNo).HasColumnName("plan_no").HasMaxLength(50).IsRequired();
        b.Property(x => x.FiscalYear).HasColumnName("fiscal_year").IsRequired();
        b.Property(x => x.Title).HasColumnName("title").IsRequired();
        b.Property(x => x.TotalEstimatedValue).HasColumnName("total_estimated_value").HasPrecision(18, 2);
        b.Property(x => x.Status).HasColumnName("status").HasMaxLength(20).HasDefaultValue("DRAFT");
        b.Property(x => x.ApprovedBy).HasColumnName("approved_by");
        b.Property(x => x.ApprovedAt).HasColumnName("approved_at");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.TenantId, x.PlanNo }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.FiscalYear });
    }
}

public class PurchaseRequestConfiguration : IEntityTypeConfiguration<PurchaseRequest>
{
    public void Configure(EntityTypeBuilder<PurchaseRequest> b)
    {
        b.ToTable("purchase_requests");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        b.Property(x => x.BidPlanId).HasColumnName("bid_plan_id");
        b.Property(x => x.PrNumber).HasColumnName("pr_number").HasMaxLength(50).IsRequired();
        b.Property(x => x.RequestDept).HasColumnName("request_dept").IsRequired();
        b.Property(x => x.RequesterId).HasColumnName("requester_id");
        b.Property(x => x.FiscalYear).HasColumnName("fiscal_year");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.RequestedDate).HasColumnName("requested_date");
        b.Property(x => x.ApprovedBy).HasColumnName("approved_by");
        b.Property(x => x.ApprovedAt).HasColumnName("approved_at");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.TenantId, x.PrNumber }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.BranchId });
        b.HasIndex(x => x.BidPlanId);
        b.HasIndex(x => new { x.TenantId, x.Status });
    }
}

public class PurchaseRequestLineConfiguration : IEntityTypeConfiguration<PurchaseRequestLine>
{
    public void Configure(EntityTypeBuilder<PurchaseRequestLine> b)
    {
        b.ToTable("purchase_request_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.PurchaseRequestId).HasColumnName("purchase_request_id").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.EstimatedUnitPrice).HasColumnName("estimated_unit_price").HasPrecision(18, 4);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => x.PurchaseRequestId);
        b.HasIndex(x => x.ProductId);
    }
}

public class BidPackageConfiguration : IEntityTypeConfiguration<BidPackage>
{
    public void Configure(EntityTypeBuilder<BidPackage> b)
    {
        b.ToTable("bid_packages");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BidPlanId).HasColumnName("bid_plan_id");
        b.Property(x => x.PackageNo).HasColumnName("package_no").HasMaxLength(50).IsRequired();
        b.Property(x => x.PackageName).HasColumnName("package_name").IsRequired();
        b.Property(x => x.BidPackageType)
            .HasColumnName("bid_package_type")
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();
        b.Property(x => x.BidPackageStatus)
            .HasColumnName("bid_package_status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.PublishDate).HasColumnName("publish_date");
        b.Property(x => x.BidOpenDate).HasColumnName("bid_open_date");
        b.Property(x => x.BidCloseDate).HasColumnName("bid_close_date");
        b.Property(x => x.TotalEstimatedValue).HasColumnName("total_estimated_value").HasPrecision(18, 2);
        b.Property(x => x.ProcurementMethod).HasColumnName("procurement_method");
        b.Property(x => x.DecisionNo).HasColumnName("decision_no").HasMaxLength(100);
        b.Property(x => x.DecisionDate).HasColumnName("decision_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.TenantId, x.PackageNo }).IsUnique();
        b.HasIndex(x => x.BidPlanId);
        b.HasIndex(x => new { x.TenantId, x.BidPackageStatus });
    }
}

public class BidLotConfiguration : IEntityTypeConfiguration<BidLot>
{
    public void Configure(EntityTypeBuilder<BidLot> b)
    {
        b.ToTable("bid_lots");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BidPackageId).HasColumnName("bid_package_id").IsRequired();
        b.Property(x => x.LotNo).HasColumnName("lot_no").HasMaxLength(50).IsRequired();
        b.Property(x => x.LotName).HasColumnName("lot_name").IsRequired();
        b.Property(x => x.BidLotStatus)
            .HasColumnName("bid_lot_status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.ProductCategory).HasColumnName("product_category");
        b.Property(x => x.EstimatedValue).HasColumnName("estimated_value").HasPrecision(18, 2);
        b.Property(x => x.QuantityTotal).HasColumnName("quantity_total").HasPrecision(18, 4);
        b.Property(x => x.Unit).HasColumnName("unit").HasMaxLength(20);
        b.Property(x => x.AwardedBidderId).HasColumnName("awarded_bidder_id");
        b.Property(x => x.AwardedValue).HasColumnName("awarded_value").HasPrecision(18, 2);
        b.Property(x => x.AwardedDate).HasColumnName("awarded_date");
        b.Property(x => x.DecisionNo).HasColumnName("decision_no").HasMaxLength(100);
        b.Property(x => x.ContractId).HasColumnName("contract_id");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.TenantId, x.BidPackageId, x.LotNo }).IsUnique();
        b.HasIndex(x => x.BidPackageId);
        b.HasIndex(x => new { x.TenantId, x.BidLotStatus });
        b.HasIndex(x => x.AwardedBidderId);
        b.HasIndex(x => x.ContractId).IsUnique();

        // 1-1: BidContract (principal) ↔ BidLot (dependent via ContractId).
        // BidContract.BidLotId is the required FK; BidLot.ContractId is the
        // back-reference that gets set when the contract is awarded.
        b.HasOne(x => x.Contract)
            .WithOne(c => c.BidLot)
            .HasForeignKey<BidLot>(x => x.ContractId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public class BidLotLineConfiguration : IEntityTypeConfiguration<BidLotLine>
{
    public void Configure(EntityTypeBuilder<BidLotLine> b)
    {
        b.ToTable("bid_lot_lines");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id").IsRequired();
        b.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        b.Property(x => x.Quantity).HasColumnName("quantity").HasPrecision(18, 4);
        b.Property(x => x.UnitId).HasColumnName("unit_id").IsRequired();
        b.Property(x => x.EstimatedUnitPrice).HasColumnName("estimated_unit_price").HasPrecision(18, 4);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => x.BidLotId);
        b.HasIndex(x => x.ProductId);
    }
}

public class BidBidderConfiguration : IEntityTypeConfiguration<BidBidder>
{
    public void Configure(EntityTypeBuilder<BidBidder> b)
    {
        b.ToTable("bid_bidders");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id").IsRequired();
        b.Property(x => x.PartyId).HasColumnName("party_id").IsRequired();
        b.Property(x => x.BidPrice).HasColumnName("bid_price").HasPrecision(18, 2);
        b.Property(x => x.BidDate).HasColumnName("bid_date");
        b.Property(x => x.IsWinner).HasColumnName("is_winner").HasDefaultValue(false);
        b.Property(x => x.Rank).HasColumnName("rank");
        b.Property(x => x.EvaluationScore).HasColumnName("evaluation_score").HasPrecision(5, 2);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.BidLotId, x.PartyId }).IsUnique();
        b.HasIndex(x => x.PartyId);
    }
}

public class BidContractConfiguration : IEntityTypeConfiguration<BidContract>
{
    public void Configure(EntityTypeBuilder<BidContract> b)
    {
        b.ToTable("bid_contracts");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.BidLotId).HasColumnName("bid_lot_id").IsRequired();
        b.Property(x => x.ContractNo).HasColumnName("contract_no").HasMaxLength(100).IsRequired();
        b.Property(x => x.ContractName).HasColumnName("contract_name");
        b.Property(x => x.WinningPartyId).HasColumnName("winning_party_id").IsRequired();
        b.Property(x => x.ContractValue).HasColumnName("contract_value").HasPrecision(18, 2);
        b.Property(x => x.ContractStartDate).HasColumnName("contract_start_date");
        b.Property(x => x.ContractEndDate).HasColumnName("contract_end_date");
        b.Property(x => x.UsedValue).HasColumnName("used_value").HasPrecision(18, 2).HasDefaultValue(0);
        b.Property(x => x.BidContractStatus)
            .HasColumnName("bid_contract_status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.PaymentTerms).HasColumnName("payment_terms");
        b.Property(x => x.AdvancePaymentPct).HasColumnName("advance_payment_pct").HasPrecision(5, 2);
        b.Property(x => x.RetentionPct).HasColumnName("retention_pct").HasPrecision(5, 2);
        b.Property(x => x.WarrantyMonths).HasColumnName("warranty_months");
        b.Property(x => x.SigningDate).HasColumnName("signing_date");
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        b.HasIndex(x => new { x.TenantId, x.ContractNo }).IsUnique();
        b.HasIndex(x => x.BidLotId);
        b.HasIndex(x => x.WinningPartyId);
        b.HasIndex(x => new { x.TenantId, x.ContractStartDate, x.ContractEndDate });
        b.HasIndex(x => new { x.TenantId, x.BidContractStatus });
    }
}
