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

namespace InventoryPro.Application.Purchasing;

// =============================================================================
// Queries
// =============================================================================
public record GetGoodsReceiptByIdQuery(Guid Id) : IRequest<GoodsReceiptDto>;
public record ListGoodsReceiptsQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    Guid? PartyId = null,
    Guid? PurchaseOrderId = null,
    Guid? BranchId = null,
    string? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<GoodsReceiptDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateGoodsReceiptCommand(CreateGoodsReceiptRequest Request) : IRequest<GoodsReceiptDto>;
public record UpdateGoodsReceiptCommand(Guid Id, UpdateGoodsReceiptRequest Request) : IRequest<GoodsReceiptDto>;
public record DeleteGoodsReceiptCommand(Guid Id) : IRequest<Unit>;
public record PostGoodsReceiptCommand(Guid Id) : IRequest<GoodsReceiptDto>;
public record CancelGoodsReceiptCommand(Guid Id, string Reason) : IRequest<GoodsReceiptDto>;

// =============================================================================
// Handlers
// =============================================================================
public class GoodsReceiptQueryHandler :
    IRequestHandler<GetGoodsReceiptByIdQuery, GoodsReceiptDto>,
    IRequestHandler<ListGoodsReceiptsQuery, PaginatedResult<GoodsReceiptDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public GoodsReceiptQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<GoodsReceiptDto> Handle(GetGoodsReceiptByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .AsNoTracking()
            .Include(g => g.Party).Include(g => g.Warehouse).Include(g => g.PurchaseOrder)
            .Include(g => g.Lines)
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} khÃ´ng tá»“n táº¡i");
        return ToDto(entity, await LoadLineDetailsAsync(entity.Lines, ct));
    }

    public async Task<PaginatedResult<GoodsReceiptDto>> Handle(ListGoodsReceiptsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.GoodsReceipts.AsNoTracking()
            .Include(g => g.Party).Include(g => g.Warehouse).Include(g => g.PurchaseOrder)
            .Where(g => g.TenantId == _tenant.TenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(g => g.GrnNumber.ToLower().Contains(s) ||
                             (g.SupplierInvoiceNo != null && g.SupplierInvoiceNo.ToLower().Contains(s)) ||
                             (g.Notes != null && g.Notes.ToLower().Contains(s)));
        }
        if (request.PartyId.HasValue) q = q.Where(g => g.PartyId == request.PartyId);
        if (request.PurchaseOrderId.HasValue) q = q.Where(g => g.PurchaseOrderId == request.PurchaseOrderId);
        if (request.BranchId.HasValue) q = q.Where(g => g.BranchId == request.BranchId);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<GoodsReceiptStatus>(request.Status, ignoreCase: true);
            q = q.Where(g => g.Status == st);
        }
        if (request.DateFrom.HasValue) q = q.Where(g => g.ReceiptDate >= request.DateFrom.Value);
        if (request.DateTo.HasValue) q = q.Where(g => g.ReceiptDate <= request.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(g => g.ReceiptDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        return new PaginatedResult<GoodsReceiptDto>
        {
            Items = items.Select(g => ToDto(g, new Dictionary<Guid, (string Sku, string LocationCode)>())).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    private async Task<Dictionary<Guid, (string Sku, string LocationCode)>> LoadLineDetailsAsync(
        IEnumerable<GoodsReceiptLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var locationIds = lines.Select(l => l.LocationId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);
        var locations = await _db.Locations.AsNoTracking()
            .Where(l => locationIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return lines.Select(l => (Id: l.Id, Sku: products.GetValueOrDefault(l.ProductId, ""), LocationCode: locations.GetValueOrDefault(l.LocationId, "")))
            .ToDictionary(x => x.Id, x => (Sku: x.Item2, LocationCode: x.Item3));
    }

    private static GoodsReceiptDto ToDto(GoodsReceipt g,
        Dictionary<Guid, (string Sku, string LocationCode)> lineInfo)
    {
        var lineDtos = g.Lines.OrderBy(l => l.LineNo).Select(l =>
        {
            var info = lineInfo.GetValueOrDefault(l.Id, ("", ""));
            return new GoodsReceiptLineDto(
                l.Id, l.LineNo, l.PoLineId, l.ProductId, info.Sku, l.ProductName,
                l.UnitId, l.UnitCode, l.LocationId, info.LocationCode,
                l.Quantity, l.UnitCost, l.Quantity * l.UnitCost,
                l.BatchNo, l.SerialNo, l.ExpiryDate, l.Notes, l.MovementId,
                l.Status.ToString().ToUpperInvariant());
        }).ToList();

        return new GoodsReceiptDto(
            g.Id, g.GrnNumber, g.BranchId, g.PurchaseOrderId, g.PurchaseOrder?.PoNumber,
            g.PartyId, g.Party?.Name, g.Party?.Code,
            g.WarehouseId, g.Warehouse?.Code,
            g.ReceiptDate, g.SupplierInvoiceNo, g.SupplierInvoiceDate, g.Notes,
            g.Status.ToString().ToUpperInvariant(),
            g.PostedBy, g.PostedAt, (int)lineDtos.Count,
            g.BidContractId, g.BidContract?.ContractNo,
            g.BidLotId, g.BidLot?.LotName,
            g.CreatedAt, g.UpdatedAt);
    }
}

public class GoodsReceiptCommandHandler :
    IRequestHandler<CreateGoodsReceiptCommand, GoodsReceiptDto>,
    IRequestHandler<UpdateGoodsReceiptCommand, GoodsReceiptDto>,
    IRequestHandler<DeleteGoodsReceiptCommand, Unit>,
    IRequestHandler<PostGoodsReceiptCommand, GoodsReceiptDto>,
    IRequestHandler<CancelGoodsReceiptCommand, GoodsReceiptDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public GoodsReceiptCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<GoodsReceiptDto> Handle(CreateGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        await ValidateGrnRequestAsync(r, ct, null);

        // â­ Auto-fill BidContractId + BidLotId tá»« PO
        Guid? bidContractId = null;
        Guid? bidLotId = null;
        if (r.PurchaseOrderId.HasValue)
        {
            var po = await _db.PurchaseOrders.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == r.PurchaseOrderId.Value, ct);
            if (po != null)
            {
                bidContractId = po.BidContractId;
                bidLotId = po.BidLotId;
            }
        }

        var entity = new GoodsReceipt
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            GrnNumber = await GenerateGrnNumberAsync(ct),
            PurchaseOrderId = r.PurchaseOrderId,
            PartyId = r.PartyId,
            WarehouseId = r.WarehouseId,
            ReceiptDate = r.ReceiptDate,
            SupplierInvoiceNo = r.SupplierInvoiceNo,
            SupplierInvoiceDate = r.SupplierInvoiceDate,
            Notes = r.Notes,
            BidContractId = bidContractId,
            BidLotId = bidLotId,
            Status = GoodsReceiptStatus.Draft,
            CreatedBy = _tenant.UserId,
        };
        await BuildLinesAsync(entity, r.Lines, r.IdempotencyKeys, ct);

        _db.GoodsReceipts.Add(entity);
        await _db.SaveChangesAsync(ct);
        return (await LoadGrnWithNavAsync(entity.Id, ct)).Adapt<GoodsReceiptDto>();
    }

    public async Task<GoodsReceiptDto> Handle(UpdateGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .Include(g => g.Lines)
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ GRN á»Ÿ DRAFT má»›i sá»­a Ä‘Æ°á»£c");

        var r = request.Request;
        await ValidateGrnRequestAsync(new CreateGoodsReceiptRequest(
            entity.BranchId, entity.PurchaseOrderId, entity.PartyId, entity.WarehouseId,
            r.ReceiptDate, r.SupplierInvoiceNo, r.SupplierInvoiceDate, r.Notes,
            r.Lines, r.IdempotencyKeys), ct, entity.Id);

        entity.ReceiptDate = r.ReceiptDate;
        entity.SupplierInvoiceNo = r.SupplierInvoiceNo;
        entity.SupplierInvoiceDate = r.SupplierInvoiceDate;
        entity.Notes = r.Notes;

        _db.GoodsReceiptLines.RemoveRange(entity.Lines);
        entity.Lines.Clear();
        await BuildLinesAsync(entity, r.Lines, r.IdempotencyKeys, ct);

        await _db.SaveChangesAsync(ct);
        return (await LoadGrnWithNavAsync(entity.Id, ct)).Adapt<GoodsReceiptDto>();
    }

    public async Task<Unit> Handle(DeleteGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} khÃ´ng tá»“n táº¡i");
        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ GRN á»Ÿ DRAFT má»›i xÃ³a Ä‘Æ°á»£c");
        _db.GoodsReceipts.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<GoodsReceiptDto> Handle(PostGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .Include(g => g.Lines)
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException($"Chá»‰ GRN á»Ÿ DRAFT má»›i post Ä‘Æ°á»£c. Hiá»‡n táº¡i: {entity.Status}");
        if (!entity.Lines.Any())
            throw new BusinessRuleException("GRN pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        // Business rule: GRN post â†’ ghi stock_movements IN, chá»‰ cho kho cháºµn (RECEIVING).
        // (Check táº¡i create Ä‘Ã£ enforce; check láº¡i á»Ÿ post phÃ²ng trÆ°á»ng há»£p warehouse type Ä‘á»•i sau khi GRN táº¡o)
        var postWh = await _db.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == entity.WarehouseId && w.TenantId == _tenant.TenantId, ct);
        if (postWh == null)
            throw new NotFoundException($"Warehouse {entity.WarehouseId} khÃ´ng tá»“n táº¡i");
        if (postWh.Type != WarehouseType.Receiving)
            throw new BusinessRuleException(
                $"Kho '{postWh.Code}' hiá»‡n lÃ  kho láº» (ISSUE), khÃ´ng thá»ƒ post GRN. Vui lÃ²ng chá»n kho cháºµn (RECEIVING) khi táº¡o GRN.");

        // Insert stock_movements cho tá»«ng line
        foreach (var line in entity.Lines.Where(l => l.Status == GoodsReceiptLineStatus.Open))
        {
            // Idempotency key Ä‘Ã£ Ä‘Æ°á»£c lÆ°u tá»« request (r.IdempotencyKeys[i] khi BuildLinesAsync)
            // Náº¿u khÃ´ng cÃ³, fallback sang Guid má»›i (best-effort)
            var idempotencyKey = line.IdempotencyKey != Guid.Empty
                ? line.IdempotencyKey
                : Guid.NewGuid();

            var movement = new StockMovement
            {
                TenantId = entity.TenantId,
                BranchId = entity.BranchId,
                WarehouseId = entity.WarehouseId,
                LocationId = line.LocationId,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                MovementType = StockMovementType.IN,
                Status = StockMovementStatus.Posted,
                Quantity = line.Quantity,
                UnitCost = line.UnitCost,
                RefType = StockReferenceType.Grn,
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

            // Cáº­p nháº­t PO line náº¿u cÃ³
            if (line.PoLineId.HasValue)
            {
                var poLine = await _db.PurchaseOrderLines
                    .FirstOrDefaultAsync(pl => pl.Id == line.PoLineId.Value, ct);
                if (poLine != null)
                {
                    poLine.ReceivedQty += line.Quantity;
                    // Status auto-update bá»Ÿi trigger update_po_line_status
                }
            }

            line.MovementId = movement.Id; // sáº½ Ä‘Æ°á»£c set khi SaveChanges
            line.Status = GoodsReceiptLineStatus.Posted;
        }

        entity.Status = GoodsReceiptStatus.Posted;
        entity.PostedBy = _tenant.UserId;
        entity.PostedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        // Update movement_id trÃªn lines sau khi cÃ³ id tháº­t
        // (Ä‘Ã£ set trong loop, SaveChanges sáº½ fill Id vÃ o movement.Id)
        // Reload Ä‘á»ƒ láº¥y movement_id tháº­t
        await _db.SaveChangesAsync(ct);

        // Check vÃ  Ä‘Ã³ng PO náº¿u Ä‘Ã£ nháº­n Ä‘á»§
        if (entity.PurchaseOrderId.HasValue)
        {
            var po = await _db.PurchaseOrders.Include(p => p.Lines)
                .FirstOrDefaultAsync(p => p.Id == entity.PurchaseOrderId.Value, ct);
            if (po != null && po.Lines.All(l => l.Status == PurchaseOrderLineStatus.Received || l.Status == PurchaseOrderLineStatus.Cancelled))
            {
                po.Status = PurchaseOrderStatus.Completed;
                po.CompletedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }
        }

        return (await LoadGrnWithNavAsync(entity.Id, ct)).Adapt<GoodsReceiptDto>();
    }

    public async Task<GoodsReceiptDto> Handle(CancelGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chá»‰ GRN á»Ÿ DRAFT má»›i há»§y Ä‘Æ°á»£c (Ä‘Ã£ POSTED pháº£i dÃ¹ng reversal)");
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ValidationException("Pháº£i nháº­p lÃ½ do há»§y");

        entity.Status = GoodsReceiptStatus.Cancelled;
        entity.CancelledAt = DateTime.UtcNow;
        entity.CancelReason = request.Reason;
        await _db.SaveChangesAsync(ct);
        return (await LoadGrnWithNavAsync(entity.Id, ct)).Adapt<GoodsReceiptDto>();
    }

    // ----- helpers -----
    private async Task ValidateGrnRequestAsync(CreateGoodsReceiptRequest r, CancellationToken ct, Guid? excludeId)
    {
        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("GRN pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");
        if (r.IdempotencyKeys == null || r.IdempotencyKeys.Count != r.Lines.Count)
            throw new ValidationException("Má»—i dÃ²ng GRN cáº§n 1 idempotency_key");
        if (r.IdempotencyKeys.Distinct().Count() != r.IdempotencyKeys.Count)
            throw new ValidationException("Idempotency keys pháº£i unique");

        // Validate party lÃ  supplier
        var party = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.PartyId} khÃ´ng tá»“n táº¡i");
        if (party.PartyType == PartyType.Customer)
            throw new BusinessRuleException("Party pháº£i lÃ  SUPPLIER hoáº·c BOTH");

        // Validate warehouse + location thuá»™c branch
        var wh = await _db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == r.WarehouseId && w.BranchId == r.BranchId && w.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {r.WarehouseId} khÃ´ng thuá»™c branch {r.BranchId}");

        // Business rule: GRN chá»‰ cho phÃ©p ghi vÃ o kho cháºµn (RECEIVING).
        if (wh.Type != WarehouseType.Receiving)
            throw new BusinessRuleException(
                $"Kho '{wh.Code}' lÃ  kho láº» (ISSUE), khÃ´ng thá»ƒ táº¡o phiáº¿u nháº­p. Vui lÃ²ng chá»n kho cháºµn (RECEIVING).");

        var locationIds = r.Lines.Select(l => l.LocationId).Distinct().ToList();
        var invalidLoc = await _db.Locations
            .Where(l => locationIds.Contains(l.Id) && (l.TenantId != _tenant.TenantId || l.WarehouseId != r.WarehouseId))
            .Select(l => l.Id).ToListAsync(ct);
        if (invalidLoc.Any())
            throw new NotFoundException($"Location {string.Join(", ", invalidLoc)} khÃ´ng thuá»™c warehouse {r.WarehouseId}");

        // Náº¿u cÃ³ PO, validate party khá»›p
        if (r.PurchaseOrderId.HasValue)
        {
            var po = await _db.PurchaseOrders
                .FirstOrDefaultAsync(p => p.Id == r.PurchaseOrderId.Value && p.TenantId == _tenant.TenantId, ct)
                ?? throw new NotFoundException($"PO {r.PurchaseOrderId} khÃ´ng tá»“n táº¡i");
            if (po.PartyId != r.PartyId)
                throw new BusinessRuleException("Party cá»§a GRN pháº£i khá»›p vá»›i PO");
        }
    }

    private async Task BuildLinesAsync(GoodsReceipt entity, List<CreateGrnLineRequest> lineReqs, List<Guid> idempotencyKeys, CancellationToken ct)
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

            // Validate po_line náº¿u cÃ³
            if (line.PoLineId.HasValue)
            {
                var poLine = await _db.PurchaseOrderLines
                    .Include(pl => pl.PurchaseOrder)
                    .FirstOrDefaultAsync(pl => pl.Id == line.PoLineId.Value, ct)
                    ?? throw new NotFoundException($"PO Line {line.PoLineId} khÃ´ng tá»“n táº¡i");
                if (poLine.PurchaseOrderId != entity.PurchaseOrderId)
                    throw new BusinessRuleException("PO line khÃ´ng thuá»™c PO cá»§a GRN");
                if (poLine.ProductId != line.ProductId)
                    throw new BusinessRuleException("Product cá»§a GRN line pháº£i khá»›p vá»›i PO line");
            }

            entity.Lines.Add(new GoodsReceiptLine
            {
                TenantId = entity.TenantId,
                LineNo = i + 1,
                PoLineId = line.PoLineId,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                LocationId = line.LocationId,
                ProductName = product.Name,
                UnitCode = unit.Code,
                Quantity = line.Quantity,
                UnitCost = line.UnitCost,
                BatchNo = line.BatchNo,
                SerialNo = line.SerialNo,
                ExpiryDate = line.ExpiryDate,
                Notes = line.Notes,
                // LÆ°u idempotency_key tá»« request Ä‘á»ƒ dÃ¹ng lÃºc post táº¡o movement
                IdempotencyKey = i < idempotencyKeys.Count ? idempotencyKeys[i] : Guid.Empty,
                Status = GoodsReceiptLineStatus.Open,
            });
        }
    }

    private async Task<string> GenerateGrnNumberAsync(CancellationToken ct)
    {
        var prefix = $"GRN-{DateTime.UtcNow:yyyyMM}-";
        var count = await _db.GoodsReceipts
            .CountAsync(g => g.TenantId == _tenant.TenantId && g.GrnNumber.StartsWith(prefix), ct);
        return prefix + (count + 1).ToString("D4");
    }

    private async Task<GoodsReceipt> LoadGrnWithNavAsync(Guid id, CancellationToken ct)
    {
        return await _db.GoodsReceipts.AsNoTracking()
            .Include(g => g.Party).Include(g => g.Warehouse)
            .Include(g => g.PurchaseOrder).Include(g => g.Lines)
            .Include(g => g.BidContract).Include(g => g.BidLot)
            .FirstAsync(g => g.Id == id, ct);
    }
}
