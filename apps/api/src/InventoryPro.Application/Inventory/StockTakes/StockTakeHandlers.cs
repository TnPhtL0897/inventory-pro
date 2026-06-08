using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
using InventoryPro.Application.Common.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.StockTakes;

// =============================================================================
// Queries
// =============================================================================
public record GetStockTakeByIdQuery(Guid Id) : IRequest<StockTakeDto>;
public record ListStockTakesQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    Guid? BranchId = null,
    Guid? WarehouseId = null,
    string? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<StockTakeDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateStockTakeCommand(CreateStockTakeRequest Request) : IRequest<StockTakeDto>;
public record UpdateCountedQtyCommand(Guid Id, BulkUpdateCountedQtyRequest Request) : IRequest<StockTakeDto>;
public record PostStockTakeCommand(Guid Id) : IRequest<StockTakeDto>;
public record CancelStockTakeCommand(Guid Id, string Reason) : IRequest<StockTakeDto>;
public record DeleteStockTakeCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class StockTakeQueryHandler :
    IRequestHandler<GetStockTakeByIdQuery, StockTakeDto>,
    IRequestHandler<ListStockTakesQuery, PaginatedResult<StockTakeDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;
    public StockTakeQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockTakeDto> Handle(GetStockTakeByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var s = await _db.StockTakes.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTake", req.Id);
        return await ToDtoAsync(s, ct);
    }

    public async Task<PaginatedResult<StockTakeDto>> Handle(ListStockTakesQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.StockTakes.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var s = req.Search.Trim().ToLower();
            q = q.Where(x => x.StockTakeNumber.ToLower().Contains(s) || (x.Notes != null && x.Notes.ToLower().Contains(s)));
        }
        if (req.BranchId.HasValue) q = q.Where(x => x.BranchId == req.BranchId);
        if (req.WarehouseId.HasValue) q = q.Where(x => x.WarehouseId == req.WarehouseId);
        if (!string.IsNullOrEmpty(req.Status))
        {
            var st = Enum.Parse<StockTakeStatus>(req.Status, ignoreCase: true);
            q = q.Where(x => x.Status == st);
        }
        if (req.DateFrom.HasValue) q = q.Where(x => x.StockTakeDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) q = q.Where(x => x.StockTakeDate <= req.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.StockTakeDate)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        var dtos = new List<StockTakeDto>(items.Count);
        foreach (var s in items) dtos.Add(await ToDtoAsync(s, ct));
        return new PaginatedResult<StockTakeDto> { Items = dtos, Total = total, Page = req.Page, PageSize = req.PageSize };
    }

    private async Task<StockTakeDto> ToDtoAsync(StockTake s, CancellationToken ct)
    {
        var wh = await _db.Warehouses.AsNoTracking()
            .Where(w => w.Id == s.WarehouseId)
            .Select(w => (Guid?)w.Id)
            .FirstOrDefaultAsync(ct);
        var whCode = wh.HasValue
            ? await _db.Warehouses.AsNoTracking().Where(w => w.Id == wh.Value).Select(w => w.Code).FirstOrDefaultAsync(ct)
            : null;
        var lineCount = await _db.StockTakeLines.AsNoTracking()
            .Where(l => l.StockTakeId == s.Id)
            .CountAsync(ct);
        return new StockTakeDto(
            s.Id, s.StockTakeNumber,
            s.BranchId, s.WarehouseId, whCode,
            s.StockTakeDate, s.Notes,
            s.Status.ToString().ToUpperInvariant(),
            s.CountedBy, s.CountedAt,
            s.PostedBy, s.PostedAt,
            s.CancelReason,
            lineCount,
            s.CreatedAt, s.UpdatedAt);
    }
}

public class StockTakeCommandHandler :
    IRequestHandler<CreateStockTakeCommand, StockTakeDto>,
    IRequestHandler<UpdateCountedQtyCommand, StockTakeDto>,
    IRequestHandler<PostStockTakeCommand, StockTakeDto>,
    IRequestHandler<CancelStockTakeCommand, StockTakeDto>,
    IRequestHandler<DeleteStockTakeCommand, Unit>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;
    public StockTakeCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockTakeDto> Handle(CreateStockTakeCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        var wh = await _db.Warehouses.AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == r.WarehouseId && w.TenantId == _tenant.TenantId && w.BranchId == r.BranchId, ct)
            ?? throw new NotFoundException($"Warehouse {r.WarehouseId} khÃ´ng thuá»™c branch {r.BranchId}");

        var st = new StockTake
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            WarehouseId = r.WarehouseId,
            StockTakeNumber = await GenerateNumberAsync(ct),
            StockTakeDate = r.StockTakeDate,
            Notes = r.Notes,
            Status = StockTakeStatus.Draft,
            CreatedBy = _tenant.UserId,
        };

        // Snapshot stock hiá»‡n táº¡i
        var stockSnapshot = await _db.Stock.AsNoTracking()
            .Where(s => s.TenantId == _tenant.TenantId && s.BranchId == r.BranchId && s.WarehouseId == r.WarehouseId)
            .ToListAsync(ct);

        // Náº¿u user chá»‰ Ä‘á»‹nh lines, dÃ¹ng Ä‘Ã³. NgÆ°á»£c láº¡i láº¥y háº¿t stock.
        if (r.Lines != null && r.Lines.Count > 0)
        {
            // Validate products/units/locations
            var productIds = r.Lines.Select(l => l.ProductId).Distinct().ToList();
            var products = await _db.Products.AsNoTracking()
                .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
                .ToDictionaryAsync(p => p.Id, ct);
            var unitIds = r.Lines.Select(l => l.UnitId).Distinct().ToList();
            var units = await _db.UnitsOfMeasure.AsNoTracking()
                .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
                .ToDictionaryAsync(u => u.Id, ct);
            var locationIds = r.Lines.Select(l => l.LocationId).Distinct().ToList();
            var locations = await _db.Locations.AsNoTracking()
                .Where(l => locationIds.Contains(l.Id) && l.TenantId == _tenant.TenantId && l.WarehouseId == r.WarehouseId)
                .ToDictionaryAsync(l => l.Id, ct);

            int no = 1;
            foreach (var line in r.Lines)
            {
                if (!products.TryGetValue(line.ProductId, out var p))
                    throw new NotFoundException($"Product {line.ProductId} khÃ´ng tá»“n táº¡i");
                if (!units.TryGetValue(line.UnitId, out var u))
                    throw new NotFoundException($"Unit {line.UnitId} khÃ´ng tá»“n táº¡i");
                if (!locations.TryGetValue(line.LocationId, out var loc))
                    throw new NotFoundException($"Location {line.LocationId} khÃ´ng thuá»™c warehouse {r.WarehouseId}");

                // TÃ¬m system_qty tá»« snapshot
                var sysQty = stockSnapshot
                    .FirstOrDefault(s => s.ProductId == line.ProductId
                                       && s.LocationId == line.LocationId
                                       && s.BatchNo == line.BatchNo
                                       && s.SerialNo == line.SerialNo)?.Quantity ?? 0;

                st.Lines.Add(new StockTakeLine
                {
                    TenantId = st.TenantId,
                    StockTakeId = st.Id,
                    LineNo = no++,
                    ProductId = line.ProductId,
                    UnitId = line.UnitId,
                    LocationId = line.LocationId,
                    ProductName = p.Name,
                    UnitCode = u.Code,
                    LocationCode = loc.Code,
                    BatchNo = line.BatchNo,
                    SerialNo = line.SerialNo,
                    SystemQty = sysQty,
                    Status = StockTakeLineStatus.Pending,
                });
            }
        }
        else
        {
            // Auto-snapshot táº¥t cáº£ stock trong warehouse
            int no = 1;
            var productIds = stockSnapshot.Select(s => s.ProductId).Distinct().ToList();
            var locationIds = stockSnapshot.Select(s => s.LocationId).Distinct().ToList();
            var products = await _db.Products.AsNoTracking()
                .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
                .ToDictionaryAsync(p => p.Id, ct);
            var units = await _db.UnitsOfMeasure.AsNoTracking()
                .Where(u => products.Values.Select(p => p.BaseUnitId).Distinct().Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, ct);
            var locations = await _db.Locations.AsNoTracking()
                .Where(l => locationIds.Contains(l.Id))
                .ToDictionaryAsync(l => l.Id, ct);

            foreach (var s in stockSnapshot)
            {
                if (!products.TryGetValue(s.ProductId, out var p)) continue;
                if (!units.TryGetValue(p.BaseUnitId, out var u)) continue;
                if (!locations.TryGetValue(s.LocationId, out var loc)) continue;
                st.Lines.Add(new StockTakeLine
                {
                    TenantId = st.TenantId,
                    StockTakeId = st.Id,
                    LineNo = no++,
                    ProductId = s.ProductId,
                    UnitId = p.BaseUnitId,
                    LocationId = s.LocationId,
                    ProductName = p.Name,
                    UnitCode = u.Code,
                    LocationCode = loc.Code,
                    BatchNo = s.BatchNo,
                    SerialNo = s.SerialNo,
                    SystemQty = s.Quantity,
                    Status = StockTakeLineStatus.Pending,
                });
            }
        }

        _db.StockTakes.Add(st);
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(st.Id, ct);
    }

    public async Task<StockTakeDto> Handle(UpdateCountedQtyCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var st = await _db.StockTakes.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTake", req.Id);
        if (st.Status != StockTakeStatus.Draft && st.Status != StockTakeStatus.Counted)
            throw new BusinessRuleException($"Chá»‰ sá»­a sá»‘ Ä‘áº¿m á»Ÿ DRAFT/COUNTED. Hiá»‡n táº¡i: {st.Status}");

        var updates = req.Request.Updates.ToDictionary(u => u.LineId, u => u);
        foreach (var line in st.Lines)
        {
            if (!updates.TryGetValue(line.Id, out var u)) continue;
            if (u.CountedQty.HasValue && u.CountedQty.Value < 0)
                throw new ValidationException($"CountedQty dÃ²ng {line.LineNo} pháº£i >= 0");
            line.CountedQty = u.CountedQty;
            if (u.Notes != null) line.Notes = u.Notes;
            line.Status = u.CountedQty.HasValue ? StockTakeLineStatus.Counted : StockTakeLineStatus.Pending;
        }

        // Auto-chuyá»ƒn status náº¿u cÃ³ Ã­t nháº¥t 1 line counted
        if (st.Lines.Any(l => l.Status == StockTakeLineStatus.Counted) && st.Status == StockTakeStatus.Draft)
        {
            st.Status = StockTakeStatus.Counted;
            st.CountedBy = _tenant.UserId;
            st.CountedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(st.Id, ct);
    }

    public async Task<StockTakeDto> Handle(PostStockTakeCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var st = await _db.StockTakes.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTake", req.Id);
        if (st.Status == StockTakeStatus.Posted)
            throw new BusinessRuleException("Phiáº¿u Ä‘Ã£ POSTED");
        if (st.Status == StockTakeStatus.Cancelled)
            throw new BusinessRuleException("Phiáº¿u Ä‘Ã£ CANCELLED");
        if (st.Status == StockTakeStatus.Draft)
            throw new BusinessRuleException("Pháº£i nháº­p sá»‘ Ä‘áº¿m (COUNTED) trÆ°á»›c khi POST");
        if (!st.Lines.Any())
            throw new BusinessRuleException("Phiáº¿u pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        // Vá»›i má»—i line cÃ³ variance != 0, táº¡o ADJUST movement
        foreach (var line in st.Lines.Where(l => l.Status != StockTakeLineStatus.Adjusted && l.Status != StockTakeLineStatus.Skipped))
        {
            if (!line.CountedQty.HasValue)
            {
                // Bá» qua dÃ²ng chÆ°a Ä‘áº¿m (set Skipped)
                line.Status = StockTakeLineStatus.Skipped;
                continue;
            }
            var variance = line.CountedQty.Value - line.SystemQty;
            if (variance == 0)
            {
                line.Status = StockTakeLineStatus.Skipped;
                continue;
            }
            var isIncrease = variance > 0;
            var movement = new StockMovement
            {
                TenantId = st.TenantId,
                BranchId = st.BranchId,
                WarehouseId = st.WarehouseId,
                LocationId = line.LocationId,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                MovementType = isIncrease ? StockMovementType.ADJUST_IN : StockMovementType.ADJUST_OUT,
                Status = StockMovementStatus.Posted,
                Quantity = Math.Abs(variance),
                UnitCost = line.UnitCost,
                RefType = StockReferenceType.StockTake,
                RefId = st.Id,
                RefLineId = line.Id,
                BatchNo = line.BatchNo,
                SerialNo = line.SerialNo,
                Notes = line.Notes ?? $"Kiá»ƒm kÃª: system={line.SystemQty}, counted={line.CountedQty}",
                IdempotencyKey = Guid.NewGuid(),
                CreatedBy = _tenant.UserId,
            };
            _db.StockMovements.Add(movement);
            line.AdjustMovementId = movement.Id;
            line.Status = StockTakeLineStatus.Adjusted;
        }

        st.Status = StockTakeStatus.Posted;
        st.PostedBy = _tenant.UserId;
        st.PostedAt = DateTime.UtcNow;
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("check_violation", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new ConflictException("Post tháº¥t báº¡i: variance lÃ m tá»“n kho Ã¢m vÃ  warehouse khÃ´ng cho phÃ©p");
        }
        return await LoadAndMapAsync(st.Id, ct);
    }

    public async Task<StockTakeDto> Handle(CancelStockTakeCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var st = await _db.StockTakes.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTake", req.Id);
        if (st.Status == StockTakeStatus.Posted)
            throw new BusinessRuleException("Phiáº¿u Ä‘Ã£ POSTED - khÃ´ng há»§y Ä‘Æ°á»£c. Táº¡o phiáº¿u kiá»ƒm kÃª má»›i Ä‘á»ƒ bÃ¹.");
        if (string.IsNullOrWhiteSpace(req.Reason))
            throw new ValidationException("Pháº£i nháº­p lÃ½ do há»§y");
        st.Status = StockTakeStatus.Cancelled;
        st.CancelReason = req.Reason;
        st.CancelledBy = _tenant.UserId;
        st.CancelledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(st.Id, ct);
    }

    public async Task<Unit> Handle(DeleteStockTakeCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var st = await _db.StockTakes.FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTake", req.Id);
        if (st.Status != StockTakeStatus.Draft && st.Status != StockTakeStatus.Cancelled)
            throw new BusinessRuleException("Chá»‰ xÃ³a Ä‘Æ°á»£c phiáº¿u DRAFT/CANCELLED");
        _db.StockTakes.Remove(st);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    private async Task<string> GenerateNumberAsync(CancellationToken ct)
    {
        var prefix = $"STK-{DateTime.UtcNow:yyyyMM}-";
        var count = await _db.StockTakes
            .CountAsync(x => x.TenantId == _tenant.TenantId && x.StockTakeNumber.StartsWith(prefix), ct);
        return prefix + (count + 1).ToString("D4");
    }

    private async Task<StockTakeDto> LoadAndMapAsync(Guid id, CancellationToken ct)
    {
        var st = await _db.StockTakes.AsNoTracking()
            .FirstAsync(x => x.Id == id, ct);
        var whCode = await _db.Warehouses.AsNoTracking()
            .Where(w => w.Id == st.WarehouseId)
            .Select(w => w.Code)
            .FirstOrDefaultAsync(ct);
        var lineCount = await _db.StockTakeLines.AsNoTracking()
            .Where(l => l.StockTakeId == st.Id)
            .CountAsync(ct);
        return new StockTakeDto(
            st.Id, st.StockTakeNumber,
            st.BranchId, st.WarehouseId, whCode,
            st.StockTakeDate, st.Notes,
            st.Status.ToString().ToUpperInvariant(),
            st.CountedBy, st.CountedAt,
            st.PostedBy, st.PostedAt,
            st.CancelReason,
            lineCount,
            st.CreatedAt, st.UpdatedAt);
    }
}
