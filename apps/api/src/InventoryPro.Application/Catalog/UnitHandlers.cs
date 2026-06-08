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
public record GetUnitByIdQuery(Guid Id) : IRequest<UnitOfMeasureDto>;
public record ListUnitsQuery(int Page = 1, int PageSize = 50, bool? IsActive = null)
    : IRequest<PaginatedResult<UnitOfMeasureDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateUnitCommand(CreateUnitRequest Request) : IRequest<UnitOfMeasureDto>;
public record UpdateUnitCommand(Guid Id, UpdateUnitRequest Request) : IRequest<UnitOfMeasureDto>;
public record DeleteUnitCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class UnitQueryHandler :
    IRequestHandler<GetUnitByIdQuery, UnitOfMeasureDto>,
    IRequestHandler<ListUnitsQuery, PaginatedResult<UnitOfMeasureDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public UnitQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<UnitOfMeasureDto> Handle(GetUnitByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var u = await _db.UnitsOfMeasure
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("UnitOfMeasure", req.Id);
        return ToDto(u);
    }

    public async Task<PaginatedResult<UnitOfMeasureDto>> Handle(ListUnitsQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.UnitsOfMeasure.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (req.IsActive.HasValue) q = q.Where(x => x.IsActive == req.IsActive.Value);
        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.Code)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<UnitOfMeasureDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }

    private static UnitOfMeasureDto ToDto(UnitOfMeasure u) => new(
        u.Id, u.Code, u.Name, u.UnitType.ToString(), u.IsActive, u.CreatedAt, u.UpdatedAt);
}

public class UnitCommandHandler :
    IRequestHandler<CreateUnitCommand, UnitOfMeasureDto>,
    IRequestHandler<UpdateUnitCommand, UnitOfMeasureDto>,
    IRequestHandler<DeleteUnitCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public UnitCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<UnitOfMeasureDto> Handle(CreateUnitCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        var exists = await _db.UnitsOfMeasure.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code, ct);
        if (exists) throw new ConflictException($"Mã đơn vị '{r.Code}' đã tồn tại");

        var ut = UnitType.Count;
        if (!string.IsNullOrEmpty(r.UnitType))
        {
            if (!Enum.TryParse<UnitType>(r.UnitType, true, out ut))
                throw new ValidationException($"UnitType '{r.UnitType}' không hợp lệ");
        }

        var entity = new UnitOfMeasure
        {
            TenantId = _tenant.TenantId!.Value,
            Code = r.Code,
            Name = r.Name,
            UnitType = ut,
            IsActive = r.IsActive,
        };
        _db.UnitsOfMeasure.Add(entity);
        await _db.SaveChangesAsync(ct);
        return new UnitOfMeasureDto(entity.Id, entity.Code, entity.Name,
            entity.UnitType.ToString(), entity.IsActive, entity.CreatedAt, entity.UpdatedAt);
    }

    public async Task<UnitOfMeasureDto> Handle(UpdateUnitCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var u = await _db.UnitsOfMeasure.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("UnitOfMeasure", req.Id);
        var r = req.Request;
        if (!string.IsNullOrEmpty(r.Code) && r.Code != u.Code)
        {
            var exists = await _db.UnitsOfMeasure.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code && x.Id != req.Id, ct);
            if (exists) throw new ConflictException($"Mã đơn vị '{r.Code}' đã tồn tại");
            u.Code = r.Code;
        }
        if (!string.IsNullOrEmpty(r.Name)) u.Name = r.Name;
        if (!string.IsNullOrEmpty(r.UnitType))
        {
            if (!Enum.TryParse<UnitType>(r.UnitType, true, out var ut))
                throw new ValidationException($"UnitType '{r.UnitType}' không hợp lệ");
            u.UnitType = ut;
        }
        if (r.IsActive.HasValue) u.IsActive = r.IsActive.Value;
        await _db.SaveChangesAsync(ct);
        return new UnitOfMeasureDto(u.Id, u.Code, u.Name, u.UnitType.ToString(), u.IsActive, u.CreatedAt, u.UpdatedAt);
    }

    public async Task<Unit> Handle(DeleteUnitCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var u = await _db.UnitsOfMeasure.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("UnitOfMeasure", req.Id);
        var inUse = await _db.Products.AnyAsync(p => p.BaseUnitId == req.Id, ct);
        if (inUse) throw new ConflictException("Không thể xóa: đơn vị đang được sử dụng làm base unit của sản phẩm");
        _db.UnitsOfMeasure.Remove(u);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
