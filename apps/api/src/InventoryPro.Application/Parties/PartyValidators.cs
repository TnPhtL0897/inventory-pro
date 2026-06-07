using FluentValidation;

namespace InventoryPro.Application.Parties;

public class CreatePartyValidator : AbstractValidator<CreatePartyRequest>
{
    public CreatePartyValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("Mã đối tác không được trống")
            .MaximumLength(50)
            .Matches("^[A-Z0-9_\\-.]+$").WithMessage("Mã chỉ chứa chữ hoa, số, _, -, .");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tên đối tác không được trống")
            .MaximumLength(200);

        RuleFor(x => x.PartyType)
            .Must(t => t is "SUPPLIER" or "CUSTOMER" or "BOTH")
            .WithMessage("PartyType phải là SUPPLIER, CUSTOMER hoặc BOTH");

        RuleFor(x => x.TaxCode).MaximumLength(50).When(x => !string.IsNullOrEmpty(x.TaxCode));
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrEmpty(x.ContactEmail));
        RuleFor(x => x.PaymentTerms).GreaterThanOrEqualTo(0).When(x => x.PaymentTerms.HasValue);
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0).When(x => x.CreditLimit.HasValue);
    }
}

public class UpdatePartyValidator : AbstractValidator<UpdatePartyRequest>
{
    public UpdatePartyValidator()
    {
        RuleFor(x => x.Name).MaximumLength(200).When(x => !string.IsNullOrEmpty(x.Name));
        RuleFor(x => x.TaxCode).MaximumLength(50).When(x => !string.IsNullOrEmpty(x.TaxCode));
        RuleFor(x => x.ContactEmail).EmailAddress().When(x => !string.IsNullOrEmpty(x.ContactEmail));
        RuleFor(x => x.PaymentTerms).GreaterThanOrEqualTo(0).When(x => x.PaymentTerms.HasValue);
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0).When(x => x.CreditLimit.HasValue);
        RuleFor(x => x.Status)
            .Must(s => s is "ACTIVE" or "INACTIVE" or "BLOCKED")
            .When(x => !string.IsNullOrEmpty(x.Status))
            .WithMessage("Status phải là ACTIVE, INACTIVE hoặc BLOCKED");
    }
}

public class CreateSupplierProductValidator : AbstractValidator<CreateSupplierProductRequest>
{
    public CreateSupplierProductValidator()
    {
        RuleFor(x => x.PartyId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.MinOrderQty).GreaterThan(0).When(x => x.MinOrderQty != 0);
        RuleFor(x => x.LeadTimeDays).GreaterThanOrEqualTo(0);
    }
}
