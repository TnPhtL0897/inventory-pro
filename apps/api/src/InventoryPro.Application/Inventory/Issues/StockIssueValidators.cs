using FluentValidation;

namespace InventoryPro.Application.Inventory.Issues;

public class CreateIssueLineValidator : AbstractValidator<CreateIssueLineRequest>
{
    public CreateIssueLineValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
        RuleFor(x => x.LocationId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0);
    }
}

public class CreateStockIssueValidator : AbstractValidator<CreateStockIssueRequest>
{
    public CreateStockIssueValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.Purpose)
            .Must(p => p is "SALE" or "INTERNAL_USE" or "SCRAP" or "SAMPLE" or "GIFT" or "TRANSFER_OUT" or "ADJUSTMENT")
            .WithMessage("Purpose không hợp lệ");
        RuleFor(x => x.IssueDate).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty();
        RuleFor(x => x.IdempotencyKeys)
            .Must((req, keys) => keys != null && keys.Count == req.Lines.Count)
            .WithMessage("Mỗi dòng cần 1 idempotency_key");
        RuleForEach(x => x.Lines).SetValidator(new CreateIssueLineValidator());
    }
}

public class UpdateStockIssueValidator : AbstractValidator<UpdateStockIssueRequest>
{
    public UpdateStockIssueValidator()
    {
        RuleFor(x => x.IssueDate).NotEmpty();
        RuleFor(x => x.Lines).NotEmpty();
        RuleFor(x => x.IdempotencyKeys)
            .Must((req, keys) => keys != null && keys.Count == req.Lines.Count);
        RuleForEach(x => x.Lines).SetValidator(new CreateIssueLineValidator());
    }
}

public class CancelStockIssueValidator : AbstractValidator<CancelStockIssueRequest>
{
    public CancelStockIssueValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500);
    }
}
