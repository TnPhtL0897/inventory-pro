using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Inventory;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.Transfers;

// =============================================================================
// Queries
// =============================================================================
public record GetStockTransferByIdQuery(Guid Id) : IRequest<StockTransferDto>;
public record ListStockTransfersQuery(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    Guid? FromBranchId = null,
    Guid? ToBranchId = null,
    Guid? FromWarehouseId = null,
    Guid? ToWarehouseId = null,
    string? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<StockTransferDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreateStockTransferCommand(CreateStockTransferRequest Request) : IRequest<StockTransferDto>;
public record UpdateStockTransferCommand(Guid Id, UpdateStockTransferRequest Request) : IRequest<StockTransferDto>;
public record DeleteStockTransferCommand(Guid Id) : IRequest<Unit>;

// Ship = tạo TRANSFER_OUT movements (xuất khỏi src)
public record ShipStockTransferCommand(Guid Id) : IRequest<StockTransferDto>;

// Receive = tạo TRANSFER_IN movements (nhập vào dst)
public record ReceiveStockTransferCommand(Guid Id, ReceiveStockTransferRequest Request) : IRequest<StockTransferDto>;

// Cancel
public record CancelStockTransferCommand(Guid Id, string Reason) : IRequest<StockTransferDto>;

// =============================================================================
// Handlers
// =============================================================================
public class StockTransferQueryHandler :
    IRequestHandler<GetStockTransferByIdQuery, StockTransferDto>,
    IRequestHandler<ListStockTransfersQuery, PaginatedResult<StockTransferDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;
    public StockTransferQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockTransferDto> Handle(GetStockTransferByIdQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers
            .AsNoTracking()
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        return await ToDtoAsync(t, ct);
    }

    public async Task<PaginatedResult<StockTransferDto>> Handle(ListStockTransfersQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.StockTransfers.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var s = req.Search.Trim().ToLower();
            q = q.Where(x => x.TransferNumber.ToLower().Contains(s) || (x.Notes != null && x.Notes.ToLower().Contains(s)));
        }
        if (req.FromBranchId.HasValue) q = q.Where(x => x.FromBranchId == req.FromBranchId);
        if (req.ToBranchId.HasValue) q = q.Where(x => x.ToBranchId == req.ToBranchId);
        if (req.FromWarehouseId.HasValue) q = q.Where(x => x.FromWarehouseId == req.FromWarehouseId);
        if (req.ToWarehouseId.HasValue) q = q.Where(x => x.ToWarehouseId == req.ToWarehouseId);
        if (!string.IsNullOrEmpty(req.Status))
        {
            var st = Enum.Parse<StockTransferStatus>(req.Status, ignoreCase: true);
            q = q.Where(x => x.Status == st);
        }
        if (req.DateFrom.HasValue) q = q.Where(x => x.TransferDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) q = q.Where(x => x.TransferDate <= req.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.TransferDate)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);
        var dtos = new List<StockTransferDto>(items.Count);
        foreach (var t in items) dtos.Add(await ToDtoAsync(t, ct));
        return new PaginatedResult<StockTransferDto>
        {
            Items = dtos, Total = total, Page = req.Page, PageSize = req.PageSize,
        };
    }

    private async Task<StockTransferDto> ToDtoAsync(StockTransfer t, CancellationToken ct)
    {
        var warehouseIds = new[] { t.FromWarehouseId, t.ToWarehouseId }.Distinct().ToList();
        var warehouses = await _db.Warehouses.AsNoTracking()
            .Where(w => warehouseIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.Code, ct);
        return new StockTransferDto(
            t.Id, t.TransferNumber,
            t.FromBranchId, t.FromWarehouseId, warehouses.GetValueOrDefault(t.FromWarehouseId),
            t.ToBranchId, t.ToWarehouseId, warehouses.GetValueOrDefault(t.ToWarehouseId),
            t.TransferDate, t.ExpectedReceiptDate, t.Notes,
            t.Status.ToString().ToUpperInvariant(),
            t.OutShippedBy, t.OutShippedAt,
            t.InReceivedBy, t.InReceivedAt,
            t.CancelReason,
            t.Lines.Count,
            t.CreatedAt, t.UpdatedAt);
    }
}

public class StockTransferCommandHandler :
    IRequestHandler<CreateStockTransferCommand, StockTransferDto>,
    IRequestHandler<UpdateStockTransferCommand, StockTransferDto>,
    IRequestHandler<DeleteStockTransferCommand, Unit>,
    IRequestHandler<ShipStockTransferCommand, StockTransferDto>,
    IRequestHandler<ReceiveStockTransferCommand, StockTransferDto>,
    IRequestHandler<CancelStockTransferCommand, StockTransferDto>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;
    public StockTransferCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockTransferDto> Handle(CreateStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;
        await ValidateCreateAsync(r, ct);

        var entity = new StockTransfer
        {
            TenantId = _tenant.TenantId!.Value,
            TransferNumber = await GenerateTransferNumberAsync(ct),
            FromBranchId = r.FromBranchId,
            FromWarehouseId = r.FromWarehouseId,
            ToBranchId = r.ToBranchId,
            ToWarehouseId = r.ToWarehouseId,
            TransferDate = r.TransferDate,
            ExpectedReceiptDate = r.ExpectedReceiptDate,
            Notes = r.Notes,
            Status = StockTransferStatus.Draft,
            CreatedBy = _tenant.UserId,
        };
        await BuildLinesAsync(entity, r.Lines, ct);

        _db.StockTransfers.Add(entity);
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(entity.Id, ct);
    }

    public async Task<StockTransferDto> Handle(UpdateStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        if (t.Status != StockTransferStatus.Draft)
            throw new BusinessRuleException("Chỉ sửa được phiếu DRAFT");

        var r = req.Request;
        if (r.TransferDate.HasValue) t.TransferDate = r.TransferDate.Value;
        if (r.ExpectedReceiptDate.HasValue) t.ExpectedReceiptDate = r.ExpectedReceiptDate;
        if (r.Notes != null) t.Notes = r.Notes;
        if (r.Lines != null)
        {
            _db.StockTransferLines.RemoveRange(t.Lines);
            t.Lines.Clear();
            var req2 = new CreateStockTransferRequest(
                t.FromBranchId, t.FromWarehouseId, t.ToBranchId, t.ToWarehouseId,
                t.TransferDate, t.ExpectedReceiptDate, t.Notes, r.Lines);
            await ValidateCreateAsync(req2, ct);
            await BuildLinesAsync(t, r.Lines, ct);
        }
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(t.Id, ct);
    }

    public async Task<Unit> Handle(DeleteStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        if (t.Status != StockTransferStatus.Draft)
            throw new BusinessRuleException("Chỉ xóa được phiếu DRAFT");
        _db.StockTransfers.Remove(t);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<StockTransferDto> Handle(ShipStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        if (t.Status != StockTransferStatus.Draft)
            throw new BusinessRuleException($"Chỉ phiếu DRAFT mới ship được. Hiện tại: {t.Status}");
        if (!t.Lines.Any())
            throw new BusinessRuleException("Phiếu phải có ít nhất 1 dòng");

        foreach (var line in t.Lines.Where(l => l.Status == StockTransferLineStatus.Open))
        {
            var outMovement = new StockMovement
            {
                TenantId = t.TenantId,
                BranchId = t.FromBranchId,
                WarehouseId = t.FromWarehouseId,
                LocationId = line.FromLocationId,
                ProductId = line.ProductId,
                UnitId = line.UnitId,
                MovementType = StockMovementType.TRANSFER_OUT,
                Status = StockMovementStatus.Posted,
                Quantity = line.Quantity,
                RefType = StockReferenceType.Transfer,
                RefId = t.Id,
                RefLineId = line.Id,
                BatchNo = line.BatchNo,
                SerialNo = line.SerialNo,
                ExpiryDate = line.ExpiryDate,
                Notes = line.Notes ?? t.Notes,
                IdempotencyKey = line.Id,
                CreatedBy = _tenant.UserId,
            };
            _db.StockMovements.Add(outMovement);
            line.OutMovementId = outMovement.Id; // will be filled after SaveChanges
            line.ShippedQty = line.Quantity;
            line.Status = StockTransferLineStatus.InTransit;
        }

        t.Status = StockTransferStatus.InTransit;
        t.OutShippedBy = _tenant.UserId;
        t.OutShippedAt = DateTime.UtcNow;
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("check_violation", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new ConflictException("Không thể ship: tồn kho nguồn không đủ (warehouse không cho phép âm)");
        }
        return await LoadAndMapAsync(t.Id, ct);
    }

    public async Task<StockTransferDto> Handle(ReceiveStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        if (t.Status != StockTransferStatus.InTransit)
            throw new BusinessRuleException($"Chỉ phiếu IN_TRANSIT mới nhận được. Hiện tại: {t.Status}");

        var lineUpdates = req.Request.Lines.ToDictionary(x => x.LineId, x => x.ReceivedQty);
        if (lineUpdates.Count == 0)
            throw new ValidationException("Phải có ít nhất 1 dòng nhận");

        foreach (var line in t.Lines.Where(l => l.Status == StockTransferLineStatus.InTransit))
        {
            if (!lineUpdates.TryGetValue(line.Id, out var receivedQty))
                continue;
            if (receivedQty < 0)
                throw new ValidationException($"ReceivedQty dòng {line.LineNo} phải >= 0");
            if (receivedQty > line.ShippedQty)
                throw new ValidationException($"ReceivedQty dòng {line.LineNo} ({receivedQty}) vượt quá ShippedQty ({line.ShippedQty})");

            if (receivedQty > 0)
            {
                var inMovement = new StockMovement
                {
                    TenantId = t.TenantId,
                    BranchId = t.ToBranchId,
                    WarehouseId = t.ToWarehouseId,
                    LocationId = line.ToLocationId,
                    ProductId = line.ProductId,
                    UnitId = line.UnitId,
                    MovementType = StockMovementType.TRANSFER_IN,
                    Status = StockMovementStatus.Posted,
                    Quantity = receivedQty,
                    RefType = StockReferenceType.Transfer,
                    RefId = t.Id,
                    RefLineId = line.Id,
                    BatchNo = line.BatchNo,
                    SerialNo = line.SerialNo,
                    ExpiryDate = line.ExpiryDate,
                    Notes = req.Request.Notes ?? t.Notes,
                    IdempotencyKey = Guid.NewGuid(),
                    CreatedBy = _tenant.UserId,
                };
                _db.StockMovements.Add(inMovement);
                line.InMovementId = inMovement.Id;
            }
            line.ReceivedQty = receivedQty;
            line.Status = receivedQty == line.ShippedQty
                ? StockTransferLineStatus.Received
                : StockTransferLineStatus.InTransit; // partial
        }

        // Nếu tất cả lines đã received → đóng phiếu
        if (t.Lines.All(l => l.Status == StockTransferLineStatus.Received))
        {
            t.Status = StockTransferStatus.Received;
            t.InReceivedBy = _tenant.UserId;
            t.InReceivedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(t.Id, ct);
    }

    public async Task<StockTransferDto> Handle(CancelStockTransferCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var t = await _db.StockTransfers
            .FirstOrDefaultAsync(x => x.Id == req.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException("StockTransfer", req.Id);
        if (t.Status == StockTransferStatus.Received || t.Status == StockTransferStatus.Cancelled)
            throw new BusinessRuleException($"Không thể hủy phiếu đã {t.Status}");
        if (string.IsNullOrWhiteSpace(req.Reason))
            throw new ValidationException("Phải nhập lý do hủy");

        // Nếu đã IN_TRANSIT, cần tạo movement TRANSFER_IN ngược để bù lại (compensation)
        if (t.Status == StockTransferStatus.InTransit)
        {
            var tWithLines = await _db.StockTransfers.Include(x => x.Lines)
                .FirstAsync(x => x.Id == req.Id, ct);
            foreach (var line in tWithLines.Lines.Where(l => l.ShippedQty > 0 && l.Status != StockTransferLineStatus.Cancelled))
            {
                var reverseMovement = new StockMovement
                {
                    TenantId = t.TenantId,
                    BranchId = t.FromBranchId,
                    WarehouseId = t.FromWarehouseId,
                    LocationId = line.FromLocationId,
                    ProductId = line.ProductId,
                    UnitId = line.UnitId,
                    MovementType = StockMovementType.TRANSFER_IN, // ngược lại: nhập lại vào src
                    Status = StockMovementStatus.Posted,
                    Quantity = line.ShippedQty,
                    RefType = StockReferenceType.Transfer,
                    RefId = t.Id,
                    RefLineId = line.Id,
                    BatchNo = line.BatchNo,
                    SerialNo = line.SerialNo,
                    ExpiryDate = line.ExpiryDate,
                    Notes = $"Hoàn từ phiếu chuyển kho bị hủy: {req.Reason}",
                    IdempotencyKey = Guid.NewGuid(),
                    CreatedBy = _tenant.UserId,
                };
                _db.StockMovements.Add(reverseMovement);
            }
        }
        t.Status = StockTransferStatus.Cancelled;
        t.CancelReason = req.Reason;
        t.CancelledBy = _tenant.UserId;
        t.CancelledAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await LoadAndMapAsync(t.Id, ct);
    }

    // ----- helpers -----
    private async Task ValidateCreateAsync(CreateStockTransferRequest r, CancellationToken ct)
    {
        if (r.FromBranchId == r.ToBranchId && r.FromWarehouseId == r.ToWarehouseId)
            throw new ValidationException("Kho nguồn và kho đích phải khác nhau");
        if (r.Lines == null || r.Lines.Count == 0)
            throw new ValidationException("Phiếu phải có ít nhất 1 dòng");
        var keys = r.Lines.Select(l => l.IdempotencyKey).ToList();
        if (keys.Distinct().Count() != keys.Count)
            throw new ValidationException("Idempotency keys phải unique");

        // Validate warehouses
        var srcWh = await _db.Warehouses.AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == r.FromWarehouseId && w.TenantId == _tenant.TenantId && w.BranchId == r.FromBranchId, ct)
            ?? throw new NotFoundException($"Kho nguồn {r.FromWarehouseId} không thuộc branch {r.FromBranchId}");
        var dstWh = await _db.Warehouses.AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == r.ToWarehouseId && w.TenantId == _tenant.TenantId && w.BranchId == r.ToBranchId, ct)
            ?? throw new NotFoundException($"Kho đích {r.ToWarehouseId} không thuộc branch {r.ToBranchId}");

        var locationIds = r.Lines.SelectMany(l => new[] { l.FromLocationId, l.ToLocationId }).Distinct().ToList();
        var locations = await _db.Locations.AsNoTracking()
            .Where(l => locationIds.Contains(l.Id) && l.TenantId == _tenant.TenantId)
            .ToListAsync(ct);
        var locDict = locations.ToDictionary(l => l.Id);

        foreach (var (line, i) in r.Lines.Select((l, i) => (l, i)))
        {
            if (line.Quantity <= 0)
                throw new ValidationException($"Dòng {i + 1}: số lượng phải > 0");
            if (!locDict.TryGetValue(line.FromLocationId, out var fromLoc) || fromLoc.WarehouseId != r.FromWarehouseId)
                throw new ValidationException($"Dòng {i + 1}: vị trí nguồn không thuộc kho nguồn");
            if (!locDict.TryGetValue(line.ToLocationId, out var toLoc) || toLoc.WarehouseId != r.ToWarehouseId)
                throw new ValidationException($"Dòng {i + 1}: vị trí đích không thuộc kho đích");
        }
    }

    private async Task BuildLinesAsync(StockTransfer t, List<CreateStockTransferLineRequest> lineReqs, CancellationToken ct)
    {
        var productIds = lineReqs.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lineReqs.Select(l => l.UnitId).Distinct().ToList();
        var locationIds = lineReqs.SelectMany(l => new[] { l.FromLocationId, l.ToLocationId }).Distinct().ToList();

        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id) && p.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(p => p.Id, ct);
        var units = await _db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id) && u.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(u => u.Id, ct);
        var locations = await _db.Locations.AsNoTracking()
            .Where(l => locationIds.Contains(l.Id) && l.TenantId == _tenant.TenantId)
            .ToDictionaryAsync(l => l.Id, ct);

        for (int i = 0; i < lineReqs.Count; i++)
        {
            var r = lineReqs[i];
            if (!products.TryGetValue(r.ProductId, out var p))
                throw new NotFoundException($"Product {r.ProductId} không tồn tại");
            if (!units.TryGetValue(r.UnitId, out var u))
                throw new NotFoundException($"Unit {r.UnitId} không tồn tại");
            var fromLoc = locations.GetValueOrDefault(r.FromLocationId);
            var toLoc = locations.GetValueOrDefault(r.ToLocationId);

            t.Lines.Add(new StockTransferLine
            {
                TenantId = t.TenantId,
                LineNo = i + 1,
                ProductId = r.ProductId,
                UnitId = r.UnitId,
                ProductName = p.Name,
                UnitCode = u.Code,
                FromLocationId = r.FromLocationId,
                FromLocationCode = fromLoc?.Code ?? "",
                ToLocationId = r.ToLocationId,
                ToLocationCode = toLoc?.Code ?? "",
                Quantity = r.Quantity,
                BatchNo = r.BatchNo,
                SerialNo = r.SerialNo,
                ExpiryDate = r.ExpiryDate,
                Notes = r.Notes,
                Status = StockTransferLineStatus.Open,
            });
        }
    }

    private async Task<string> GenerateTransferNumberAsync(CancellationToken ct)
    {
        var prefix = $"TR-{DateTime.UtcNow:yyyyMM}-";
        var count = await _db.StockTransfers
            .CountAsync(x => x.TenantId == _tenant.TenantId && x.TransferNumber.StartsWith(prefix), ct);
        return prefix + (count + 1).ToString("D4");
    }

    private async Task<StockTransferDto> LoadAndMapAsync(Guid id, CancellationToken ct)
    {
        var t = await _db.StockTransfers.AsNoTracking()
            .Include(x => x.Lines)
            .FirstAsync(x => x.Id == id, ct);
        var warehouseIds = new[] { t.FromWarehouseId, t.ToWarehouseId }.Distinct().ToList();
        var whs = await _db.Warehouses.AsNoTracking()
            .Where(w => warehouseIds.Contains(w.Id))
            .ToDictionaryAsync(w => w.Id, w => w.Code, ct);
        return new StockTransferDto(
            t.Id, t.TransferNumber,
            t.FromBranchId, t.FromWarehouseId, whs.GetValueOrDefault(t.FromWarehouseId),
            t.ToBranchId, t.ToWarehouseId, whs.GetValueOrDefault(t.ToWarehouseId),
            t.TransferDate, t.ExpectedReceiptDate, t.Notes,
            t.Status.ToString().ToUpperInvariant(),
            t.OutShippedBy, t.OutShippedAt,
            t.InReceivedBy, t.InReceivedAt,
            t.CancelReason,
            t.Lines.Count,
            t.CreatedAt, t.UpdatedAt);
    }
}
