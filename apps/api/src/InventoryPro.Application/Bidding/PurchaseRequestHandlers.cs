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
// PURCHASE REQUEST HANDLERS (Dá»± trÃ¹ mua sáº¯m)
// =============================================================================

public record GetPurchaseRequestByIdQuery(Guid Id) : IRequest<PurchaseRequestDto>;
public record ListPurchaseRequestsQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? BranchId = null,
    Guid? BidPlanId = null,
    string? Status = null,
    int? FiscalYear = null) : IRequest<PaginatedResult<PurchaseRequestDto>>;
public record CreatePurchaseRequestCommand(CreatePurchaseRequestRequest Request) : IRequest<PurchaseRequestDto>;
public record UpdatePurchaseRequestCommand(Guid Id, UpdatePurchaseRequestRequest Request) : IRequest<PurchaseRequestDto>;
public record DeletePurchaseRequestCommand(Guid Id) : IRequest<Unit>;
public record SubmitPurchaseRequestCommand(Guid Id) : IRequest<PurchaseRequestDto>;
public record ApprovePurchaseRequestCommand(Guid Id, string? Notes) : IRequest<PurchaseRequestDto>;

public class PurchaseRequestQueryHandler :
    IRequestHandler<GetPurchaseRequestByIdQuery, PurchaseRequestDto>,
    IRequestHandler<ListPurchaseRequestsQuery, PaginatedResult<PurchaseRequestDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseRequestQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PurchaseRequestDto> Handle(GetPurchaseRequestByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var pr = await _db.PurchaseRequests.AsNoTracking()
            .Include(p => p.Lines)
            .Include(p => p.BidPlan)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseRequest {request.Id} khÃ´ng tá»“n táº¡i");
        var branch = await _db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == pr.BranchId, ct);
        var productInfo = await LoadProductInfoAsync(pr.Lines, ct);
        return ToDto(pr, branch?.Name, productInfo);
    }

    public async Task<PaginatedResult<PurchaseRequestDto>> Handle(ListPurchaseRequestsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.PurchaseRequests.AsNoTracking()
            .Include(p => p.Lines)
            .Include(p => p.BidPlan)
            .Where(x => x.TenantId == _tenant.TenantId);
        if (request.BranchId.HasValue) q = q.Where(x => x.BranchId == request.BranchId.Value);
        if (request.BidPlanId.HasValue) q = q.Where(x => x.BidPlanId == request.BidPlanId.Value);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<PurchaseRequestStatus>(request.Status, true);
            q = q.Where(x => x.Status == st);
        }
        if (request.FiscalYear.HasValue) q = q.Where(x => x.FiscalYear == request.FiscalYear.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.RequestedDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var branchIds = items.Select(i => i.BranchId).Distinct().ToList();
        var branches = await _db.Branches.AsNoTracking()
            .Where(b => branchIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, b => b.Name, ct);

        var allLines = items.SelectMany(i => i.Lines).ToList();
        var productInfo = await LoadProductInfoAsync(allLines, ct);

        return new PaginatedResult<PurchaseRequestDto>
        {
            Items = items.Select(pr => ToDto(pr, branches.GetValueOrDefault(pr.BranchId), productInfo)).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    private async Task<Dictionary<Guid, (string Sku, string Name, string UnitCode)>> LoadProductInfoAsync(
        IEnumerable<PurchaseRequestLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lines.Select(l => l.UnitId).Distinct().ToList();

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => new { p.Sku, p.Name }, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        var result = new Dictionary<Guid, (string Sku, string Name, string UnitCode)>();
        foreach (var id in productIds)
        {
            products.TryGetValue(id, out var p);
            var unitId = lines.First(l => l.ProductId == id).UnitId;
            units.TryGetValue(unitId, out var u);
            result[id] = (p?.Sku ?? "", p?.Name ?? "", u ?? "");
        }
        return result;
    }

    public static PurchaseRequestDto ToDto(
        PurchaseRequest pr,
        string? branchName,
        Dictionary<Guid, (string Sku, string Name, string UnitCode)> productInfo)
    {
        var lineDtos = pr.Lines.Select(l =>
        {
            var info = productInfo.GetValueOrDefault(l.ProductId, ("", "", ""));
            return new PurchaseRequestLineDto(
                l.Id, l.ProductId, info.Sku, info.Name, l.UnitId, info.UnitCode,
                l.Quantity, l.EstimatedUnitPrice,
                l.Quantity * (l.EstimatedUnitPrice ?? 0), l.Notes);
        }).ToList();

        return new PurchaseRequestDto(
            pr.Id, pr.PrNumber, pr.BranchId, branchName,
            pr.BidPlanId, pr.BidPlan?.PlanNo,
            pr.RequestDept, pr.RequesterId, pr.FiscalYear,
            pr.Status.ToString().ToUpperInvariant(),
            pr.RequestedDate, pr.ApprovedBy, pr.ApprovedAt, pr.Notes,
            lineDtos, pr.CreatedAt, pr.UpdatedAt);
    }
}

public class PurchaseRequestCommandHandler :
    IRequestHandler<CreatePurchaseRequestCommand, PurchaseRequestDto>,
    IRequestHandler<UpdatePurchaseRequestCommand, PurchaseRequestDto>,
    IRequestHandler<DeletePurchaseRequestCommand, Unit>,
    IRequestHandler<SubmitPurchaseRequestCommand, PurchaseRequestDto>,
    IRequestHandler<ApprovePurchaseRequestCommand, PurchaseRequestDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseRequestCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PurchaseRequestDto> Handle(CreatePurchaseRequestCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("Dá»± trÃ¹ pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        var branch = await _db.Branches.FirstOrDefaultAsync(b => b.Id == r.BranchId && b.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Branch {r.BranchId} khÃ´ng tá»“n táº¡i");

        // Generate pr_number
        var year = r.RequestedDate?.Year ?? DateTime.UtcNow.Year;
        var prefix = $"DT-{year}-";
        var count = await _db.PurchaseRequests.CountAsync(p => p.TenantId == _tenant.TenantId && p.PrNumber.StartsWith(prefix), ct);
        var prNumber = $"{prefix}{(count + 1).ToString("D4")}";

        var entity = new PurchaseRequest
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            BidPlanId = r.BidPlanId,
            PrNumber = prNumber,
            RequestDept = r.RequestDept,
            RequesterId = _tenant.UserId,
            FiscalYear = r.FiscalYear ?? year,
            Status = PurchaseRequestStatus.Draft,
            RequestedDate = r.RequestedDate ?? DateTime.UtcNow.Date,
            Notes = r.Notes,
            CreatedBy = _tenant.UserId,
        };

        // Load products
        var productIds = r.Lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = r.Lines.Select(l => l.UnitId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(p => p.Id, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        foreach (var line in r.Lines)
        {
            if (!products.ContainsKey(line.ProductId))
                throw new NotFoundException($"Product {line.ProductId} khÃ´ng tá»“n táº¡i");
            if (!units.ContainsKey(line.UnitId))
                throw new NotFoundException($"Unit {line.UnitId} khÃ´ng tá»“n táº¡i");

            entity.Lines.Add(new PurchaseRequestLine
            {
                TenantId = _tenant.TenantId.Value,
                ProductId = line.ProductId,
                Quantity = line.Quantity,
                UnitId = line.UnitId,
                EstimatedUnitPrice = line.EstimatedUnitPrice,
                Notes = line.Notes,
            });
        }

        _db.PurchaseRequests.Add(entity);
        await _db.SaveChangesAsync(ct);

        return PurchaseRequestQueryHandler.ToDto(entity, branch.Name, await LoadProductInfoAsync(entity.Lines, ct));
    }

    public async Task<PurchaseRequestDto> Handle(UpdatePurchaseRequestCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var pr = await _db.PurchaseRequests
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseRequest {request.Id} khÃ´ng tá»“n táº¡i");
        if (pr.Status != PurchaseRequestStatus.Draft)
            throw new BusinessRuleException("Chá»‰ dá»± trÃ¹ á»Ÿ tráº¡ng thÃ¡i DRAFT má»›i sá»­a Ä‘Æ°á»£c");

        pr.RequestDept = request.Request.RequestDept;
        pr.Notes = request.Request.Notes;

        // Replace lines
        _db.PurchaseRequestLines.RemoveRange(pr.Lines);
        pr.Lines.Clear();
        foreach (var line in request.Request.Lines)
        {
            pr.Lines.Add(new PurchaseRequestLine
            {
                TenantId = _tenant.TenantId!.Value,
                ProductId = line.ProductId,
                Quantity = line.Quantity,
                UnitId = line.UnitId,
                EstimatedUnitPrice = line.EstimatedUnitPrice,
                Notes = line.Notes,
            });
        }
        await _db.SaveChangesAsync(ct);

        var branch = await _db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == pr.BranchId, ct);
        return PurchaseRequestQueryHandler.ToDto(pr, branch?.Name, await LoadProductInfoAsync(pr.Lines, ct));
    }

    public async Task<Unit> Handle(DeletePurchaseRequestCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var pr = await _db.PurchaseRequests.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseRequest {request.Id} khÃ´ng tá»“n táº¡i");
        if (pr.Status != PurchaseRequestStatus.Draft)
            throw new BusinessRuleException("Chá»‰ xÃ³a Ä‘Æ°á»£c dá»± trÃ¹ á»Ÿ tráº¡ng thÃ¡i DRAFT");
        _db.PurchaseRequests.Remove(pr);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<PurchaseRequestDto> Handle(SubmitPurchaseRequestCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var pr = await _db.PurchaseRequests.Include(p => p.Lines)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseRequest {request.Id} khÃ´ng tá»“n táº¡i");
        if (pr.Status != PurchaseRequestStatus.Draft)
            throw new BusinessRuleException("Chá»‰ gá»­i duyá»‡t dá»± trÃ¹ á»Ÿ tráº¡ng thÃ¡i DRAFT");
        if (pr.Lines.Count == 0) throw new BusinessRuleException("Dá»± trÃ¹ pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        pr.Status = PurchaseRequestStatus.Submitted;
        await _db.SaveChangesAsync(ct);

        var branch = await _db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == pr.BranchId, ct);
        return PurchaseRequestQueryHandler.ToDto(pr, branch?.Name, await LoadProductInfoAsync(pr.Lines, ct));
    }

    public async Task<PurchaseRequestDto> Handle(ApprovePurchaseRequestCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var pr = await _db.PurchaseRequests.Include(p => p.Lines)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseRequest {request.Id} khÃ´ng tá»“n táº¡i");
        if (pr.Status != PurchaseRequestStatus.Submitted)
            throw new BusinessRuleException("Chá»‰ duyá»‡t dá»± trÃ¹ á»Ÿ tráº¡ng thÃ¡i SUBMITTED");

        pr.Status = PurchaseRequestStatus.Approved;
        pr.ApprovedBy = _tenant.UserId;
        pr.ApprovedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var branch = await _db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == pr.BranchId, ct);
        return PurchaseRequestQueryHandler.ToDto(pr, branch?.Name, await LoadProductInfoAsync(pr.Lines, ct));
    }

    private async Task<Dictionary<Guid, (string Sku, string Name, string UnitCode)>> LoadProductInfoAsync(
        IEnumerable<PurchaseRequestLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lines.Select(l => l.UnitId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => new { p.Sku, p.Name }, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        var result = new Dictionary<Guid, (string Sku, string Name, string UnitCode)>();
        foreach (var id in productIds)
        {
            products.TryGetValue(id, out var p);
            var unitId = lines.First(l => l.ProductId == id).UnitId;
            units.TryGetValue(unitId, out var u);
            result[id] = (p?.Sku ?? "", p?.Name ?? "", u ?? "");
        }
        return result;
    }
}
