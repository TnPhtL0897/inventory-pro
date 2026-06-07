using FluentValidation;

namespace InventoryPro.Application.Catalog.Products;

public class CreateProductValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductValidator()
    {
        RuleFor(x => x.Sku)
            .NotEmpty().WithMessage("SKU không được trống")
            .MaximumLength(50)
            .Matches("^[A-Z0-9\\-_.]+$").WithMessage("SKU chỉ chứa chữ, số, gạch ngang, gạch dưới, chấm");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tên sản phẩm không được trống")
            .MaximumLength(200);

        RuleFor(x => x.Barcode).MaximumLength(50).When(x => !string.IsNullOrEmpty(x.Barcode));
        RuleFor(x => x.BaseUnitId).NotEmpty().WithMessage("Phải chọn đơn vị gốc");
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SellPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.MinStock).GreaterThanOrEqualTo(0);

        RuleFor(x => x.MaxStock)
            .GreaterThanOrEqualTo(x => x.MinStock)
            .When(x => x.MaxStock.HasValue)
            .WithMessage("Tồn tối đa phải >= tồn tối thiểu");
    }
}

public class UpdateProductValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductValidator()
    {
        RuleFor(x => x.Sku).MaximumLength(50)
            .Matches("^[A-Z0-9\\-_.]+$").WithMessage("SKU không hợp lệ")
            .When(x => !string.IsNullOrEmpty(x.Sku));
        RuleFor(x => x.Name).MaximumLength(200).When(x => !string.IsNullOrEmpty(x.Name));
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0).When(x => x.CostPrice.HasValue);
        RuleFor(x => x.SellPrice).GreaterThanOrEqualTo(0).When(x => x.SellPrice.HasValue);
        RuleFor(x => x.MinStock).GreaterThanOrEqualTo(0).When(x => x.MinStock.HasValue);
        RuleFor(x => x.Status)
            .Must(s => s is "ACTIVE" or "INACTIVE" or "ARCHIVED")
            .When(x => !string.IsNullOrEmpty(x.Status))
            .WithMessage("Status phải là ACTIVE, INACTIVE hoặc ARCHIVED");
    }
}
