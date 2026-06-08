using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Catalog;
using InventoryPro.Application.Common.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Catalog.Products;

// =============================================================================
// Queries
// =============================================================================
public record GetProductByIdQuery(Guid Id) : IRequest<ProductDto>;

public record ListProductsQuery(int Page = 1, int PageSize = 20, string? Search = null, Guid? CategoryId = null, string? Status = null) : IRequest<PaginatedResult<ProductDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateProductCommand(CreateProductRequest Request) : IRequest<ProductDto>;

public record UpdateProductCommand(Guid Id, UpdateProductRequest Request) : IRequest<ProductDto>;

public record DeleteProductCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class ProductQueryHandler :
    IRequestHandler<GetProductByIdQuery, ProductDto>,
    IRequestHandler<ListProductsQuery, PaginatedResult<ProductDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ProductQueryHandler(IInventoryDbContext db, TenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ProductDto> Handle(GetProductByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Products
            .Include(p => p.Category)
            .Include(p => p.BaseUnit)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Product {request.Id} khÃ´ng tá»“n táº¡i");
        return ToDto(entity);
    }

    public async Task<PaginatedResult<ProductDto>> Handle(ListProductsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Products
            .Include(p => p.Category)
            .Include(p => p.BaseUnit)
            .AsNoTracking()
            .Where(p => p.TenantId == _tenant.TenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(p => p.Name.ToLower().Contains(s) || p.Sku.ToLower().Contains(s) || (p.Barcode != null && p.Barcode.ToLower().Contains(s)));
        }
        if (request.CategoryId.HasValue) q = q.Where(p => p.CategoryId == request.CategoryId);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var status = Enum.Parse<ProductStatus>(request.Status, ignoreCase: true);
            q = q.Where(p => p.Status == status);
        }

        var total = await q.CountAsync(ct);
        var items = await q
            .OrderBy(p => p.Name)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<ProductDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    private static ProductDto ToDto(Product p) => new(
        p.Id, p.Sku, p.Barcode, p.Name, p.Description,
        p.CategoryId, p.Category?.Name,
        p.BaseUnitId, p.BaseUnit?.Code,
        p.ProductType.ToString(),
        p.CostPrice, p.SellPrice, p.MinStock, p.MaxStock,
        p.IsBatchTracked, p.IsSerialTracked, p.IsExpiryTracked,
        p.Status.ToString(), p.ImageUrl,
        p.CreatedAt, p.UpdatedAt);
}

public class ProductCommandHandler :
    IRequestHandler<CreateProductCommand, ProductDto>,
    IRequestHandler<UpdateProductCommand, ProductDto>,
    IRequestHandler<DeleteProductCommand, Unit>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ProductCommandHandler(IInventoryDbContext db, TenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<ProductDto> Handle(CreateProductCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        // Validate unique SKU
        var skuExists = await _db.Products.AnyAsync(p => p.TenantId == _tenant.TenantId && p.Sku == r.Sku, ct);
        if (skuExists) throw new ConflictException($"SKU '{r.Sku}' Ä‘Ã£ tá»“n táº¡i");
        if (r.Barcode != null)
        {
            var barcodeExists = await _db.Products.AnyAsync(p => p.TenantId == _tenant.TenantId && p.Barcode == r.Barcode, ct);
            if (barcodeExists) throw new ConflictException($"Barcode '{r.Barcode}' Ä‘Ã£ tá»“n táº¡i");
        }
        // Validate base unit
        var unitExists = await _db.UnitsOfMeasure.AnyAsync(u => u.Id == r.BaseUnitId && u.TenantId == _tenant.TenantId, ct);
        if (!unitExists) throw new NotFoundException("Base unit khÃ´ng tá»“n táº¡i");

        var entity = new Product
        {
            TenantId = _tenant.TenantId!.Value,
            Sku = r.Sku,
            Barcode = r.Barcode,
            Name = r.Name,
            Description = r.Description,
            CategoryId = r.CategoryId,
            BaseUnitId = r.BaseUnitId,
            ProductType = Enum.TryParse<ProductType>(r.ProductType, true, out var t) ? t : ProductType.Goods,
            CostPrice = r.CostPrice,
            SellPrice = r.SellPrice,
            MinStock = r.MinStock,
            MaxStock = r.MaxStock,
            ImageUrl = r.ImageUrl,
        };
        _db.Products.Add(entity);
        await _db.SaveChangesAsync(ct);

        // Reload with includes
        var created = await _db.Products
            .Include(p => p.Category).Include(p => p.BaseUnit)
            .AsNoTracking()
            .FirstAsync(p => p.Id == entity.Id, ct);
        return created.Adapt<ProductDto>();
    }

    public async Task<ProductDto> Handle(UpdateProductCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Products
            .Include(p => p.Category).Include(p => p.BaseUnit)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Product {request.Id} khÃ´ng tá»“n táº¡i");

        var r = request.Request;
        if (!string.IsNullOrEmpty(r.Sku) && r.Sku != entity.Sku)
        {
            var exists = await _db.Products.AnyAsync(p => p.TenantId == _tenant.TenantId && p.Sku == r.Sku && p.Id != request.Id, ct);
            if (exists) throw new ConflictException($"SKU '{r.Sku}' Ä‘Ã£ tá»“n táº¡i");
            entity.Sku = r.Sku;
        }
        if (r.Barcode != null && r.Barcode != entity.Barcode)
        {
            var exists = await _db.Products.AnyAsync(p => p.TenantId == _tenant.TenantId && p.Barcode == r.Barcode && p.Id != request.Id, ct);
            if (exists) throw new ConflictException($"Barcode '{r.Barcode}' Ä‘Ã£ tá»“n táº¡i");
            entity.Barcode = r.Barcode;
        }
        if (!string.IsNullOrEmpty(r.Name)) entity.Name = r.Name;
        if (r.Description != null) entity.Description = r.Description;
        if (r.CategoryId.HasValue) entity.CategoryId = r.CategoryId;
        if (r.BaseUnitId.HasValue) entity.BaseUnitId = r.BaseUnitId.Value;
        if (!string.IsNullOrEmpty(r.ProductType) && Enum.TryParse<ProductType>(r.ProductType, true, out var t)) entity.ProductType = t;
        if (r.CostPrice.HasValue) entity.CostPrice = r.CostPrice.Value;
        if (r.SellPrice.HasValue) entity.SellPrice = r.SellPrice.Value;
        if (r.MinStock.HasValue) entity.MinStock = r.MinStock.Value;
        if (r.MaxStock.HasValue) entity.MaxStock = r.MaxStock;
        if (!string.IsNullOrEmpty(r.Status) && Enum.TryParse<ProductStatus>(r.Status, true, out var s)) entity.Status = s;
        if (r.ImageUrl != null) entity.ImageUrl = r.ImageUrl;

        await _db.SaveChangesAsync(ct);
        return entity.Adapt<ProductDto>();
    }

    public async Task<Unit> Handle(DeleteProductCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Products
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Product {request.Id} khÃ´ng tá»“n táº¡i");

        // Soft check: náº¿u Ä‘Ã£ cÃ³ stock, archive thay vÃ¬ xÃ³a
        var hasStock = await _db.Stock.AnyAsync(s => s.ProductId == request.Id, ct);
        if (hasStock)
        {
            entity.Status = ProductStatus.Archived;
            await _db.SaveChangesAsync(ct);
            return Unit.Value;
        }
        _db.Products.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
