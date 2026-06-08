using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Application.Common.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Inventory.Stock;

// =============================================================================
// Queries
// =============================================================================
public record ListStockQuery(
    int Page = 1,
    int PageSize = 50,
    Guid? BranchId = null,
    Guid? WarehouseId = null,
    Guid? ProductId = null,
    Guid? CategoryId = null) : IRequest<PaginatedResult<StockLevelDto>>;

public record ListMovementsQuery(
    int Page = 1,
    int PageSize = 50,
    Guid? BranchId = null,
    Guid? WarehouseId = null,
    Guid? ProductId = null,
    string? MovementType = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null) : IRequest<PaginatedResult<StockMovementDto>>;

// =============================================================================
// Commands
// =============================================================================
public record RecordMovementCommand(RecordMovementRequest Request, Guid IdempotencyKey) : IRequest<StockMovementDto>;

// =============================================================================
// Handlers
// =============================================================================
public class StockQueryHandler :
    IRequestHandler<ListStockQuery, PaginatedResult<StockLevelDto>>,
    IRequestHandler<ListMovementsQuery, PaginatedResult<StockMovementDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public StockQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PaginatedResult<StockLevelDto>> Handle(ListStockQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Stock.AsNoTracking().Where(s => s.TenantId == _tenant.TenantId);
        if (req.BranchId.HasValue) q = q.Where(s => s.BranchId == req.BranchId);
        if (req.WarehouseId.HasValue) q = q.Where(s => s.WarehouseId == req.WarehouseId);
        if (req.ProductId.HasValue) q = q.Where(s => s.ProductId == req.ProductId);
        if (req.CategoryId.HasValue)
        {
            q = q.Where(s => _db.Products.Any(p => p.Id == s.ProductId && p.CategoryId == req.CategoryId));
        }

        var total = await q.CountAsync(ct);
        var items = await q
            .Join(_db.Products, s => s.ProductId, p => p.Id, (s, p) => new { s, p })
            .Join(_db.UnitsOfMeasure, x => x.p.BaseUnitId, u => u.Id, (x, u) => new { x.s, x.p, BaseUnitCode = u.Code })
            .Join(_db.Warehouses, x => x.s.WarehouseId, w => w.Id, (x, w) => new { x.s, x.p, x.BaseUnitCode, WarehouseCode = w.Code })
            .Join(_db.Locations, x => x.s.LocationId, l => l.Id, (x, l) => new { x.s, x.p, x.BaseUnitCode, x.WarehouseCode, LocationCode = l.Code })
            .OrderBy(x => x.p.Name)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Select(x => new StockLevelDto(
                x.s.ProductId, x.p.Sku, x.p.Name, x.BaseUnitCode,
                x.s.BranchId, x.s.WarehouseId, x.WarehouseCode,
                x.s.LocationId, x.LocationCode,
                x.s.BatchNo, x.s.SerialNo,
                x.s.Quantity, x.s.ReservedQty,
                x.s.Quantity - x.s.ReservedQty,
                x.s.AvgCost, x.s.LastMovementAt))
            .ToListAsync(ct);

        return new PaginatedResult<StockLevelDto>
        {
            Items = items,
            Total = total,
            Page = req.Page,
            PageSize = req.PageSize,
        };
    }

    public async Task<PaginatedResult<StockMovementDto>> Handle(ListMovementsQuery req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.StockMovements.AsNoTracking().Where(m => m.TenantId == _tenant.TenantId);
        if (req.BranchId.HasValue) q = q.Where(m => m.BranchId == req.BranchId);
        if (req.WarehouseId.HasValue) q = q.Where(m => m.WarehouseId == req.WarehouseId);
        if (req.ProductId.HasValue) q = q.Where(m => m.ProductId == req.ProductId);
        if (!string.IsNullOrEmpty(req.MovementType))
        {
            var mt = Enum.Parse<StockMovementType>(req.MovementType, ignoreCase: true);
            q = q.Where(m => m.MovementType == mt);
        }
        if (req.DateFrom.HasValue) q = q.Where(m => m.PostedAt >= req.DateFrom.Value);
        if (req.DateTo.HasValue) q = q.Where(m => m.PostedAt <= req.DateTo.Value);

        var total = await q.CountAsync(ct);
        var items = await q
            .OrderByDescending(m => m.PostedAt)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Join(_db.Products, m => m.ProductId, p => p.Id, (m, p) => new StockMovementDto(
                m.Id, m.BranchId, m.WarehouseId, m.LocationId, m.ProductId,
                p.Sku, p.Name, m.UnitId, m.MovementType.ToString(),
                m.Quantity, m.UnitCost, m.RefType.ToString(), m.RefId,
                m.Notes, m.BatchNo, m.SerialNo, m.ExpiryDate,
                m.IdempotencyKey, m.PostedAt))
            .ToListAsync(ct);

        return new PaginatedResult<StockMovementDto>
        {
            Items = items, Total = total, Page = req.Page, PageSize = req.PageSize,
        };
    }
}

public class StockCommandHandler : IRequestHandler<RecordMovementCommand, StockMovementDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public StockCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<StockMovementDto> Handle(RecordMovementCommand req, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = req.Request;

        // 1. Idempotency check: Ä‘Ã£ cÃ³ movement vá»›i key nÃ y chÆ°a?
        var existing = await _db.StockMovements
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.TenantId == _tenant.TenantId && m.IdempotencyKey == req.IdempotencyKey, ct);
        if (existing != null)
        {
            return await ToDtoAsync(existing, ct);
        }

        // 2. Validate referenced entities
        var productOk = await _db.Products.AnyAsync(p => p.Id == r.ProductId && p.TenantId == _tenant.TenantId, ct);
        if (!productOk) throw new NotFoundException("Product khÃ´ng tá»“n táº¡i");
        var unitOk = await _db.UnitsOfMeasure.AnyAsync(u => u.Id == r.UnitId && u.TenantId == _tenant.TenantId, ct);
        if (!unitOk) throw new NotFoundException("Unit khÃ´ng tá»“n táº¡i");
        var warehouseOk = await _db.Warehouses.AnyAsync(w => w.Id == r.WarehouseId && w.TenantId == _tenant.TenantId, ct);
        if (!warehouseOk) throw new NotFoundException("Warehouse khÃ´ng tá»“n táº¡i");
        var locationOk = await _db.Locations.AnyAsync(l => l.Id == r.LocationId && l.WarehouseId == r.WarehouseId, ct);
        if (!locationOk) throw new NotFoundException("Location khÃ´ng thuá»™c warehouse");

        // 3. Validate movement type
        if (!Enum.TryParse<StockMovementType>(r.MovementType, true, out var mt))
            throw new ValidationException($"MovementType '{r.MovementType}' khÃ´ng há»£p lá»‡");

        // 4. Validate quantity > 0
        if (r.Quantity <= 0)
            throw new ValidationException("Quantity pháº£i > 0");

        // 5. Validate batch/serial náº¿u product yÃªu cáº§u
        var product = await _db.Products.AsNoTracking().FirstAsync(p => p.Id == r.ProductId, ct);
        if (product.IsBatchTracked && string.IsNullOrEmpty(r.BatchNo))
            throw new ValidationException("Product yÃªu cáº§u batch_no");
        if (product.IsSerialTracked && string.IsNullOrEmpty(r.SerialNo))
            throw new ValidationException("Product yÃªu cáº§u serial_no");

        // 6. Táº¡o movement. Trigger trong DB sáº½ tá»± update stock.
        var movement = new StockMovement
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.TenantId!.Value,
            BranchId = r.BranchId,
            WarehouseId = r.WarehouseId,
            LocationId = r.LocationId,
            ProductId = r.ProductId,
            UnitId = r.UnitId,
            MovementType = mt,
            Quantity = r.Quantity,
            UnitCost = r.UnitCost,
            Notes = r.Notes,
            BatchNo = r.BatchNo,
            SerialNo = r.SerialNo,
            ExpiryDate = r.ExpiryDate,
            IdempotencyKey = req.IdempotencyKey,
            CreatedBy = _tenant.UserId,
            PostedAt = DateTime.UtcNow,
        };
        _db.StockMovements.Add(movement);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("check_violation", StringComparison.OrdinalIgnoreCase) == true)
        {
            // Trigger tá»« chá»‘i vÃ¬ stock Ã¢m
            throw new ConflictException("KhÃ´ng thá»ƒ xuáº¥t: tá»“n kho khÃ´ng Ä‘á»§ (warehouse khÃ´ng cho phÃ©p Ã¢m)");
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("unique", StringComparison.OrdinalIgnoreCase) == true)
        {
            // Race: 2 request cÃ¹ng idempotency_key
            existing = await _db.StockMovements.AsNoTracking()
                .FirstOrDefaultAsync(m => m.TenantId == _tenant.TenantId && m.IdempotencyKey == req.IdempotencyKey, ct);
            if (existing != null) return await ToDtoAsync(existing, ct);
            throw;
        }
        return await ToDtoAsync(movement, ct);
    }

    private async Task<StockMovementDto> ToDtoAsync(StockMovement m, CancellationToken ct)
    {
        var p = await _db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == m.ProductId, ct);
        return new StockMovementDto(
            m.Id, m.BranchId, m.WarehouseId, m.LocationId, m.ProductId,
            p?.Sku, p?.Name,
            m.UnitId, m.MovementType.ToString(),
            m.Quantity, m.UnitCost, m.RefType.ToString(), m.RefId,
            m.Notes, m.BatchNo, m.SerialNo, m.ExpiryDate,
            m.IdempotencyKey, m.PostedAt);
    }
}
