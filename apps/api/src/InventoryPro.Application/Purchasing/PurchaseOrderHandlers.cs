using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;
using InventoryPro.Infrastructure.Persistence;
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
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseOrderQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

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
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");
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
            // Nếu unit_id khác base unit, có thể tìm factor; đơn giản lấy product.sku
            return (l.Id, Sku: sku, UnitCode: units.GetValueOrDefault(l.UnitId, l.UnitCode));
        }).ToDictionary(x => x.Id, x => (x.Sku, x.UnitCode));
    }

    private static PurchaseOrderDto ToDto(PurchaseOrder p,
        Dictionary<Guid, (string Sku, string UnitCode)> productInfo)
    {
        // Build lines từ navigation
        var lineDtos = p.Lines.OrderBy(l => l.LineNo).Select(l =>
        {
            var info = productInfo.GetValueOrDefault(l.Id, ("", l.UnitCode));
            return new PurchaseOrderLineDto(
                l.Id, l.LineNo, l.ProductId, info.Sku, l.ProductName,
                l.UnitId, info.UnitCode,
                l.Quantity, l.ReceivedQty, l.UnitPrice, l.DiscountPct, l.TaxPct,
                l.LineTotal, l.Status.ToString().ToUpperInvariant(), l.Notes);
        }).ToList();

        // Thông tin thầu (nếu có)
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
            lineDtos.Count,
            // Thông tin thầu
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
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PurchaseOrderCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PurchaseOrderDto> Handle(CreatePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;

        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("PO phải có ít nhất 1 dòng");

        // Validate party là supplier
        var party = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.PartyId} không tồn tại");
        if (party.PartyType == PartyType.Customer)
            throw new BusinessRuleException("Đối tác này là khách hàng, không thể tạo PO");

        // ============================================================
        // ⭐ VALIDATION HỢP ĐỒNG THẦU (BẮT BUỘC)
        // ============================================================
        if (r.BidContractId == Guid.Empty)
            throw new BusinessRuleException("PO phải gắn với 1 hợp đồng thầu (BidContract)");

        var bidContract = await _db.BidContracts
            .Include(c => c.BidLot)
            .FirstOrDefaultAsync(c => c.Id == r.BidContractId && c.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {r.BidContractId} không tồn tại");

        if (bidContract.BidContractStatus != BidContractStatus.Active)
            throw new BusinessRuleException(
                $"Hợp đồng thầu '{bidContract.ContractNo}' đang ở trạng thái {bidContract.BidContractStatus}, không thể tạo PO.");

        // Check NCC khớp
        if (r.PartyId != bidContract.WinningPartyId)
            throw new BusinessRuleException(
                $"PO phải gắn với đúng nhà thầu trúng thầu ({party.Code} → {bidContract.ContractNo}). " +
                $"Nhà thầu trúng của HĐ này là khác.");

        // Check date range
        if (r.OrderDate.Date < bidContract.ContractStartDate)
            throw new BusinessRuleException(
                $"Ngày đặt hàng ({r.OrderDate:yyyy-MM-dd}) sớm hơn ngày bắt đầu HĐ thầu ({bidContract.ContractStartDate:yyyy-MM-dd}).");
        if (r.OrderDate.Date > bidContract.ContractEndDate)
            throw new BusinessRuleException(
                $"Ngày đặt hàng ({r.OrderDate:yyyy-MM-dd}) vượt quá ngày kết thúc HĐ thầu ({bidContract.ContractEndDate:yyyy-MM-dd}). HĐ thầu đã hết hạn.");

        // Nếu có bid_lot_id → check lot_id khớp với contract
        if (r.BidLotId.HasValue && r.BidLotId != bidContract.BidLotId)
            throw new BusinessRuleException(
                $"BidLotId không khớp với HĐ thầu. HĐ này thuộc lô thầu khác.");

        // Check vật tư có nằm trong lô thầu không (nếu lô có lines)
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
                        $"Có {invalidProducts.Count} sản phẩm trong PO không thuộc danh mục lô thầu '{bidContract.BidLot.LotName}'.");
            }
        }

        // Sẽ check used_value overflow SAU khi tính total (cuối hàm)

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

        // Tính line_no + line_total
        for (int i = 0; i < r.Lines.Count; i++)
        {
            var line = r.Lines[i];
            if (!products.TryGetValue(line.ProductId, out var product))
                throw new NotFoundException($"Product {line.ProductId} không tồn tại");
            if (!units.TryGetValue(line.UnitId, out var unit))
                throw new NotFoundException($"Unit {line.UnitId} không tồn tại");

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
        // ⭐ CHECK used_value overflow (sau khi đã tính total)
        // ============================================================
        var poSubtotal = entity.Lines.Sum(l => l.LineTotal);
        var poTotal = poSubtotal + entity.ShippingAmount - entity.DiscountAmount;
        if (bidContract.UsedValue + poTotal > bidContract.ContractValue)
        {
            var remaining = bidContract.ContractValue - bidContract.UsedValue;
            throw new BusinessRuleException(
                $"HĐ thầu '{bidContract.ContractNo}' đã dùng {bidContract.UsedValue:N0}/{bidContract.ContractValue:N0} VNĐ. " +
                $"PO này ({poTotal:N0} VNĐ) vượt quá giá trị còn lại ({remaining:N0} VNĐ). " +
                $"Vui lòng tạo HĐ thầu bổ sung hoặc giảm giá trị PO.");
        }

        _db.PurchaseOrders.Add(entity);
        await _db.SaveChangesAsync(ct);

        // Reload với Party + BidContract + BidLot nav
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
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");

        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException($"Chỉ PO ở trạng thái DRAFT mới sửa được. Hiện tại: {entity.Status}");

        if (entity.ReceivedQtyTotal() > 0)
            throw new BusinessRuleException("PO đã có GRN, không thể sửa");

        var r = request.Request;
        entity.PartyId = r.PartyId;
        entity.OrderDate = r.OrderDate;
        entity.ExpectedDate = r.ExpectedDate;
        if (r.DiscountAmount.HasValue) entity.DiscountAmount = r.DiscountAmount.Value;
        if (r.ShippingAmount.HasValue) entity.ShippingAmount = r.ShippingAmount.Value;
        entity.ShippingAddress = r.ShippingAddress;
        entity.Notes = r.Notes;
        entity.InternalNotes = r.InternalNotes;

        // Replace lines nếu có
        if (r.Lines != null)
        {
            if (r.Lines.Count == 0)
                throw new ValidationException("PO phải có ít nhất 1 dòng");

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
                    throw new NotFoundException($"Product {line.ProductId} không tồn tại");
                if (!units.TryGetValue(line.UnitId, out var unit))
                    throw new NotFoundException($"Unit {line.UnitId} không tồn tại");

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

        // Reload với nav
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
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");
        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException("Chỉ PO ở DRAFT mới xóa được");
        _db.PurchaseOrders.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<PurchaseOrderDto> Handle(ApprovePurchaseOrderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        if (!_tenant.IsAdmin && _tenant.Role != "MANAGER")
            throw new ForbiddenException("Chỉ Admin/Manager mới duyệt PO");

        var entity = await _db.PurchaseOrders
            .Include(p => p.Lines)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");

        if (entity.Status != PurchaseOrderStatus.Draft)
            throw new BusinessRuleException($"Chỉ PO ở DRAFT mới duyệt được. Hiện tại: {entity.Status}");
        if (!entity.Lines.Any())
            throw new BusinessRuleException("PO không có dòng nào");

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
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");

        if (entity.Status != PurchaseOrderStatus.Approved)
            throw new BusinessRuleException($"Chỉ PO ở APPROVED mới post được. Hiện tại: {entity.Status}");

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
            ?? throw new NotFoundException($"PurchaseOrder {request.Id} không tồn tại");

        if (entity.Status == PurchaseOrderStatus.Completed || entity.Status == PurchaseOrderStatus.Cancelled)
            throw new BusinessRuleException($"PO đã ở trạng thái cuối: {entity.Status}, không thể hủy");

        if (entity.ReceivedQtyTotal() > 0)
            throw new BusinessRuleException("PO đã có GRN, không thể hủy (cần xử lý GRN trước)");

        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ValidationException("Phải nhập lý do hủy");

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
}

internal static class PoExtensions
{
    public static decimal ReceivedQtyTotal(this PurchaseOrder po) => po.Lines.Sum(l => l.ReceivedQty);
}
