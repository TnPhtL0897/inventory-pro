namespace InventoryPro.Application.Parties;

public record PartyDto(
    Guid Id,
    string PartyType,
    string Code,
    string Name,
    string? TaxCode,
    string? ContactName,
    string? ContactEmail,
    string? ContactPhone,
    string? Address,
    string? City,
    string Country,
    int PaymentTerms,
    decimal CreditLimit,
    string? BankAccount,
    string? BankName,
    string? Notes,
    string Status,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreatePartyRequest(
    string PartyType,
    string Code,
    string Name,
    string? TaxCode,
    string? ContactName,
    string? ContactEmail,
    string? ContactPhone,
    string? Address,
    string? City,
    string? Country,
    int? PaymentTerms,
    decimal? CreditLimit,
    string? BankAccount,
    string? BankName,
    string? Notes);

public record UpdatePartyRequest(
    string? Name,
    string? TaxCode,
    string? ContactName,
    string? ContactEmail,
    string? ContactPhone,
    string? Address,
    string? City,
    string? Country,
    int? PaymentTerms,
    decimal? CreditLimit,
    string? BankAccount,
    string? BankName,
    string? Notes,
    string? Status);

public record SupplierProductDto(
    Guid Id,
    Guid PartyId,
    Guid ProductId,
    string? ProductSku,
    string? ProductName,
    string? SupplierSku,
    decimal CostPrice,
    decimal MinOrderQty,
    int LeadTimeDays,
    bool IsPreferred,
    string? Notes);

public record CreateSupplierProductRequest(
    Guid PartyId,
    Guid ProductId,
    string? SupplierSku,
    decimal CostPrice,
    decimal MinOrderQty,
    int LeadTimeDays,
    bool IsPreferred,
    string? Notes);
