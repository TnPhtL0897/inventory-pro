namespace InventoryPro.Application.Catalog.Products;

public record ProductDto(
    Guid Id,
    string Sku,
    string? Barcode,
    string Name,
    string? Description,
    Guid? CategoryId,
    string? CategoryName,
    Guid BaseUnitId,
    string? BaseUnitCode,
    string ProductType,
    decimal CostPrice,
    decimal SellPrice,
    decimal MinStock,
    decimal? MaxStock,
    bool IsBatchTracked,
    bool IsSerialTracked,
    bool IsExpiryTracked,
    string Status,
    string? ImageUrl,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateProductRequest(
    string Sku,
    string? Barcode,
    string Name,
    string? Description,
    Guid? CategoryId,
    Guid BaseUnitId,
    string? ProductType,
    decimal CostPrice,
    decimal SellPrice,
    decimal MinStock,
    decimal? MaxStock,
    string? ImageUrl);

public record UpdateProductRequest(
    string? Sku,
    string? Barcode,
    string? Name,
    string? Description,
    Guid? CategoryId,
    Guid? BaseUnitId,
    string? ProductType,
    decimal? CostPrice,
    decimal? SellPrice,
    decimal? MinStock,
    decimal? MaxStock,
    string? Status,
    string? ImageUrl);
