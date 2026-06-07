using FluentValidation;

namespace InventoryPro.Application.Purchasing;

public class CreateGrnLineValidator : AbstractValidator<CreateGrnLineRequest>
{
    public CreateGrnLineValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.LocationId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.UnitCost).GreaterThanOrEqualTo(0);
    }
}

public class CreateGoodsReceiptValidator : AbstractValidator<CreateGoodsReceiptRequest>
{
    public CreateGoodsReceiptValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.PartyId).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.ReceiptDate).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty().WithMessage("GRN phải có ít nhất 1 dòng");
        RuleFor(x => x.IdempotencyKeys)
            .Must((req, keys) => keys != null && keys.Count == req.Lines.Count)
            .WithMessage("Mỗi dòng cần 1 idempotency_key");
        RuleForEach(x => x.Lines).SetValidator(new CreateGrnLineValidator());
    }
}

public class UpdateGoodsReceiptValidator : AbstractValidator<UpdateGoodsReceiptRequest>
{
    public UpdateGoodsReceiptValidator()
    {
        RuleFor(x => x.ReceiptDate).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty();
        RuleFor(x => x.IdempotencyKeys)
            .Must((req, keys) => keys != null && keys.Count == req.Lines.Count)
            .WithMessage("Mỗi dòng cần 1 idempotency_key");
        RuleForEach(x => x.Lines).SetValidator(new CreateGrnLineValidator());
    }
}

public class CancelGoodsReceiptValidator : AbstractValidator<CancelGoodsReceiptRequest>
{
    public CancelGoodsReceiptValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500);
    }
}
