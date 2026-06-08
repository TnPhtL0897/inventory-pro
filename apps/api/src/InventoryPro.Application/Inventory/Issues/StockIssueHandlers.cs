using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;
using InventoryPro.Application.Common.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.Issues;

// =============================================================================
// Queries
// =============================================================================
public record GetStockIssueByIdQuery(Guid Id) : IRequest<StockIssueDto>;
public record ListStockIssuesQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    Guid? PartyId = null,
    Guid? BranchId = null,
    Guid? WarehouseId = null,
    string? Purpose = null,
    string? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<StockIssueDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateStockIssueCommand(CreateStockIssueRequest Request) : IRequest<StockIssueDto>;
public record UpdateStockIssueCommand(Guid Id, UpdateStockIssueRequest Request) : IRequest<StockIssueDto>;
public record DeleteStockIssueCommand(Guid Id) : IRequest<Unit>;
public record PostStockIssueCommand(Guid Id) : IRequest<StockIssueDto>;
public record CancelStockIssueCommand(Guid Id, string Reason) : IRequest<StockIssueDto>;

public class StockIssueQueryHandler :
    IRequestHandler<GetStockIssueByIdQuery, StockIssueDto>,
    IRequestHandler<ListStockIssuesQuery, PaginatedResult<StockIssueDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public StockIssueQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockIssueDto> Handle(GetStockIssueByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.StockIssues
            .AsNoTracking()
            .Include(i => i.Party).Include(i => i.Warehouse).Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"StockIssue {request.Id} khÃ´ng tá»“n táº¡i");
        return ToDto(entity, await LoadLineDetailsAsync(entity.Lines, ct));
    }

    public async Task<PaginatedResult<StockIssueDto>> Handle(ListStockIssuesQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.StockIssues.AsNoTracking()
            .Include(i => i.Party).Include(i => i.Warehouse)
            .Where(i => i.TenantId == _tenant.TenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(i => i.IssueNumber.ToLower().Contains(s) ||
                             (i.ReferenceNo != null && i.ReferenceNo.ToLower().Contains(s)) ||
                             (i.Notes != null && i.Notes.ToLower().Contains(s)));
        }
        if (request.PartyId.HasValue) q = q.Where(i => i.PartyId == request.PartyId);
        if (request.BranchId.HasValue) q = q.Where(i => i.BranchId == request.BranchId);
        if (request.WarehouseId.HasValue) q = q.Where(i => i.WarehouseId == request.WarehouseId);
        if (!string.IsNullOrEmpty(request.Purpose))
        {
            var p = Enum.Parse<StockIssuePurpose>(request.Purpose, ignoreCase: true);
            q = q.Where(i => i.Purpose == p);
        }
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<GoodsReceiptStatus>(request.Status, ignoreCase: true);
            q = q.Where(i => i.Status == st);
        }
        if (request.DateFrom.HasValue) q = q.Where(i => i.IssueDate >= request.DateFrom.Value);
        if (request.DateTo.HasValue) q = q.Where(i => i.IssueDate <= request.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(i => i.IssueDate)
            .Skip((request.Page - 1) * request.PageSize).Take(request.PageSize)
            .ToListAsync(ct);

        return new PaginatedResult<StockIssueDto>
        {
            Items = items.Select(i => ToDto(i, new Dictionary<Guid, (string, string)>())).ToList(),
            Total = total, Page = request.Page, PageSize = request.PageSize,
        };
    }

    private async Task<Dictionary<Guid, (string Sku, string LocationCode)>> LoadLineDetailsAsync(
        IEnumerable<StockIssueLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var locationIds = lines.Select(l => l.LocationId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);
        var locations = await _db.Locations.AsNoTracking()
            .Where(l => locationIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => l.Code, ct);
        return lines.Select(l => (l.Id, products.GetValueOrDefault(l.ProductId, ""), locations.GetValueOrDefault(l.LocationId, "")))
            .ToDictionary(x => x.Id, x => (x.Item2, x.Item3));
    }

    private static StockIssueDto ToDto(StockIssue i, Dictionary<Guid, (string Sku, string LocationCode)> lineInfo)
    {
        var lineDtos = i.Lines.OrderBy(l => l.LineNo).Select(l =>
        {
            var info = lineInfo.GetValueOrDefault(l.Id, ("", ""));
            return new StockIssueLineDto(
                l.Id, l.LineNo, l.ProductId, info.Sku, l.ProductName,
                l.UnitId, l.UnitCode, l.LocationId, info.LocationCode,
                l.Quantity, l.UnitPrice, l.Quantity * l.UnitPrice,
                l.BatchNo, l.SerialNo, l.ExpiryDate, l.Notes, l.MovementId,
                l.Status.ToString().ToUpperInvariant());
        }).ToList();

        return new StockIssueDto(
            i.Id, i.IssueNumber, i.BranchId, i.PartyId, i.Party?.Name,
            i.WarehouseId, i.Warehouse?.Code,
            i.Purpose.ToString().ToUpperInvariant(),
            i.IssueDate, i.ReferenceNo, i.Notes,
            i.Status.ToString().ToUpperInvariant(),
            i.PostedBy, i.PostedAt, lineDtos.Count, i.CreatedAt, i.UpdatedAt);
    }
}

public class StockIssueCommandHandler :
    IRequestHandler<CreateStockIssueCommand, StockIssueDto>,
    IRequestHandler<UpdateStockIssueCommand, StockIssueDto>,
    IRequestHandler<DeleteStockIssueCommand, Unit>,
    IRequestHandler<PostStockIssueCommand, StockIssueDto>,
    IRequestHandler<CancelStockIssueCommand, StockIssueDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public StockIssueCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockIssueDto> Handle(CreateStockIssueCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        await ValidateAsync(r, ct);

        var entity = new StockIssue
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            IssueNumber = await GenerateIssueNumberAsync(ct),
            PartyId = r.PartyId,
            WarehouseId = r.WarehouseId,
            Purpose = Enum.TryParse<StockIssuePurpose>(r.Purpose, true, out var p) ? p : StockIssuePurpose.Sale,
            IssueDate = r.IssueDate,
            ReferenceNo = r.ReferenceNo,
            Notes = r.Notes,
            Status = GoodsReceiptStatus.Draft,
            CreatedBy = _tenant.UserId,
        };
        await BuildLinesAsync(entity, r.Lines, r.IdempotencyKeys, ct);

        _db.StockIssues.Add(entity);
        await _db.SaveChangesAsync(ct);
        return (await LoadIssueWithNavAsync(entity.Id, ct)).Adapt<StockIssueDto>();
    }

    public async Task<StockIssueDto> Handle(UpdateStockIssueCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.StockIssues.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"StockIssue {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ phiáº¿u xuáº¥t á»Ÿ DRAFT má»›i sá»­a Ä‘Æ°á»£c");

        var r = request.Request;
        entity.PartyId = r.PartyId;
        entity.IssueDate = r.IssueDate;
        entity.ReferenceNo = r.ReferenceNo;
        entity.Notes = r.Notes;

        _db.StockIssueLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        await BuildLinesAsync(entity, r.Lines, r.IdempotencyKeys, ct);

        await _db.SaveChangesAsync(ct);
        return (await LoadIssueWithNavAsync(entity.Id, ct)).Adapt<StockIssueDto>();
    }

    public async Task<Unit> Handle(DeleteStockIssueCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.StockIssues
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"StockIssue {request.Id} khÃ´ng tá»“n táº¡i");
        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ phiáº¿u xuáº¥t á»Ÿ DRAFT má»›i xÃ³a Ä‘Æ°á»£c");
        _db.StockIssues.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<StockIssueDto> Handle(PostStockIssueCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.StockIssues.Include(i => i.Lines)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"StockIssue {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException($"Chá»‰ phiáº¿u xuáº¥t á»Ÿ DRAFT má»›i post Ä‘Æ°á»£c. Hiá»‡n táº¡i: {entity.Status}");
        if (!entity.Lines.Any())
            throw new BusinessRuleException("Phiáº¿u xuáº¥t pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        // Pre-check tá»“n kho (chÃ­nh xÃ¡c sáº½ do trigger apply_stock_movement enforce, nhÆ°ng pre-check Ä‘á»ƒ UX tá»‘t hÆ¡n)
        var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == entity.WarehouseId, ct);
        if (warehouse == null) throw new NotFoundException("Warehouse khÃ´ng tá»“n táº¡i");

        // Business rule: post phiáº¿u xuáº¥t â†’ ghi stock_movements OUT, chá»‰ cho kho láº» (ISSUE).
        if (warehouse.Type != WarehouseType.Issue)
            throw new BusinessRuleException(
                $"Kho '{warehouse.Code}' hiá»‡n lÃ  kho cháºµn (RECEIVING), khÃ´ng thá»ƒ post phiáº¿u xuáº¥t. Vui lÃ²ng chá»n kho láº» (ISSUE) khi táº¡o phiáº¿u.");

        if (!warehouse.AllowNegative)
        {
            foreach (var line in entity.Lines.Where(l => l.Status == GoodsReceiptLineStatus.Open))
            {
                var stockQty = await _db.Stock
                    .Where(s => s.TenantId == entity.TenantId
                        && s.WarehouseId == entity.WarehouseId
                        && s.LocationId == line.LocationId
                        && s.ProductId == line.ProductId
                        && s.BatchNo == line.BatchNo
                        && s.SerialNo == line.SerialNo)
                    .Select(s => (decimal?)s.Quantity)
                    .FirstOrDefaultAsync(ct) ?? 0;
                if (stockQty < line.Quantity)
                    throw new BusinessRuleException(
                        $"Tá»“n kho khÃ´ng Ä‘á»§ cho sáº£n pháº©m {line.ProductName}: cáº§n {line.Quantity}, cÃ³ {stockQty}");
            }
        }

        // Táº¡o stock_movements OUT
        for (int i = 0; i < entity.Lines.Count; i++)
        {
            var line = entity.Lines[i];
            if (line.Status != GoodsReceiptLineStatus.Open) continue;

            // Láº¥y idempotency_key tá»« request â€” cáº§n lÆ°u trong line.Notes? Táº¡m thá»i sinh má»›i
            var idempotencyKey = Guid.NewGuid();

            var movement = new StockMovement
            {
                TenantId = entity.TenantId,
                BranchId = entity.BranchId,
                WarehouseId = entity.WarehouseId,
                LocationId = line.LocationId,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                MovementType = StockMovementType.OUT,
                Status = StockMovementStatus.Posted,
                Quantity = line.Quantity,
                UnitCost = null, // OUT khÃ´ng cáº­p nháº­t avg cost
                RefType = StockReferenceType.Issue,
                RefId = entity.Id,
                RefLineId = line.Id,
                Notes = line.Notes,
                BatchNo = line.BatchNo,
                SerialNo = line.SerialNo,
                ExpiryDate = line.ExpiryDate,
                IdempotencyKey = idempotencyKey,
                CreatedBy = _tenant.UserId,
            };
            _db.StockMovements.Add(movement);
            line.MovementId = movement.Id;
            line.Status = GoodsReceiptLineStatus.Posted;
        }

        entity.Status = GoodsReceiptStatus.Posted;
        entity.PostedBy = _tenant.UserId;
        entity.PostedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _db.SaveChangesAsync(ct); // ensure movement.Id filled

        return (await LoadIssueWithNavAsync(entity.Id, ct)).Adapt<StockIssueDto>();
    }

    public async Task<StockIssueDto> Handle(CancelStockIssueCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.StockIssues
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"StockIssue {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ phiáº¿u xuáº¥t á»Ÿ DRAFT má»›i há»§y Ä‘Æ°á»£c");
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ValidationException("Pháº£i nháº­p lÃ½ do há»§y");

        entity.Status = GoodsReceiptStatus.Cancelled;
        entity.CancelledAt = DateTime.UtcNow;
        entity.CancelReason = request.Reason;
        await _db.SaveChangesAsync(ct);
        return (await LoadIssueWithNavAsync(entity.Id, ct)).Adapt<StockIssueDto>();
    }

    // ----- helpers -----
    private async Task ValidateAsync(CreateStockIssueRequest r, CancellationToken ct)
    {
        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("Phiáº¿u xuáº¥t pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");
        if (r.IdempotencyKeys == null || r.IdempotencyKeys.Count != r.Lines.Count)
            throw new ValidationException("Má»—i dÃ²ng cáº§n 1 idempotency_key");
        if (r.IdempotencyKeys.Distinct().Count() != r.IdempotencyKeys.Count)
            throw new ValidationException("Idempotency keys pháº£i unique");

        // Validate warehouse
        var wh = await _db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == r.WarehouseId && w.BranchId == r.BranchId && w.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {r.WarehouseId} khÃ´ng thuá»™c branch {r.BranchId}");

        // Business rule: phiáº¿u xuáº¥t chá»‰ cho phÃ©p tá»« kho láº» (ISSUE).
        if (wh.Type != WarehouseType.Issue)
            throw new BusinessRuleException(
                $"Kho '{wh.Code}' lÃ  kho cháºµn (RECEIVING), khÃ´ng thá»ƒ táº¡o phiáº¿u xuáº¥t. Vui lÃ²ng chá»n kho láº» (ISSUE).");

        // Validate locations
        var locationIds = r.Lines.Select(l => l.LocationId).Distinct().ToList();
        var invalidLoc = await _db.Locations
            .Where(l => locationIds.Contains(l.Id) && (l.TenantId != _tenant.TenantId || l.WarehouseId != r.WarehouseId))
            .Select(l => l.Id).ToListAsync(ct);
        if (invalidLoc.Any())
            throw new NotFoundException($"Location {string.Join(", ", invalidLoc)} khÃ´ng thuá»™c warehouse");

        // Náº¿u cÃ³ party vÃ  purpose = SALE, validate party lÃ  customer
        if (r.PartyId.HasValue && string.Equals(r.Purpose, "SALE", StringComparison.OrdinalIgnoreCase))
        {
            var party = await _db.Parties.FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct);
            if (party == null) throw new NotFoundException($"Party {r.PartyId} khÃ´ng tá»“n táº¡i");
            if (party.PartyType == PartyType.Supplier)
                throw new BusinessRuleException("Xuáº¥t bÃ¡n pháº£i lÃ  khÃ¡ch hÃ ng (CUSTOMER) hoáº·c BOTH");
        }
    }

    private async Task BuildLinesAsync(StockIssue entity, List<CreateIssueLineRequest> lineReqs, List<Guid> idempotencyKeys, CancellationToken ct)
    {
        var productIds = lineReqs.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lineReqs.Select(l => l.UnitId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(p => p.Id, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(u => u.Id, ct);

        for (int i = 0; i < lineReqs.Count; i++)
        {
            var line = lineReqs[i];
            if (!products.TryGetValue(line.ProductId, out var product))
                throw new NotFoundException($"Product {line.ProductId} khÃ´ng tá»“n táº¡i");
            if (!units.TryGetValue(line.UnitId, out var unit))
                throw new NotFoundException($"Unit {line.UnitId} khÃ´ng tá»“n táº¡i");

            entity.Lines.Add(new StockIssueLine
            {
                TenantId = entity.TenantId,
                LineNo = i + 1,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                LocationId = line.LocationId,
                ProductName = product.Name,
                UnitCode = unit.Code,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                BatchNo = line.BatchNo,
                SerialNo = line.SerialNo,
                ExpiryDate = line.ExpiryDate,
                Notes = line.Notes,
                Status = GoodsReceiptLineStatus.Open,
            });
        }
    }

    private async Task<string> GenerateIssueNumberAsync(CancellationToken ct)
    {
        var prefix = $"ISS-{DateTime.UtcNow:yyyyMM}-";
        var count = await _db.StockIssues
            .CountAsync(i => i.TenantId == _tenant.TenantId && i.IssueNumber.StartsWith(prefix), ct);
        return prefix + (count + 1).ToString("D4");
    }

    private async Task<StockIssue> LoadIssueWithNavAsync(Guid id, CancellationToken ct)
    {
        return await _db.StockIssues.AsNoTracking()
            .Include(i => i.Party).Include(i => i.Warehouse)
            .Include(i => i.Lines)
            .FirstAsync(i => i.Id == id, ct);
    }
}
