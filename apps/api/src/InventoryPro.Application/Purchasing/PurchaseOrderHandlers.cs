using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
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
public record GetPurchaseOrderByIdQuery(Guid Id) : IRequest<PurchaseOrderDto>;
public record ListPurchaseOrdersQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    Guid? PartyId = null,
    Guid? BranchId = null,
    string? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<PurchaseOrderDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreatePurchaseOrderCommand(CreatePurchaseOrderRequest Request) : IRequest<PurchaseOrderDto>;
public record UpdatePurchaseOrderCommand(Guid Id, UpdatePurchaseOrderRequest Request) : IRequest<PurchaseOrderDto>;
public record DeletePurchaseOrderCommand(Guid Id) : IRequest<Unit>;
public record ApprovePurchaseOrderCommand(Guid Id, string? Notes) : IRequest<PurchaseOrderDto>;
public record PostPurchaseOrderCommand(Guid Id) : IRequest<PurchaseOrderDto>;
public record CancelPurchaseOrderCommand(Guid Id, string Reason) : IRequest<PurchaseOrderDto>;

// =============================================================================
// Handlers
// =============================================================================
public class PurchaseOrderQueryHandler :
    IRequestHandler<GetPurchaseOrderByIdQuery, PurchaseOrderDto>,
    IRequestHandler<ListPurchaseOrdersQuery, PaginatedResult<PurchaseOrderDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseOrderQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PurchaseOrderDto> Handle(GetPurchaseOrderByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.PurchaseOrders
            .AsNoTracking()
            .Include(p => p.Party)
            .Include(p => p.Lines)
            .Include(p => p.BidContract)
            .Include(p => p.BidLot)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");
        return ToDto(entity, await LoadProductInfoAsync(entity.Lines, ct));
    }

    public async Task<PaginatedResult<PurchaseOrderDto>> Handle(ListPurchaseOrdersQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.PurchaseOrders.AsNoTracking()
            .Include(p => p.Party)
            .Include(p => p.BidContract)
            .Include(p => p.BidLot)
            .Where(p => p.TenantId == _tenant.TenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(p => p.PoNumber.ToLower().Contains(s) ||
                             (p.Notes != null && p.Notes.ToLower().Contains(s)));
        }
        if (request.PartyId.HasValue) q = q.Where(p => p.PartyId == request.PartyId);
        if (request.BranchId.HasValue) q = q.Where(p => p.BranchId == request.BranchId);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<PurchaseOrderStatus>(request.Status, ignoreCase: true);
            q = q.Where(p => p.Status == st);
        }
        if (request.DateFrom.HasValue) q = q.Where(p => p.OrderDate >= request.DateFrom.Value);
        if (request.DateTo.HasValue) q = q.Where(p => p.OrderDate <= request.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(p => p.OrderDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var productInfo = await LoadProductInfoAsync(
            items.SelectMany(i => i.Lines).ToList(), ct);

        return new PaginatedResult<PurchaseOrderDto>
        {
            Items = items.Select(p => ToDto(p, productInfo)).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    private async Task<Dictionary<Guid, (string Sku, string UnitCode)>> LoadProductInfoAsync(
        IEnumerable<PurchaseOrderLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lines.Select(l => l.UnitId).Distinct().ToList();

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        // Merge SKU + UnitCode
        var productUnits = await _db.ProductUnits.AsNoTracking()
            .Where(pu => productIds.Contains(pu.ProductId))
            .ToListAsync(ct);

        return lines.Select(l =>
        {
            var sku = products.GetValueOrDefault(l.ProductId, "");
            // Náº¿u unit_id khÃ¡c base unit, cÃ³ thá»ƒ tÃ¬m factor; Ä‘Æ¡n giáº£n láº¥y product.sku
            return (l.Id, Sku: sku, UnitCode: units.GetValueOrDefault(l.UnitId, l.UnitCode));
        }).ToDictionary(x => x.Id, x => (x.Sku, x.UnitCode));
    }

    private static PurchaseOrderDto ToDto(PurchaseOrder p,
        Dictionary<Guid, (string Sku, string UnitCode)> productInfo)
    {
        // Build lines tá»« navigation
        var lineDtos = p.Lines.OrderBy(l => l.LineNo).Select(l =>
        {
            var info = productInfo.GetValueOrDefault(l.Id, ("", l.UnitCode));
            return new PurchaseOrderLineDto(
                l.Id, l.LineNo, l.ProductId, info.Sku, l.ProductName,
                l.UnitId, info.UnitCode,
                l.Quantity, l.ReceivedQty, l.UnitPrice, l.DiscountPct, l.TaxPct,
                l.LineTotal, l.Status.ToString().ToUpperInvariant(), l.Notes);
        }).ToList();

        // ThÃ´ng tin tháº§u (náº¿u cÃ³)
        var contract = p.BidContract;
        var lot = p.BidLot;
        var remaining = contract != null ? contract.ContractValue - contract.UsedValue : (decimal?)null;
        var daysToExpiry = contract != null ? (int)(contract.ContractEndDate - DateTime.UtcNow.Date).TotalDays : (int?)null;

        return new PurchaseOrderDto(
            p.Id, p.PoNumber, p.BranchId, p.PartyId, p.Party?.Name, p.Party?.Code,
            p.OrderDate, p.ExpectedDate, p.Currency, p.ExchangeRate,
            p.Subtotal, p.DiscountAmount, p.TaxAmount, p.ShippingAmount, p.Total, p.PaidAmount,
            p.Status.ToString().ToUpperInvariant(), p.PaymentTerms,
            p.ShippingAddress, p.Notes, p.InternalNotes,
            p.ApprovedBy, p.ApprovedAt, p.PostedBy, p.PostedAt, p.CompletedAt, p.CancelledAt, p.CancelReason,
            lineDtos.Count(),
            // ThÃ´ng tin tháº§u
            p.BidContractId, contract?.ContractNo,
            contract?.ContractValue, contract?.UsedValue, remaining,
            contract?.ContractEndDate, daysToExpiry,
            p.BidLotId, lot?.LotName,
            p.CreatedAt, p.UpdatedAt);
    }
}

public class PurchaseOrderCommandHandler :
    IRequestHandler<CreatePurchaseOrderCommand, PurchaseOrderDto>,
    IRequestHandler<UpdatePurchaseOrderCommand, PurchaseOrderDto>,
    IRequestHandler<DeletePurchaseOrderCommand, Unit>,
    IRequestHandler<ApprovePurchaseOrderCommand, PurchaseOrderDto>,
    IRequestHandler<PostPurchaseOrderCommand, PurchaseOrderDto>,
    IRequestHandler<CancelPurchaseOrderCommand, PurchaseOrderDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseOrderCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PurchaseOrderDto> Handle(CreatePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;

        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("PO pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

        // Validate party lÃ  supplier
        var party = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.PartyId} khÃ´ng tá»“n táº¡i");
        if (party.PartyType == PartyType.Customer)
            throw new BusinessRuleException("Äá»‘i tÃ¡c nÃ y lÃ  khÃ¡ch hÃ ng, khÃ´ng thá»ƒ táº¡o PO");

        // ============================================================
        // â­ VALIDATION Há»¢P Äá»’NG THáº¦U (Báº®T BUá»˜C)
        // ============================================================
        if (r.BidContractId == Guid.Empty)
            throw new BusinessRuleException("PO pháº£i gáº¯n vá»›i 1 há»£p Ä‘á»“ng tháº§u (BidContract)");

        var bidContract = await _db.BidContracts
            .Include(c => c.BidLot)
            .FirstOrDefaultAsync(c => c.Id == r.BidContractId && c.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {r.BidContractId} khÃ´ng tá»“n táº¡i");

        if (bidContract.BidContractStatus != BidContractStatus.Active)
            throw new BusinessRuleException(
                $"Há»£p Ä‘á»“ng tháº§u '{bidContract.ContractNo}' Ä‘ang á»Ÿ tráº¡ng thÃ¡i {bidContract.BidContractStatus}, khÃ´ng thá»ƒ táº¡o PO.");

        // Check NCC khá»›p
        if (r.PartyId != bidContract.WinningPartyId)
            throw new BusinessRuleException(
                $"PO pháº£i gáº¯n vá»›i Ä‘Ãºng nhÃ  tháº§u trÃºng tháº§u ({party.Code} â†’ {bidContract.ContractNo}). " +
                $"NhÃ  tháº§u trÃºng cá»§a HÄ nÃ y lÃ  khÃ¡c.");

        // Check date range
        if (r.OrderDate.Date < bidContract.ContractStartDate)
            throw new BusinessRuleException(
                $"NgÃ y Ä‘áº·t hÃ ng ({r.OrderDate:yyyy-MM-dd}) sá»›m hÆ¡n ngÃ y báº¯t Ä‘áº§u HÄ tháº§u ({bidContract.ContractStartDate:yyyy-MM-dd}).");
        if (r.OrderDate.Date > bidContract.ContractEndDate)
            throw new BusinessRuleException(
                $"NgÃ y Ä‘áº·t hÃ ng ({r.OrderDate:yyyy-MM-dd}) vÆ°á»£t quÃ¡ ngÃ y káº¿t thÃºc HÄ tháº§u ({bidContract.ContractEndDate:yyyy-MM-dd}). HÄ tháº§u Ä‘Ã£ háº¿t háº¡n.");

        // Náº¿u cÃ³ bid_lot_id â†’ check lot_id khá»›p vá»›i contract
        if (r.BidLotId.HasValue && r.BidLotId != bidContract.BidLotId)
            throw new BusinessRuleException(
                $"BidLotId khÃ´ng khá»›p vá»›i HÄ tháº§u. HÄ nÃ y thuá»™c lÃ´ tháº§u khÃ¡c.");

        // Check váº­t tÆ° cÃ³ náº±m trong lÃ´ tháº§u khÃ´ng (náº¿u lÃ´ cÃ³ lines)
        if (bidContract.BidLot != null)
        {
            var lotLineProductIds = await _db.BidLotLines
                .Where(l => l.BidLotId == bidContract.BidLotId)
                .Select(l => l.ProductId)
                .ToListAsync(ct);
            if (lotLineProductIds.Any())
            {
                var lineProductIds = r.Lines.Select(l => l.ProductId).ToList();
                var invalidProducts = lineProductIds.Except(lotLineProductIds).ToList();
                if (invalidProducts.Any())
                    throw new BusinessRuleException(
                        $"CÃ³ {invalidProducts.Count} sáº£n pháº©m trong PO khÃ´ng thuá»™c danh má»¥c lÃ´ tháº§u '{bidContract.BidLot.LotName}'.");
            }
        }

        // Sáº½ check used_value overflow SAU khi tÃ­nh total (cuá»‘i hÃ m)

        var entity = new PurchaseOrder
        {
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            PoNumber = await GeneratePoNumberAsync(ct),
            PartyId = r.PartyId,
            OrderDate = r.OrderDate,
            ExpectedDate = r.ExpectedDate,
            Currency = r.Currency ?? "VND",
            ExchangeRate = r.ExchangeRate ?? 1,
            DiscountAmount = r.DiscountAmount ?? 0,
            ShippingAmount = r.ShippingAmount ?? 0,
            PaymentTerms = r.PaymentTerms ?? 0,
            ShippingAddress = r.ShippingAddress,
            Notes = r.Notes,
            InternalNotes = r.InternalNotes,
            Status = PurchaseOrderStatus.Draft,
            BidContractId = r.BidContractId,
            BidLotId = bidContract.BidLotId,
            CreatedBy = _tenant.UserId,
        };

        // Load products + units
        var productIds = r.Lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = r.Lines.Select(l => l.UnitId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(p => p.Id, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(u => u.Id, ct);

        // TÃ­nh line_no + line_total
        for (int i = 0; i < r.Lines.Count; i++)
        {
            var line = r.Lines[i];
            if (!products.TryGetValue(line.ProductId, out var product))
                throw new NotFoundException($"Product {line.ProductId} khÃ´ng tá»“n táº¡i");
            if (!units.TryGetValue(line.UnitId, out var unit))
                throw new NotFoundException($"Unit {line.UnitId} khÃ´ng tá»“n táº¡i");

            var lineTotal = line.Quantity * line.UnitPrice
                * (1 - line.DiscountPct / 100m)
                * (1 + line.TaxPct / 100m);

            entity.Lines.Add(new PurchaseOrderLine
            {
                TenantId = _tenant.TenantId.Value,
                LineNo = i + 1,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                ProductName = product.Name,
                UnitCode = unit.Code,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                DiscountPct = line.DiscountPct,
                TaxPct = line.TaxPct,
                LineTotal = Math.Round(lineTotal, 4),
                Status = PurchaseOrderLineStatus.Open,
                Notes = line.Notes,
            });
        }

        // ============================================================
        // â­ CHECK used_value overflow (sau khi Ä‘Ã£ tÃ­nh total)
        // ============================================================
        var poSubtotal = entity.Lines.Sum(l => l.LineTotal);
        var poTotal = poSubtotal + entity.ShippingAmount - entity.DiscountAmount;
        if (bidContract.UsedValue + poTotal > bidContract.ContractValue)
        {
            var remaining = bidContract.ContractValue - bidContract.UsedValue;
            throw new BusinessRuleException(
                $"HÄ tháº§u '{bidContract.ContractNo}' Ä‘Ã£ dÃ¹ng {bidContract.UsedValue:N0}/{bidContract.ContractValue:N0} VNÄ. " +
                $"PO nÃ y ({poTotal:N0} VNÄ) vÆ°á»£t quÃ¡ giÃ¡ trá»‹ cÃ²n láº¡i ({remaining:N0} VNÄ). " +
                $"Vui lÃ²ng táº¡o HÄ tháº§u bá»• sung hoáº·c giáº£m giÃ¡ trá»‹ PO.");
        }

        _db.PurchaseOrders.Add(entity);
        await _db.SaveChangesAsync(ct);

        // Reload vá»›i Party + BidContract + BidLot nav
        entity.Party = party;
        entity.BidContract = bidContract;
        entity.BidLot = bidContract.BidLot;
        var dtoEntity = await _db.PurchaseOrders.AsNoTracking()
            .Include(p => p.Party).Include(p => p.Lines)
            .Include(p => p.BidContract)
            .Include(p => p.BidLot)
            .FirstAsync(p => p.Id == entity.Id, ct);

        // Build productInfo
        var productInfo = await LoadProductInfoAsync(dtoEntity.Lines, ct);
        return ToDto(dtoEntity, productInfo);
    }

    public async Task<PurchaseOrderDto> Handle(UpdatePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.PurchaseOrders
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException($"Chá»‰ PO á»Ÿ tráº¡ng thÃ¡i DRAFT má»›i sá»­a Ä‘Æ°á»£c. Hiá»‡n táº¡i: {entity.Status}");

        if (entity.ReceivedQtyTotal() > 0)
            throw new BusinessRuleException("PO Ä‘Ã£ cÃ³ GRN, khÃ´ng thá»ƒ sá»­a");

        var r = request.Request;
        entity.PartyId = r.PartyId;
        entity.OrderDate = r.OrderDate;
        entity.ExpectedDate = r.ExpectedDate;
        if (r.DiscountAmount.HasValue) entity.DiscountAmount = r.DiscountAmount.Value;
        if (r.ShippingAmount.HasValue) entity.ShippingAmount = r.ShippingAmount.Value;
        entity.ShippingAddress = r.ShippingAddress;
        entity.Notes = r.Notes;
        entity.InternalNotes = r.InternalNotes;

        // Replace lines náº¿u cÃ³
        if (r.Lines != null)
        {
            if (r.Lines.Count == 0)
                throw new ValidationException("PO pháº£i cÃ³ Ã­t nháº¥t 1 dÃ²ng");

            // Validate products
            var productIds = r.Lines.Select(l => l.ProductId).Distinct().ToList();
            var unitIds = r.Lines.Select(l => l.UnitId).Distinct().ToList();
            var products = await _db.Products.AsNoTracking()
                .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
                .ToDictionaryAsync(p => p.Id, ct);
            var units = await _db.UnitsOfMeasure.AsNoTracking()
                .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
                .ToDictionaryAsync(u => u.Id, ct);

            _db.PurchaseOrderLines.RemoveRange(entity.Lines);
            entity.Lines.Clear();

            for (int i = 0; i < r.Lines.Count; i++)
            {
                var line = r.Lines[i];
                if (!products.TryGetValue(line.ProductId, out var product))
                    throw new NotFoundException($"Product {line.ProductId} khÃ´ng tá»“n táº¡i");
                if (!units.TryGetValue(line.UnitId, out var unit))
                    throw new NotFoundException($"Unit {line.UnitId} khÃ´ng tá»“n táº¡i");

                var lineTotal = line.Quantity * line.UnitPrice
                    * (1 - line.DiscountPct / 100m)
                    * (1 + line.TaxPct / 100m);

                entity.Lines.Add(new PurchaseOrderLine
                {
                    TenantId = _tenant.TenantId.Value,
                    LineNo = i + 1,
                    ProductId = line.ProductId,
                    UnitId = line.UnitId,
                    ProductName = product.Name,
                    UnitCode = unit.Code,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    DiscountPct = line.DiscountPct,
                    TaxPct = line.TaxPct,
                    LineTotal = Math.Round(lineTotal, 4),
                    Status = PurchaseOrderLineStatus.Open,
                    Notes = line.Notes,
                });
            }
        }

        await _db.SaveChangesAsync(ct);

        // Reload vá»›i nav
        var reloaded = await _db.PurchaseOrders.AsNoTracking()
            .Include(p => p.Party).Include(p => p.Lines)
            .FirstAsync(p => p.Id == entity.Id, ct);
        return reloaded.Adapt<PurchaseOrderDto>();
    }

    public async Task<Unit> Handle(DeletePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.PurchaseOrders
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");
        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException("Chá»‰ PO á»Ÿ DRAFT má»›i xÃ³a Ä‘Æ°á»£c");
        _db.PurchaseOrders.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<PurchaseOrderDto> Handle(ApprovePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        if (!_tenant.IsAdmin && _tenant.Role != "MANAGER")
            throw new ForbiddenException("Chá»‰ Admin/Manager má»›i duyá»‡t PO");

        var entity = await _db.PurchaseOrders
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException($"Chá»‰ PO á»Ÿ DRAFT má»›i duyá»‡t Ä‘Æ°á»£c. Hiá»‡n táº¡i: {entity.Status}");
        if (!entity.Lines.Any())
            throw new BusinessRuleException("PO khÃ´ng cÃ³ dÃ²ng nÃ o");

        entity.Status = PurchaseOrderStatus.Approved;
        entity.ApprovedBy = _tenant.UserId;
        entity.ApprovedAt = DateTime.UtcNow;
        if (!string.IsNullOrEmpty(request.Notes)) entity.InternalNotes =
            (entity.InternalNotes ?? "") + $"\n[APPROVE] {request.Notes}";

        await _db.SaveChangesAsync(ct);
        return (await LoadPoWithNavAsync(entity.Id, ct)).Adapt<PurchaseOrderDto>();
    }

    public async Task<PurchaseOrderDto> Handle(PostPurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.PurchaseOrders
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status != PurchaseOrderStatus.Approved)
            throw new BusinessRuleException($"Chá»‰ PO á»Ÿ APPROVED má»›i post Ä‘Æ°á»£c. Hiá»‡n táº¡i: {entity.Status}");

        entity.Status = PurchaseOrderStatus.Posted;
        entity.PostedBy = _tenant.UserId;
        entity.PostedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return (await LoadPoWithNavAsync(entity.Id, ct)).Adapt<PurchaseOrderDto>();
    }

    public async Task<PurchaseOrderDto> Handle(CancelPurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.PurchaseOrders
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} khÃ´ng tá»“n táº¡i");

        if (entity.Status == PurchaseOrderStatus.Completed || entity.Status == PurchaseOrderStatus.Cancelled)
            throw new BusinessRuleException($"PO Ä‘Ã£ á»Ÿ tráº¡ng thÃ¡i cuá»‘i: {entity.Status}, khÃ´ng thá»ƒ há»§y");

        if (entity.ReceivedQtyTotal() > 0)
            throw new BusinessRuleException("PO Ä‘Ã£ cÃ³ GRN, khÃ´ng thá»ƒ há»§y (cáº§n xá»­ lÃ½ GRN trÆ°á»›c)");

        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ValidationException("Pháº£i nháº­p lÃ½ do há»§y");

        entity.Status = PurchaseOrderStatus.Cancelled;
        entity.CancelledAt = DateTime.UtcNow;
        entity.CancelReason = request.Reason;
        // Mark all open lines as CANCELLED
        foreach (var line in entity.Lines.Where(l => l.Status != PurchaseOrderLineStatus.Received))
            line.Status = PurchaseOrderLineStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
        return (await LoadPoWithNavAsync(entity.Id, ct)).Adapt<PurchaseOrderDto>();
    }

    // ----- helpers -----
    private async Task<string> GeneratePoNumberAsync(CancellationToken ct)
    {
        var prefix = $"PO-{DateTime.UtcNow:yyyyMM}-";
        var count = await _db.PurchaseOrders
            .CountAsync(p => p.TenantId == _tenant.TenantId && p.PoNumber.StartsWith(prefix), ct);
        return prefix + (count + 1).ToString("D4");
    }

    private async Task<PurchaseOrder> LoadPoWithNavAsync(Guid id, CancellationToken ct)
    {
        return await _db.PurchaseOrders.AsNoTracking()
            .Include(p => p.Party).Include(p => p.Lines)
            .FirstAsync(p => p.Id == id, ct);
    }

    private async Task<Dictionary<Guid, (string Sku, string UnitCode)>> LoadProductInfoAsync(
        IEnumerable<PurchaseOrderLine> lines, CancellationToken ct)
    {
        var productIds = lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lines.Select(l => l.UnitId).Distinct().ToList();

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        return lines.Select(l =>
        {
            var sku = products.GetValueOrDefault(l.ProductId, "");
            return (l.Id, Sku: sku, UnitCode: units.GetValueOrDefault(l.UnitId, l.UnitCode));
        }).ToDictionary(x => x.Id, x => (x.Sku, x.UnitCode));
    }

    private static PurchaseOrderDto ToDto(PurchaseOrder p,
        Dictionary<Guid, (string Sku, string UnitCode)> productInfo)
    {
        var lineDtos = p.Lines.OrderBy(l => l.LineNo).Select(l =>
        {
            var info = productInfo.GetValueOrDefault(l.Id, ("", l.UnitCode));
            return new PurchaseOrderLineDto(
                l.Id, l.LineNo, l.ProductId, info.Sku, l.ProductName,
                l.UnitId, info.UnitCode,
                l.Quantity, l.ReceivedQty, l.UnitPrice, l.DiscountPct, l.TaxPct,
                l.LineTotal, l.Status.ToString().ToUpperInvariant(), l.Notes);
        }).ToList();

        var contract = p.BidContract;
        var lot = p.BidLot;
        var remaining = contract != null ? contract.ContractValue - contract.UsedValue : (decimal?)null;
        var daysToExpiry = contract != null ? (int)(contract.ContractEndDate - DateTime.UtcNow.Date).TotalDays : (int?)null;

        return new PurchaseOrderDto(
            p.Id, p.PoNumber, p.BranchId, p.PartyId, p.Party?.Name, p.Party?.Code,
            p.OrderDate, p.ExpectedDate, p.Currency, p.ExchangeRate,
            p.Subtotal, p.DiscountAmount, p.TaxAmount, p.ShippingAmount, p.Total, p.PaidAmount,
            p.Status.ToString().ToUpperInvariant(), p.PaymentTerms,
            p.ShippingAddress, p.Notes, p.InternalNotes,
            p.ApprovedBy, p.ApprovedAt, p.PostedBy, p.PostedAt, p.CompletedAt, p.CancelledAt, p.CancelReason,
            lineDtos.Count(),
            p.BidContractId, contract?.ContractNo,
            contract?.ContractValue, contract?.UsedValue, remaining,
            contract?.ContractEndDate, daysToExpiry,
            p.BidLotId, lot?.LotName,
            p.CreatedAt, p.UpdatedAt);
    }
}

internal static class PoExtensions
{
    public static decimal ReceivedQtyTotal(this PurchaseOrder po) => po.Lines.Sum(l => l.ReceivedQty);
}
