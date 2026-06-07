using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.Warehouses;

// =============================================================================
// Queries
// =============================================================================
public record GetLocationByIdQuery(Guid Id) : IRequest<LocationDto>;
public record ListLocationsQuery(int Page = 1, int PageSize = 100, Guid? WarehouseId = null, Guid? ParentId = null, string? LocationType = null, bool? IsPickable = null, string? Status = null)
    : IRequest<PaginatedResult<LocationDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateLocationCommand(CreateLocationRequest Request) : IRequest<LocationDto>;
public record UpdateLocationCommand(Guid Id, UpdateLocationRequest Request) : IRequest<LocationDto>;
public record DeleteLocationCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class LocationQueryHandler :
    IRequestHandler<GetLocationByIdQuery, LocationDto>,
    IRequestHandler<ListLocationsQuery, PaginatedResult<LocationDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public LocationQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<LocationDto> Handle(GetLocationByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var l = await _db.Locations
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Location", req.Id);
        return ToDto(l);
    }

    public async Task<PaginatedResult<LocationDto>> Handle(ListLocationsQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Locations.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (req.WarehouseId.HasValue) q = q.Where(x => x.WarehouseId == req.WarehouseId);
        if (req.ParentId.HasValue) q = q.Where(x => x.ParentId == req.ParentId);
        if (!string.IsNullOrEmpty(req.LocationType))
        {
            var lt = Enum.Parse<LocationType>(req.LocationType, ignoreCase: true);
            q = q.Where(x => x.LocationType == lt);
        }
        if (req.IsPickable.HasValue) q = q.Where(x => x.IsPickable == req.IsPickable.Value);
        if (!string.IsNullOrEmpty(req.Status))
        {
            var st = Enum.Parse<LocationStatus>(req.Status, ignoreCase: true);
            q = q.Where(x => x.Status == st);
        }
        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.PickSequence).ThenBy(x => x.Code)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<LocationDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }

    private static LocationDto ToDto(Location l) => new(
        l.Id, l.WarehouseId, l.ParentId, l.Name, l.Code, l.Barcode,
        l.LocationType.ToString(), l.Status.ToString(), l.IsPickable, l.PickSequence);
}

public class LocationCommandHandler :
    IRequestHandler<CreateLocationCommand, LocationDto>,
    IRequestHandler<UpdateLocationCommand, LocationDto>,
    IRequestHandler<DeleteLocationCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public LocationCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<LocationDto> Handle(CreateLocationCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        var warehouseOk = await _db.Warehouses.AnyAsync(w => w.Id == r.WarehouseId && w.TenantId == _tenant.TenantId, ct);
        if (!warehouseOk) throw new NotFoundException("Warehouse", r.WarehouseId);

        var exists = await _db.Locations.AnyAsync(x => x.WarehouseId == r.WarehouseId && x.Code == r.Code, ct);
        if (exists) throw new ConflictException($"Mã vị trí '{r.Code}' đã tồn tại trong kho này");

        if (r.ParentId.HasValue)
        {
            var parentOk = await _db.Locations.AnyAsync(x => x.Id == r.ParentId && x.WarehouseId == r.WarehouseId, ct);
            if (!parentOk) throw new NotFoundException("Location cha", r.ParentId);
        }

        var lt = LocationType.Storage;
        if (!string.IsNullOrEmpty(r.LocationType))
        {
            if (!Enum.TryParse<LocationType>(r.LocationType, true, out lt))
                throw new ValidationException($"LocationType '{r.LocationType}' không hợp lệ");
        }

        var entity = new Location
        {
            TenantId = _tenant.TenantId!.Value,
            // Branch từ warehouse
            BranchId = (await _db.Warehouses.AsNoTracking().FirstAsync(w => w.Id == r.WarehouseId, ct)).BranchId,
            WarehouseId = r.WarehouseId,
            ParentId = r.ParentId,
            Name = r.Name,
            Code = r.Code,
            Barcode = r.Barcode,
            LocationType = lt,
            PickSequence = r.PickSequence,
            IsPickable = r.IsPickable,
        };
        _db.Locations.Add(entity);
        await _db.SaveChangesAsync(ct);
        return new LocationDto(entity.Id, entity.WarehouseId, entity.ParentId, entity.Name, entity.Code,
            entity.Barcode, entity.LocationType.ToString(), entity.Status.ToString(), entity.IsPickable, entity.PickSequence);
    }

    public async Task<LocationDto> Handle(UpdateLocationCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var l = await _db.Locations.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Location", req.Id);
        if (!string.IsNullOrEmpty(req.Name)) l.Name = req.Name;
        if (!string.IsNullOrEmpty(req.Code) && req.Code != l.Code)
        {
            var exists = await _db.Locations.AnyAsync(x => x.WarehouseId == l.WarehouseId && x.Code == req.Code && x.Id != req.Id, ct);
            if (exists) throw new ConflictException($"Mã vị trí '{req.Code}' đã tồn tại");
            l.Code = req.Code;
        }
        if (req.Barcode != null) l.Barcode = req.Barcode;
        if (req.PickSequence.HasValue) l.PickSequence = req.PickSequence.Value;
        if (req.IsPickable.HasValue) l.IsPickable = req.IsPickable.Value;
        if (!string.IsNullOrEmpty(req.LocationType))
        {
            if (!Enum.TryParse<LocationType>(req.LocationType, true, out var lt))
                throw new ValidationException($"LocationType '{req.LocationType}' không hợp lệ");
            l.LocationType = lt;
        }
        if (!string.IsNullOrEmpty(req.Status))
        {
            if (!Enum.TryParse<LocationStatus>(req.Status, true, out var st))
                throw new ValidationException($"Status '{req.Status}' không hợp lệ");
            l.Status = st;
        }
        await _db.SaveChangesAsync(ct);
        return new LocationDto(l.Id, l.WarehouseId, l.ParentId, l.Name, l.Code, l.Barcode,
            l.LocationType.ToString(), l.Status.ToString(), l.IsPickable, l.PickSequence);
    }

    public async Task<Unit> Handle(DeleteLocationCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var l = await _db.Locations.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Location", req.Id);
        var hasChildren = await _db.Locations.AnyAsync(x => x.ParentId == req.Id, ct);
        if (hasChildren) throw new ConflictException("Không thể xóa: vị trí còn chứa vị trí con");
        var hasStock = await _db.Stock.AnyAsync(s => s.LocationId == req.Id, ct);
        if (hasStock) throw new ConflictException("Không thể xóa: vị trí còn tồn kho");
        _db.Locations.Remove(l);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
