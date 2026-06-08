namespace InventoryPro.Domain.Parties;

using InventoryPro.Domain.Common;

/// <summary>
/// Loại đối tác.
/// SUPPLIER: nhà cung cấp (dùng cho PO, GRN, purchase return)
/// CUSTOMER: khách hàng (dùng cho sales, sale return)
/// BOTH: vừa mua vừa bán (vd: đại lý)
/// </summary>
public enum PartyType
{
    Supplier = 0,
    Customer = 1,
    Both = 2,
}

public enum PartyStatus
{
    Active = 0,
    Inactive = 1,
    Blocked = 2,
}

/// <summary>
/// Đối tác (NCC/KH). Có thể vừa là supplier vừa là customer (party_type = BOTH).
/// Multi-tenancy: mọi query phải filter theo TenantId.
/// </summary>
public class Party : TenantScopedEntity
{
    public PartyType PartyType { get; set; } = PartyType.Supplier;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? TaxCode { get; set; }
    public string? ContactName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string Country { get; set; } = "VN";
    public int PaymentTerms { get; set; } = 0;
    public decimal CreditLimit { get; set; } = 0;
    public string? BankAccount { get; set; }
    public string? BankName { get; set; }
    public string? Notes { get; set; }
    public PartyStatus Status { get; set; } = PartyStatus.Active;
    public string Attributes { get; set; } = "{}";
    public Guid? CreatedBy { get; set; }

    // Navigation
    public ICollection<SupplierProduct> SupplierProducts { get; set; } = new List<SupplierProduct>();
}
