using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Bidding;

using InventoryPro.Application.Common.Tenancy;

// =============================================================================
// BID PLAN HANDLERS
// =============================================================================

public record GetBidPlanByIdQuery(Guid Id) : IRequest<BidPlanDto>;
public record ListBidPlansQuery(
    int Page = 1,
    int PageSize = 20,
    int? FiscalYear = null,
    string? Status = null) : IRequest<PaginatedResult<BidPlanDto>>;
public record CreateBidPlanCommand(CreateBidPlanRequest Request) : IRequest<BidPlanDto>;
public record UpdateBidPlanCommand(Guid Id, UpdateBidPlanRequest Request) : IRequest<BidPlanDto>;
public record DeleteBidPlanCommand(Guid Id) : IRequest<Unit>;
public record ApproveBidPlanCommand(Guid Id, string? Notes) : IRequest<BidPlanDto>;

public class BidPlanQueryHandler :
    IRequestHandler<GetBidPlanByIdQuery, BidPlanDto>,
    IRequestHandler<ListBidPlansQuery, PaginatedResult<BidPlanDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidPlanQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidPlanDto> Handle(GetBidPlanByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPlans.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPlan {request.Id} không tồn tại");
        var packageCount = await _db.BidPackages.CountAsync(x => x.BidPlanId == p.Id, ct);
        return ToDto(p, packageCount);
    }

    public async Task<PaginatedResult<BidPlanDto>> Handle(ListBidPlansQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.BidPlans.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (request.FiscalYear.HasValue) q = q.Where(x => x.FiscalYear == request.FiscalYear.Value);
        if (!string.IsNullOrEmpty(request.Status)) q = q.Where(x => x.Status == request.Status);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.FiscalYear)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var ids = items.Select(i => i.Id).ToList();
        var packageCounts = await _db.BidPackages
            .Where(p => ids.Contains(p.BidPlanId!.Value))
            .GroupBy(p => p.BidPlanId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Id, g => g.Count, ct);

        return new PaginatedResult<BidPlanDto>
        {
            Items = items.Select(p => ToDto(p, packageCounts.GetValueOrDefault(p.Id, 0))).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public static BidPlanDto ToDto(BidPlan p, int packageCount) =>
        new(p.Id, p.PlanNo, p.FiscalYear, p.Title, p.TotalEstimatedValue, p.Status,
            p.ApprovedBy, p.ApprovedAt, p.Notes, packageCount, p.CreatedAt, p.UpdatedAt);
}

public class BidPlanCommandHandler :
    IRequestHandler<CreateBidPlanCommand, BidPlanDto>,
    IRequestHandler<UpdateBidPlanCommand, BidPlanDto>,
    IRequestHandler<DeleteBidPlanCommand, Unit>,
    IRequestHandler<ApproveBidPlanCommand, BidPlanDto>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidPlanCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidPlanDto> Handle(CreateBidPlanCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        if (string.IsNullOrWhiteSpace(r.Title))
            throw new ValidationException("Tiêu đề KHĐT không được trống");
        if (r.FiscalYear < 2000 || r.FiscalYear > 2100)
            throw new ValidationException("Năm tài chính không hợp lệ");

        // Generate plan_no
        var prefix = $"KHĐT-{r.FiscalYear}-";
        var count = await _db.BidPlans.CountAsync(p => p.TenantId == _tenant.TenantId && p.PlanNo.StartsWith(prefix), ct);
        var planNo = $"{prefix}{(count + 1).ToString("D4")}";

        var entity = new BidPlan
        {
            TenantId = _tenant.TenantId!.Value,
            PlanNo = planNo,
            FiscalYear = r.FiscalYear,
            Title = r.Title,
            TotalEstimatedValue = r.TotalEstimatedValue,
            Notes = r.Notes,
            Status = "DRAFT",
            CreatedBy = _tenant.UserId,
        };
        _db.BidPlans.Add(entity);
        await _db.SaveChangesAsync(ct);
        return BidPlanQueryHandler.ToDto(entity, 0);
    }

    public async Task<BidPlanDto> Handle(UpdateBidPlanCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPlans.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPlan {request.Id} không tồn tại");
        if (p.Status != "DRAFT") throw new BusinessRuleException("Chỉ KHĐT ở trạng thái DRAFT mới sửa được");

        p.Title = request.Request.Title;
        p.TotalEstimatedValue = request.Request.TotalEstimatedValue;
        p.Notes = request.Request.Notes;
        await _db.SaveChangesAsync(ct);
        var packageCount = await _db.BidPackages.CountAsync(x => x.BidPlanId == p.Id, ct);
        return BidPlanQueryHandler.ToDto(p, packageCount);
    }

    public async Task<Unit> Handle(DeleteBidPlanCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPlans.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPlan {request.Id} không tồn tại");
        if (p.Status != "DRAFT") throw new BusinessRuleException("Chỉ xóa được KHĐT ở trạng thái DRAFT");
        _db.BidPlans.Remove(p);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<BidPlanDto> Handle(ApproveBidPlanCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPlans.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPlan {request.Id} không tồn tại");
        if (p.Status != "DRAFT") throw new BusinessRuleException("Chỉ duyệt KHĐT ở trạng thái DRAFT");

        p.Status = "APPROVED";
        p.ApprovedBy = _tenant.UserId;
        p.ApprovedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        var packageCount = await _db.BidPackages.CountAsync(x => x.BidPlanId == p.Id, ct);
        return BidPlanQueryHandler.ToDto(p, packageCount);
    }
}
