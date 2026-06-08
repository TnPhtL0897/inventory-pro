using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Catalog;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Catalog;

// =============================================================================
// Queries
// =============================================================================
public record GetCategoryByIdQuery(Guid Id) : IRequest<CategoryDto>;
public record ListCategoriesQuery(int Page = 1, int PageSize = 50, Guid? ParentId = null, bool? IsActive = null)
    : IRequest<PaginatedResult<CategoryDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateCategoryCommand(CreateCategoryRequest Request) : IRequest<CategoryDto>;
public record UpdateCategoryCommand(Guid Id, UpdateCategoryRequest Request) : IRequest<CategoryDto>;
public record DeleteCategoryCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class CategoryQueryHandler :
    IRequestHandler<GetCategoryByIdQuery, CategoryDto>,
    IRequestHandler<ListCategoriesQuery, PaginatedResult<CategoryDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public CategoryQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<CategoryDto> Handle(GetCategoryByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.Categories
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Category", request.Id);
        return c.Adapt<CategoryDto>();
    }

    public async Task<PaginatedResult<CategoryDto>> Handle(ListCategoriesQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Categories.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (req.ParentId.HasValue) q = q.Where(x => x.ParentId == req.ParentId);
        if (req.IsActive.HasValue) q = q.Where(x => x.IsActive == req.IsActive.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<CategoryDto>
        {
            Items = items.Select(x => x.Adapt<CategoryDto>()).ToList(),
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }
}

public class CategoryCommandHandler :
    IRequestHandler<CreateCategoryCommand, CategoryDto>,
    IRequestHandler<UpdateCategoryCommand, CategoryDto>,
    IRequestHandler<DeleteCategoryCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public CategoryCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<CategoryDto> Handle(CreateCategoryCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        var exists = await _db.Categories.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code, ct);
        if (exists) throw new ConflictException($"Mã danh mục '{r.Code}' đã tồn tại");

        if (r.ParentId.HasValue)
        {
            var parentOk = await _db.Categories.AnyAsync(x => x.Id == r.ParentId && x.TenantId == _tenant.TenantId, ct);
            if (!parentOk) throw new NotFoundException("Category cha", r.ParentId);
        }

        var entity = new Category
        {
            TenantId = _tenant.TenantId!.Value,
            ParentId = r.ParentId,
            Name = r.Name,
            Code = r.Code,
            Description = r.Description,
            SortOrder = r.SortOrder,
            IsActive = r.IsActive,
        };
        _db.Categories.Add(entity);
        await _db.SaveChangesAsync(ct);
        return entity.Adapt<CategoryDto>();
    }

    public async Task<CategoryDto> Handle(UpdateCategoryCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.Categories.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Category", req.Id);
        var r = req.Request;
        if (!string.IsNullOrEmpty(r.Name)) c.Name = r.Name;
        if (!string.IsNullOrEmpty(r.Code) && r.Code != c.Code)
        {
            var exists = await _db.Categories.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code && x.Id != req.Id, ct);
            if (exists) throw new ConflictException($"Mã danh mục '{r.Code}' đã tồn tại");
            c.Code = r.Code;
        }
        if (r.Description != null) c.Description = r.Description;
        if (r.ParentId.HasValue) c.ParentId = r.ParentId;
        if (r.SortOrder.HasValue) c.SortOrder = r.SortOrder.Value;
        if (r.IsActive.HasValue) c.IsActive = r.IsActive.Value;
        await _db.SaveChangesAsync(ct);
        return c.Adapt<CategoryDto>();
    }

    public async Task<Unit> Handle(DeleteCategoryCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.Categories.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Category", req.Id);
        var hasChildren = await _db.Categories.AnyAsync(x => x.ParentId == req.Id, ct);
        if (hasChildren) throw new ConflictException("Không thể xóa: danh mục còn chứa danh mục con");
        var hasProducts = await _db.Products.AnyAsync(p => p.CategoryId == req.Id, ct);
        if (hasProducts) throw new ConflictException("Không thể xóa: danh mục còn chứa sản phẩm");
        _db.Categories.Remove(c);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
