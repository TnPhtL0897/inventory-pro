using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Application.Common.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Tenancy;

// Queries
public record GetBranchByIdQuery(Guid Id) : IRequest<BranchDto>;
public record ListBranchesQuery(int Page = 1, int PageSize = 50, string? Status = null)
    : IRequest<PaginatedResult<BranchDto>>;

// Commands
public record CreateBranchCommand(CreateBranchRequest Request) : IRequest<BranchDto>;
public record UpdateBranchCommand(Guid Id, UpdateBranchRequest Request) : IRequest<BranchDto>;
public record DeleteBranchCommand(Guid Id) : IRequest<Unit>;

// Handlers
public class BranchQueryHandler :
    IRequestHandler<GetBranchByIdQuery, BranchDto>,
    IRequestHandler<ListBranchesQuery, PaginatedResult<BranchDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BranchQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BranchDto> Handle(GetBranchByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var b = await _db.Branches
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Branch", req.Id);
        return b.Adapt<BranchDto>();
    }

    public async Task<PaginatedResult<BranchDto>> Handle(ListBranchesQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Branches.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (!string.IsNullOrEmpty(req.Status))
        {
            var st = Enum.Parse<BranchStatus>(req.Status, ignoreCase: true);
            q = q.Where(x => x.Status == st);
        }
        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.Name)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        return new PaginatedResult<BranchDto>
        {
            Items = items.Select(x => x.Adapt<BranchDto>()).ToList(),
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }
}

public class BranchCommandHandler :
    IRequestHandler<CreateBranchCommand, BranchDto>,
    IRequestHandler<UpdateBranchCommand, BranchDto>,
    IRequestHandler<DeleteBranchCommand, Unit>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BranchCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BranchDto> Handle(CreateBranchCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        var exists = await _db.Branches.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code, ct);
        if (exists) throw new ConflictException($"MÃ£ chi nhÃ¡nh '{r.Code}' Ä‘Ã£ tá»“n táº¡i");

        // Náº¿u lÃ  default thÃ¬ unset cÃ¡c default khÃ¡c
        if (r.IsDefault)
        {
            await _db.Branches
                .Where(x => x.TenantId == _tenant.TenantId && x.IsDefault)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDefault, false), ct);
        }

        var entity = new Branch
        {
            TenantId = _tenant.TenantId!.Value,
            Name = r.Name,
            Code = r.Code,
            Address = r.Address,
            Phone = r.Phone,
            IsDefault = r.IsDefault,
        };
        _db.Branches.Add(entity);
        await _db.SaveChangesAsync(ct);
        return entity.Adapt<BranchDto>();
    }

    public async Task<BranchDto> Handle(UpdateBranchCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var b = await _db.Branches.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Branch", req.Id);
        var r = req.Request;
        if (!string.IsNullOrEmpty(r.Name)) b.Name = r.Name;
        if (!string.IsNullOrEmpty(r.Code) && r.Code != b.Code)
        {
            var exists = await _db.Branches.AnyAsync(x => x.TenantId == _tenant.TenantId && x.Code == r.Code && x.Id != req.Id, ct);
            if (exists) throw new ConflictException($"MÃ£ chi nhÃ¡nh '{r.Code}' Ä‘Ã£ tá»“n táº¡i");
            b.Code = r.Code;
        }
        if (r.Address != null) b.Address = r.Address;
        if (r.Phone != null) b.Phone = r.Phone;
        if (r.IsDefault.HasValue && r.IsDefault.Value)
        {
            await _db.Branches
                .Where(x => x.TenantId == _tenant.TenantId && x.IsDefault && x.Id != req.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDefault, false), ct);
            b.IsDefault = true;
        }
        else if (r.IsDefault.HasValue)
        {
            b.IsDefault = false;
        }
        if (!string.IsNullOrEmpty(r.Status))
        {
            if (!Enum.TryParse<BranchStatus>(r.Status, true, out var st))
                throw new ValidationException($"Status '{r.Status}' khÃ´ng há»£p lá»‡");
            b.Status = st;
        }
        await _db.SaveChangesAsync(ct);
        return b.Adapt<BranchDto>();
    }

    public async Task<Unit> Handle(DeleteBranchCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var b = await _db.Branches.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("Branch", req.Id);
        var hasWarehouses = await _db.Warehouses.AnyAsync(w => w.BranchId == req.Id, ct);
        if (hasWarehouses) throw new ConflictException("KhÃ´ng thá»ƒ Ä‘Ã³ng: chi nhÃ¡nh cÃ²n kho");
        b.Status = BranchStatus.Closed;
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
