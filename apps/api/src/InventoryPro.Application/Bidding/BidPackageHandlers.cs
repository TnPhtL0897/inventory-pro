using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Application.Common.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Bidding;

using InventoryPro.Application.Common.Tenancy;

// =============================================================================
// BID PACKAGE HANDLERS
// =============================================================================

public record GetBidPackageByIdQuery(Guid Id) : IRequest<BidPackageDto>;
public record ListBidPackagesQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? BidPlanId = null,
    string? Status = null,
    string? Type = null) : IRequest<PaginatedResult<BidPackageDto>>;
public record CreateBidPackageCommand(CreateBidPackageRequest Request) : IRequest<BidPackageDto>;
public record UpdateBidPackageCommand(Guid Id, UpdateBidPackageRequest Request) : IRequest<BidPackageDto>;
public record DeleteBidPackageCommand(Guid Id) : IRequest<Unit>;
public record PublishBidPackageCommand(Guid Id, PublishBidPackageRequest Request) : IRequest<BidPackageDto>;

public class BidPackageQueryHandler :
    IRequestHandler<GetBidPackageByIdQuery, BidPackageDto>,
    IRequestHandler<ListBidPackagesQuery, PaginatedResult<BidPackageDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidPackageQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidPackageDto> Handle(GetBidPackageByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPackages.AsNoTracking()
            .Include(x => x.BidPlan)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPackage {request.Id} khÃ´ng tá»“n táº¡i");
        var lotCount = await _db.BidLots.CountAsync(x => x.BidPackageId == p.Id, ct);
        return ToDto(p, lotCount);
    }

    public async Task<PaginatedResult<BidPackageDto>> Handle(ListBidPackagesQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.BidPackages.AsNoTracking().Include(x => x.BidPlan)
            .Where(x => x.TenantId == _tenant.TenantId);
        if (request.BidPlanId.HasValue) q = q.Where(x => x.BidPlanId == request.BidPlanId.Value);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<BidPackageStatus>(request.Status, true);
            q = q.Where(x => x.BidPackageStatus == st);
        }
        if (!string.IsNullOrEmpty(request.Type))
        {
            var ty = Enum.Parse<BidPackageType>(request.Type, true);
            q = q.Where(x => x.BidPackageType == ty);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var ids = items.Select(i => i.Id).ToList();
        var lotCounts = await _db.BidLots
            .Where(l => ids.Contains(l.BidPackageId))
            .GroupBy(l => l.BidPackageId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Id, g => g.Count, ct);

        return new PaginatedResult<BidPackageDto>
        {
            Items = items.Select(p => ToDto(p, lotCounts.GetValueOrDefault(p.Id, 0))).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public static BidPackageDto ToDto(BidPackage p, int lotCount) =>
        new(p.Id, p.PackageNo, p.PackageName, p.BidPlanId, p.BidPlan?.PlanNo,
            p.BidPackageType.ToString().ToUpperInvariant(),
            p.BidPackageStatus.ToString().ToUpperInvariant(),
            p.PublishDate, p.BidOpenDate, p.BidCloseDate, p.TotalEstimatedValue,
            p.ProcurementMethod, p.DecisionNo, p.DecisionDate, p.Notes,
            lotCount, p.CreatedAt, p.UpdatedAt);
}

public class BidPackageCommandHandler :
    IRequestHandler<CreateBidPackageCommand, BidPackageDto>,
    IRequestHandler<UpdateBidPackageCommand, BidPackageDto>,
    IRequestHandler<DeleteBidPackageCommand, Unit>,
    IRequestHandler<PublishBidPackageCommand, BidPackageDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidPackageCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidPackageDto> Handle(CreateBidPackageCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        if (string.IsNullOrWhiteSpace(r.PackageName))
            throw new ValidationException("TÃªn gÃ³i tháº§u khÃ´ng Ä‘Æ°á»£c trá»‘ng");

        // Auto-generate package_no
        var count = await _db.BidPackages.CountAsync(p => p.TenantId == _tenant.TenantId, ct);
        var packageNo = $"GTHAU-{(count + 1).ToString("D4")}";

        var entity = new BidPackage
        {
            TenantId = _tenant.TenantId!.Value,
            BidPlanId = r.BidPlanId,
            PackageNo = packageNo,
            PackageName = r.PackageName,
            BidPackageType = Enum.Parse<BidPackageType>(r.BidPackageType, true),
            BidPackageStatus = BidPackageStatus.Draft,
            PublishDate = r.PublishDate,
            BidOpenDate = r.BidOpenDate,
            BidCloseDate = r.BidCloseDate,
            TotalEstimatedValue = r.TotalEstimatedValue,
            ProcurementMethod = r.ProcurementMethod,
            DecisionNo = r.DecisionNo,
            DecisionDate = r.DecisionDate,
            Notes = r.Notes,
            CreatedBy = _tenant.UserId,
        };
        _db.BidPackages.Add(entity);
        await _db.SaveChangesAsync(ct);
        return BidPackageQueryHandler.ToDto(entity, 0);
    }

    public async Task<BidPackageDto> Handle(UpdateBidPackageCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPackages.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPackage {request.Id} khÃ´ng tá»“n táº¡i");
        if (p.BidPackageStatus != BidPackageStatus.Draft)
            throw new BusinessRuleException("Chá»‰ gÃ³i tháº§u á»Ÿ tráº¡ng thÃ¡i DRAFT má»›i sá»­a Ä‘Æ°á»£c");

        p.PackageName = request.Request.PackageName;
        p.PublishDate = request.Request.PublishDate;
        p.BidOpenDate = request.Request.BidOpenDate;
        p.BidCloseDate = request.Request.BidCloseDate;
        p.TotalEstimatedValue = request.Request.TotalEstimatedValue;
        p.ProcurementMethod = request.Request.ProcurementMethod;
        p.DecisionNo = request.Request.DecisionNo;
        p.DecisionDate = request.Request.DecisionDate;
        p.Notes = request.Request.Notes;
        await _db.SaveChangesAsync(ct);
        var lotCount = await _db.BidLots.CountAsync(x => x.BidPackageId == p.Id, ct);
        return BidPackageQueryHandler.ToDto(p, lotCount);
    }

    public async Task<Unit> Handle(DeleteBidPackageCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPackages.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPackage {request.Id} khÃ´ng tá»“n táº¡i");
        if (p.BidPackageStatus != BidPackageStatus.Draft)
            throw new BusinessRuleException("Chá»‰ xÃ³a Ä‘Æ°á»£c gÃ³i tháº§u á»Ÿ tráº¡ng thÃ¡i DRAFT");
        _db.BidPackages.Remove(p);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<BidPackageDto> Handle(PublishBidPackageCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var p = await _db.BidPackages.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPackage {request.Id} khÃ´ng tá»“n táº¡i");
        if (p.BidPackageStatus != BidPackageStatus.Draft && p.BidPackageStatus != BidPackageStatus.Approved)
            throw new BusinessRuleException("Chá»‰ publish gÃ³i tháº§u á»Ÿ tráº¡ng thÃ¡i DRAFT hoáº·c APPROVED");

        var lotCount = await _db.BidLots.CountAsync(x => x.BidPackageId == p.Id, ct);
        if (lotCount == 0) throw new BusinessRuleException("GÃ³i tháº§u pháº£i cÃ³ Ã­t nháº¥t 1 lÃ´/pháº§n trÆ°á»›c khi publish");

        p.BidPackageStatus = BidPackageStatus.Published;
        p.PublishDate = request.Request.PublishDate;
        p.BidOpenDate = request.Request.BidOpenDate ?? p.BidOpenDate;
        p.BidCloseDate = request.Request.BidCloseDate ?? p.BidCloseDate;
        await _db.SaveChangesAsync(ct);
        return BidPackageQueryHandler.ToDto(p, lotCount);
    }
}
