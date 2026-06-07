using FluentValidation;

namespace InventoryPro.Application.Purchasing;

public class CreatePurchaseOrderLineValidator : AbstractValidator<CreatePurchaseOrderLineRequest>
{
    public CreatePurchaseOrderLineValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.DiscountPct).InclusiveBetween(0, 100);
        RuleFor(x => x.TaxPct).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1000);
    }
}

public class CreatePurchaseOrderValidator : AbstractValidator<CreatePurchaseOrderRequest>
{
    public CreatePurchaseOrderValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.PartyId).NotEmpty();
        RuleFor(x => x.OrderDate).NotEmpty();
        RuleFor(x => x.Currency).Length(3).When(x => !string.IsNullOrEmpty(x.Currency));
        RuleFor(x => x.ExchangeRate).GreaterThan(0).When(x => x.ExchangeRate.HasValue);
        RuleFor(x => x.DiscountAmount).GreaterThanOrEqualTo(0).When(x => x.DiscountAmount.HasValue);
        RuleFor(x => x.ShippingAmount).GreaterThanOrEqualTo(0).When(x => x.ShippingAmount.HasValue);
        RuleFor(x => x.PaymentTerms).GreaterThanOrEqualTo(0).When(x => x.PaymentTerms.HasValue);
        RuleFor(x => x.Lines).NotEmpty().WithMessage("PO phải có ít nhất 1 dòng");
        RuleForEach(x => x.Lines).SetValidator(new CreatePurchaseOrderLineValidator());
    }
}

public class UpdatePurchaseOrderValidator : AbstractValidator<UpdatePurchaseOrderRequest>
{
    public UpdatePurchaseOrderValidator()
    {
        RuleFor(x => x.PartyId).NotEmpty();
        RuleFor(x => x.OrderDate).NotEmpty();
        RuleFor(x => x.DiscountAmount).GreaterThanOrEqualTo(0).When(x => x.DiscountAmount.HasValue);
        RuleFor(x => x.ShippingAmount).GreaterThanOrEqualTo(0).When(x => x.ShippingAmount.HasValue);
        When(x => x.Lines != null, () =>
        {
            RuleFor(x => x.Lines!).NotEmpty().WithMessage("PO phải có ít nhất 1 dòng");
            RuleForEach(x => x.Lines!).SetValidator(new CreatePurchaseOrderLineValidator());
        });
    }
}

public class CancelPurchaseOrderValidator : AbstractValidator<CancelPurchaseOrderRequest>
{
    public CancelPurchaseOrderValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().WithMessage("Phải nhập lý do hủy").MaximumLength(500);
    }
}
