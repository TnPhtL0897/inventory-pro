using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
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
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public GoodsReceiptQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<GoodsReceiptDto> Handle(GetGoodsReceiptByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.GoodsReceipts
            .AsNoTracking()
            .Include(g => g.Party).Include(g => g.Warehouse).Include(g => g.PurchaseOrder)
            .Include(g => g.Lines)
            .FirstOrDefaultAsync(g => g.Id == request.Id && g.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} không tồn tại");
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

        return lines.Select(l => (l.Id, products.GetValueOrDefault(l.ProductId, ""), locations.GetValueOrDefault(l.LocationId, "")))
            .ToDictionary(x => x.Id, x => (x.Item2, x.Item3));
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
            g.PostedBy, g.PostedAt, lineDtos.Count,
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
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public GoodsReceiptCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<GoodsReceiptDto> Handle(CreateGoodsReceiptCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        await ValidateGrnRequestAsync(r, ct, null);

        // ⭐ Auto-fill BidContractId + BidLotId từ PO
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
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} không tồn tại");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chỉ GRN ở DRAFT mới sửa được");

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
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} không tồn tại");
        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chỉ GRN ở DRAFT mới xóa được");
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
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} không tồn tại");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException($"Chỉ GRN ở DRAFT mới post được. Hiện tại: {entity.Status}");
        if (!entity.Lines.Any())
            throw new BusinessRuleException("GRN phải có ít nhất 1 dòng");

        // Business rule: GRN post → ghi stock_movements IN, chỉ cho kho chẵn (RECEIVING).
        // (Check tại create đã enforce; check lại ở post phòng trường hợp warehouse type đổi sau khi GRN tạo)
        var postWh = await _db.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == entity.WarehouseId && w.TenantId == _tenant.TenantId, ct);
        if (postWh == null)
            throw new NotFoundException($"Warehouse {entity.WarehouseId} không tồn tại");
        if (postWh.Type != WarehouseType.Receiving)
            throw new BusinessRuleException(
                $"Kho '{postWh.Code}' hiện là kho lẻ (ISSUE), không thể post GRN. Vui lòng chọn kho chẵn (RECEIVING) khi tạo GRN.");

        // Insert stock_movements cho từng line
        foreach (var line in entity.Lines.Where(l => l.Status == GoodsReceiptLineStatus.Open))
        {
            // Idempotency key đã được lưu từ request (r.IdempotencyKeys[i] khi BuildLinesAsync)
            // Nếu không có, fallback sang Guid mới (best-effort)
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

            // Cập nhật PO line nếu có
            if (line.PoLineId.HasValue)
            {
                var poLine = await _db.PurchaseOrderLines
                    .FirstOrDefaultAsync(pl => pl.Id == line.PoLineId.Value, ct);
                if (poLine != null)
                {
                    poLine.ReceivedQty += line.Quantity;
                    // Status auto-update bởi trigger update_po_line_status
                }
            }

            line.MovementId = movement.Id; // sẽ được set khi SaveChanges
            line.Status = GoodsReceiptLineStatus.Posted;
        }

        entity.Status = GoodsReceiptStatus.Posted;
        entity.PostedBy = _tenant.UserId;
        entity.PostedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        // Update movement_id trên lines sau khi có id thật
        // (đã set trong loop, SaveChanges sẽ fill Id vào movement.Id)
        // Reload để lấy movement_id thật
        await _db.SaveChangesAsync(ct);

        // Check và đóng PO nếu đã nhận đủ
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
            ?? throw new NotFoundException($"GoodsReceipt {request.Id} không tồn tại");

        if (entity.Status != GoodsReceiptStatus.Draft)
            throw new BusinessRuleException("Chỉ GRN ở DRAFT mới hủy được (đã POSTED phải dùng reversal)");
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new ValidationException("Phải nhập lý do hủy");

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
            throw new ValidationException("GRN phải có ít nhất 1 dòng");
        if (r.IdempotencyKeys == null || r.IdempotencyKeys.Count != r.Lines.Count)
            throw new ValidationException("Mỗi dòng GRN cần 1 idempotency_key");
        if (r.IdempotencyKeys.Distinct().Count() != r.IdempotencyKeys.Count)
            throw new ValidationException("Idempotency keys phải unique");

        // Validate party là supplier
        var party = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.PartyId} không tồn tại");
        if (party.PartyType == PartyType.Customer)
            throw new BusinessRuleException("Party phải là SUPPLIER hoặc BOTH");

        // Validate warehouse + location thuộc branch
        var wh = await _db.Warehouses
            .FirstOrDefaultAsync(w => w.Id == r.WarehouseId && w.BranchId == r.BranchId && w.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Warehouse {r.WarehouseId} không thuộc branch {r.BranchId}");

        // Business rule: GRN chỉ cho phép ghi vào kho chẵn (RECEIVING).
        if (wh.Type != WarehouseType.Receiving)
            throw new BusinessRuleException(
                $"Kho '{wh.Code}' là kho lẻ (ISSUE), không thể tạo phiếu nhập. Vui lòng chọn kho chẵn (RECEIVING).");

        var locationIds = r.Lines.Select(l => l.LocationId).Distinct().ToList();
        var invalidLoc = await _db.Locations
            .Where(l => locationIds.Contains(l.Id) && (l.TenantId != _tenant.TenantId || l.WarehouseId != r.WarehouseId))
            .Select(l => l.Id).ToListAsync(ct);
        if (invalidLoc.Any())
            throw new NotFoundException($"Location {string.Join(", ", invalidLoc)} không thuộc warehouse {r.WarehouseId}");

        // Nếu có PO, validate party khớp
        if (r.PurchaseOrderId.HasValue)
        {
            var po = await _db.PurchaseOrders
                .FirstOrDefaultAsync(p => p.Id == r.PurchaseOrderId.Value && p.TenantId == _tenant.TenantId, ct)
                ?? throw new NotFoundException($"PO {r.PurchaseOrderId} không tồn tại");
            if (po.PartyId != r.PartyId)
                throw new BusinessRuleException("Party của GRN phải khớp với PO");
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
                throw new NotFoundException($"Product {line.ProductId} không tồn tại");
            if (!units.TryGetValue(line.UnitId, out var unit))
                throw new NotFoundException($"Unit {line.UnitId} không tồn tại");

            // Validate po_line nếu có
            if (line.PoLineId.HasValue)
            {
                var poLine = await _db.PurchaseOrderLines
                    .Include(pl => pl.PurchaseOrder)
                    .FirstOrDefaultAsync(pl => pl.Id == line.PoLineId.Value, ct)
                    ?? throw new NotFoundException($"PO Line {line.PoLineId} không tồn tại");
                if (poLine.PurchaseOrderId != entity.PurchaseOrderId)
                    throw new BusinessRuleException("PO line không thuộc PO của GRN");
                if (poLine.ProductId != line.ProductId)
                    throw new BusinessRuleException("Product của GRN line phải khớp với PO line");
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
                // Lưu idempotency_key từ request để dùng lúc post tạo movement
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
