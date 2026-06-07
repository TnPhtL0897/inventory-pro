using InventoryPro.Domain.Parties;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InventoryPro.Infrastructure.Persistence.Configurations;

public class PartyConfiguration : IEntityTypeConfiguration<Party>
{
    public void Configure(EntityTypeBuilder<Party> b)
    {
        b.ToTable("parties");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).HasColumnName("id");
        b.Property(x => x.TenantId).HasColumnName("tenant_id").IsRequired();
        b.Property(x => x.PartyType)
            .HasColumnName("party_type")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Code).HasColumnName("code").HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
        b.Property(x => x.TaxCode).HasColumnName("tax_code").HasMaxLength(50);
        b.Property(x => x.ContactName).HasColumnName("contact_name").HasMaxLength(200);
        b.Property(x => x.ContactEmail).HasColumnName("contact_email").HasMaxLength(200);
        b.Property(x => x.ContactPhone).HasColumnName("contact_phone").HasMaxLength(50);
        b.Property(x => x.Address).HasColumnName("address");
        b.Property(x => x.City).HasColumnName("city").HasMaxLength(100);
        b.Property(x => x.Country).HasColumnName("country").HasMaxLength(100).HasDefaultValue("VN");
        b.Property(x => x.PaymentTerms).HasColumnName("payment_terms").HasDefaultValue(0);
        b.Property(x => x.CreditLimit).HasColumnName("credit_limit").HasPrecision(18, 4).HasDefaultValue(0);
        b.Property(x => x.BankAccount).HasColumnName("bank_account").HasMaxLength(50);
        b.Property(x => x.BankName).HasColumnName("bank_name").HasMaxLength(200);
        b.Property(x => x.Notes).HasColumnName("notes");
        b.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        b.Property(x => x.Attributes).HasColumnName("attributes").HasColumnType("jsonb").HasDefaultValue("{}");
        b.Property(x => x.CreatedBy).HasColumnName("created_by");
        b.Property(x => x.CreatedAt).HasColumnName("created_at");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at");

        b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        b.HasIndex(x => new { x.TenantId, x.PartyType });
        b.HasIndex(x => new { x.TenantId, x.Status });
        b.HasIndex(x => new { x.TenantId, x.TaxCode });
    }
}
