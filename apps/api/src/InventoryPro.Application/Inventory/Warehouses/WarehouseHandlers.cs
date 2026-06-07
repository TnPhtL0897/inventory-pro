using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.Warehouses;

public record GetWarehouseByIdQuery(Guid Id) : IRequest<WarehouseDto>;
public record ListWarehousesQuery(int Page = 1, int PageSize = 20, Guid? BranchId = null, string? Status = null, string? Type = null) : IRequest<PaginatedResult<WarehouseDto>>;
public record CreateWarehouseCommand(CreateWarehouseRequest Request) : IRequest<WarehouseDto>;
public record UpdateWarehouseCommand(Guid Id, UpdateWarehouseRequest Request) : IRequest<WarehouseDto>;
public record DeleteWarehouseCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class WarehouseQueryHandler :
    IRequestHandler<GetWarehouseByIdQuery, WarehouseDto>,
    IRequestHandler<ListWarehousesQuery, PaginatedResult<WarehouseDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public WarehouseQueryHandler(InventoryDbContext db, TenantContext tenant)
    {
        _db = db; _tenant = tenant;
    }

    public async Task<WarehouseDto> Handle(GetWarehouseByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var w = await _db.Warehouses
            .AsNoTracking()
            .Include(x => x.Locations)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {req.Id} không tồn tại");
        return ToDto(w);
    }

    public async Task<PaginatedResult<WarehouseDto>> Handle(ListWarehousesQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Warehouses.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (req.BranchId.HasValue) q = q.Where(x => x.BranchId == req.BranchId);
        if (!string.IsNullOrEmpty(req.Status))
        {
            var st = Enum.Parse<WarehouseStatus>(req.Status, ignoreCase: true);
            q = q.Where(x => x.Status == st);
        }
        if (!string.IsNullOrEmpty(req.Type))
        {
            var tp = ParseType(req.Type);
            q = q.Where(x => x.Type == tp);
        }
        var total = await q.CountAsync(ct);
        var items = await q.Include(x => x.Locations)
            .OrderBy(x => x.Name)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<WarehouseDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }

    internal static WarehouseType ParseType(string raw)
    {
        if (Enum.TryParse<WarehouseType>(raw, ignoreCase: true, out var t))
            return t;
        throw new ValidationException(new[]
        {
            new FluentValidation.Results.ValidationFailure(nameof(WarehouseDto.Type),
                $"warehouse_type không hợp lệ: '{raw}'. Chỉ chấp nhận: RECEIVING, ISSUE.")
        });
    }

    private static WarehouseDto ToDto(Warehouse w) => new(
        w.Id, w.BranchId, w.Name, w.Code, w.Address, w.Phone, w.ManagerId,
        w.IsDefault, w.AllowNegative,
        w.Status.ToString(), w.Type.ToString().ToUpperInvariant(),
        w.Locations?.Count ?? 0,
        w.CreatedAt, w.UpdatedAt);
}

public class WarehouseCommandHandler :
    IRequestHandler<CreateWarehouseCommand, WarehouseDto>,
    IRequestHandler<UpdateWarehouseCommand, WarehouseDto>,
    IRequestHandler<DeleteWarehouseCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public WarehouseCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<WarehouseDto> Handle(CreateWarehouseCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        // Branch phải thuộc cùng tenant - FK constraint ở DB sẽ enforce, ở đây cứ try/catch
        var w = new Warehouse
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            Name = r.Name,
            Code = r.Code,
            Address = r.Address,
            Phone = r.Phone,
            ManagerId = r.ManagerId,
            IsDefault = r.IsDefault,
            AllowNegative = r.AllowNegative,
            Type = string.IsNullOrEmpty(r.Type)
                ? WarehouseType.Receiving
                : WarehouseQueryHandler.ParseType(r.Type),
        };
        _db.Warehouses.Add(w);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("unique", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new ConflictException($"Mã kho '{r.Code}' đã tồn tại trong branch này");
        }

        var created = await _db.Warehouses.Include(x => x.Locations).AsNoTracking()
            .FirstAsync(x => x.Id == w.Id, ct);
        return created.Adapt<WarehouseDto>();
    }

    public async Task<WarehouseDto> Handle(UpdateWarehouseCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var w = await _db.Warehouses.Include(x => x.Locations)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {req.Id} không tồn tại");
        var r = req.Request;
        if (!string.IsNullOrEmpty(r.Name)) w.Name = r.Name;
        if (!string.IsNullOrEmpty(r.Code)) w.Code = r.Code;
        if (r.Address != null) w.Address = r.Address;
        if (r.Phone != null) w.Phone = r.Phone;
        if (r.ManagerId.HasValue) w.ManagerId = r.ManagerId;
        if (r.IsDefault.HasValue) w.IsDefault = r.IsDefault.Value;
        if (r.AllowNegative.HasValue) w.AllowNegative = r.AllowNegative.Value;
        if (!string.IsNullOrEmpty(r.Status) && Enum.TryParse<WarehouseStatus>(r.Status, true, out var s)) w.Status = s;
        if (!string.IsNullOrEmpty(r.Type)) w.Type = WarehouseQueryHandler.ParseType(r.Type);
        await _db.SaveChangesAsync(ct);
        return w.Adapt<WarehouseDto>();
    }

    public async Task<Unit> Handle(DeleteWarehouseCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var w = await _db.Warehouses.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {req.Id} không tồn tại");
        // Không cho xóa nếu còn location hoặc stock
        var hasLocations = await _db.Locations.AnyAsync(l => l.WarehouseId == req.Id, ct);
        if (hasLocations) throw new ConflictException("Không thể xóa: kho còn chứa vị trí");
        var hasStock = await _db.Stock.AnyAsync(s => s.WarehouseId == req.Id, ct);
        if (hasStock) throw new ConflictException("Không thể xóa: kho còn tồn kho");
        w.Status = WarehouseStatus.Closed;
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
