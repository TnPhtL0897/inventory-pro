using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Replenishment;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Application.Common.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Replenishment;

using InventoryPro.Application.Common.Tenancy;

// =============================================================================
// REPLENISHMENT HANDLERS (Dá»± trÃ¹ cuá»‘i thÃ¡ng cho kho cháºµn)
// =============================================================================

public record PreviewReplenishmentQuery(RunReplenishmentRequest Request) : IRequest<ForecastPreviewDto>;
public record RunReplenishmentCommand(RunReplenishmentRequest Request, ReplenishmentRunType RunType) : IRequest<MonthEndForecastRunDto>;
public record ListReplenishmentRunsQuery(int? Year, int Page = 1, int PageSize = 20) : IRequest<PaginatedResult<MonthEndForecastRunDto>>;

public class ReplenishmentQueryHandler :
    IRequestHandler<PreviewReplenishmentQuery, ForecastPreviewDto>,
    IRequestHandler<ListReplenishmentRunsQuery, PaginatedResult<MonthEndForecastRunDto>>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ReplenishmentQueryHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<ForecastPreviewDto> Handle(PreviewReplenishmentQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var req = request.Request;
        ValidateRequest(req);

        var asOfDate = (req.AsOfDate ?? new DateTime(req.FiscalYear, req.FiscalMonth, 1).AddDays(-1)).Date;
        var lines = await ReplenishmentCalculator.ComputeAsync(_db, _tenant.TenantId!.Value, asOfDate, ct);

        return new ForecastPreviewDto(
            _tenant.TenantId.Value,
            asOfDate,
            req.FiscalYear,
            req.FiscalMonth,
            lines.Select(l => l.WarehouseId).Distinct().Count(),
            lines.Count,
            lines.Sum(l => l.EstimatedTotal),
            lines.Select(l => l.ToDto()).ToList());
    }

    public async Task<PaginatedResult<MonthEndForecastRunDto>> Handle(ListReplenishmentRunsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.MonthEndForecastRuns.AsNoTracking().Where(x => x.TenantId == _tenant.TenantId);
        if (request.Year.HasValue) q = q.Where(x => x.FiscalYear == request.Year.Value);

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.FiscalYear).ThenByDescending(x => x.FiscalMonth)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        return new PaginatedResult<MonthEndForecastRunDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public static MonthEndForecastRunDto ToDto(MonthEndForecastRun r) => new(
        r.Id, r.RunType.ToString(), r.FiscalYear, r.FiscalMonth, r.AsOfDate,
        r.TriggeredByUser, r.Status.ToString(),
        r.WarehouseCount, r.ProductCount, r.TotalEstimatedValue,
        r.CreatedPurchaseRequestIds, r.ErrorMessage, r.CreatedAt);

    private static void ValidateRequest(RunReplenishmentRequest req)
    {
        if (req.FiscalYear < 2000 || req.FiscalYear > 2100)
            throw new ValidationException("NÄƒm khÃ´ng há»£p lá»‡ (2000-2100)");
        if (req.FiscalMonth < 1 || req.FiscalMonth > 12)
            throw new ValidationException("ThÃ¡ng khÃ´ng há»£p lá»‡ (1-12)");
    }
}

public class ReplenishmentCommandHandler : IRequestHandler<RunReplenishmentCommand, MonthEndForecastRunDto>
{
    private readonly IInventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ReplenishmentCommandHandler(IInventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<MonthEndForecastRunDto> Handle(RunReplenishmentCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var req = request.Request;
        if (req.FiscalYear < 2000 || req.FiscalYear > 2100)
            throw new ValidationException("NÄƒm khÃ´ng há»£p lá»‡ (2000-2100)");
        if (req.FiscalMonth < 1 || req.FiscalMonth > 12)
            throw new ValidationException("ThÃ¡ng khÃ´ng há»£p lá»‡ (1-12)");

        var tenantId = _tenant.TenantId!.Value;
        var asOfDate = (req.AsOfDate ?? new DateTime(req.FiscalYear, req.FiscalMonth, 1).AddDays(-1)).Date;

        // Idempotency check (DB cÅ©ng cÃ³ UNIQUE, check trÆ°á»›c Ä‘á»ƒ cÃ³ message rÃµ rÃ ng)
        var existing = await _db.MonthEndForecastRuns.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.FiscalYear == req.FiscalYear && x.FiscalMonth == req.FiscalMonth, ct);
        if (existing != null)
            throw new BusinessRuleException($"ÄÃ£ cháº¡y dá»± trÃ¹ cho thÃ¡ng {req.FiscalMonth}/{req.FiscalYear} rá»“i (Run #{existing.Id}). Xem lá»‹ch sá»­ á»Ÿ trang Dá»± trÃ¹ cuá»‘i thÃ¡ng.");

        try
        {
            // 1. TÃ­nh forecast
            var lines = await ReplenishmentCalculator.ComputeAsync(_db, tenantId, asOfDate, ct);
            var totalValue = lines.Sum(l => l.EstimatedTotal);
            var productCount = lines.Count;
            var warehouseCount = lines.Select(l => l.WarehouseId).Distinct().Count();

            // 2. Táº¡o PurchaseRequest náº¿u yÃªu cáº§u
            var createdPrIds = new List<Guid>();
            if (req.SaveAsPurchaseRequest && lines.Count > 0)
            {
                var pr = new PurchaseRequest
                {
                    TenantId = tenantId,
                    BranchId = (await _db.Branches.AsNoTracking().Where(b => b.TenantId == tenantId).Select(b => b.Id).FirstOrDefaultAsync(ct)),
                    PrNumber = GeneratePrNumber(req.FiscalYear, req.FiscalMonth),
                    RequestDept = "[AUTO] Dá»± trÃ¹ cuá»‘i thÃ¡ng",
                    FiscalYear = req.FiscalYear,
                    Status = PurchaseRequestStatus.Draft,
                    RequestedDate = asOfDate,
                    Notes = req.Notes ?? $"Dá»± trÃ¹ cuá»‘i thÃ¡ng {req.FiscalMonth}/{req.FiscalYear} - {lines.Count} sáº£n pháº©m",
                    CreatedBy = _tenant.UserId,
                };
                foreach (var l in lines)
                {
                    pr.Lines.Add(new PurchaseRequestLine
                    {
                        TenantId = tenantId,
                        ProductId = l.ProductId,
                        Quantity = l.SuggestedReplenishQty,
                        UnitId = l.UnitId,
                        EstimatedUnitPrice = l.EstimatedUnitPrice,
                        Notes = l.Reason,
                    });
                }
                _db.PurchaseRequests.Add(pr);
                await _db.SaveChangesAsync(ct);
                createdPrIds.Add(pr.Id);
            }

            // 3. LÆ°u run history
            var run = new MonthEndForecastRun
            {
                TenantId = tenantId,
                RunType = request.RunType,
                FiscalYear = req.FiscalYear,
                FiscalMonth = req.FiscalMonth,
                AsOfDate = asOfDate,
                TriggeredByUser = request.RunType == ReplenishmentRunType.Manual ? _tenant.UserId : null,
                Status = ReplenishmentRunStatus.Completed,
                WarehouseCount = warehouseCount,
                ProductCount = productCount,
                TotalEstimatedValue = totalValue,
                CreatedPurchaseRequestIds = createdPrIds,
            };
            _db.MonthEndForecastRuns.Add(run);
            await _db.SaveChangesAsync(ct);

            return ReplenishmentQueryHandler.ToDto(run);
        }
        catch (BusinessRuleException) { throw; }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("uq_forecast_run_per_month") == true)
        {
            throw new BusinessRuleException($"ÄÃ£ cháº¡y dá»± trÃ¹ cho thÃ¡ng {req.FiscalMonth}/{req.FiscalYear} rá»“i (race condition).");
        }
        catch (Exception ex)
        {
            // Log failure run
            try
            {
                var failedRun = new MonthEndForecastRun
                {
                    TenantId = tenantId,
                    RunType = request.RunType,
                    FiscalYear = req.FiscalYear,
                    FiscalMonth = req.FiscalMonth,
                    AsOfDate = asOfDate,
                    TriggeredByUser = request.RunType == ReplenishmentRunType.Manual ? _tenant.UserId : null,
                    Status = ReplenishmentRunStatus.Failed,
                    ErrorMessage = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message,
                };
                _db.MonthEndForecastRuns.Add(failedRun);
                await _db.SaveChangesAsync(ct);
            }
            catch { /* best-effort */ }
            throw;
        }
    }

    private static string GeneratePrNumber(int year, int month) => $"DT-FC-{year}-{month:D2}-{Guid.NewGuid().ToString()[..4].ToUpperInvariant()}";
}

// =============================================================================
// CORE ALGORITHM: Compute forecast lines
// =============================================================================
//
// Lá»ŠCH Sá»¬ THAY Äá»”I ALGORITHM
// -----------------------------------------------------------------------------
// V1 (mean Ã— 30): avgDailyOut = totalOut90d / 90; forecastNextMonth = avgDailyOut Ã— 30
//     â†’ Äá» xuáº¥t = max(0, forecast + min_stock - tá»“n)
//     â†’ ÄÆ¡n giáº£n nhÆ°ng chá»‰ pháº£n Ã¡nh trung bÃ¬nh, bá» qua thÃ¡ng tiÃªu hao Ä‘á»‰nh.
//
// V4 (worst-case theo 3 thÃ¡ng gáº§n nháº¥t + scale min_stock theo consumption):
//     â†’ Láº¥y MAX consumption trong 3 thÃ¡ng gáº§n nháº¥t (worst case planning)
//     â†’ min_stock_adjusted = max(max_monthly Ã— 0.3, 50)  -- scale theo má»©c tiÃªu thá»¥
//     â†’ suggestedQty = max(0, max_monthly + min_stock_adjusted - currentStock)
//
// VÃŒ SAO Äá»”I (dá»±a trÃªn dá»¯ liá»‡u tháº­t tá»« BV TrÆ°á»ng ÄHYD Cáº§n ThÆ¡ - Q2/2026):
//   - Khoa XÃ©t nghiá»‡m (XN-Sinh-HÃ³a): HÃ³a cháº¥t cÃ³ thÃ¡ng tiÃªu 220 test, thÃ¡ng chá»‰ 95.
//     meanÃ—30 = 158 test/thÃ¡ng, nhÆ°ng thÃ¡ng cao Ä‘iá»ƒm (cuá»‘i quÃ½, dá»‹ch) thá»±c táº¿ 220+.
//     â†’ V1 Ä‘á» xuáº¥t THIáº¾U 60-80 test/thÃ¡ng cao Ä‘iá»ƒm, BV pháº£i mua gáº¥p (Ä‘á»™i giÃ¡).
//   - Váº­t tÆ° y táº¿ (gÄƒng tay, kim tiÃªm): thÃ¡ng dá»‹ch bá»‡nh cÃ³ thá»ƒ Ã—2-3 thÃ¡ng thÆ°á»ng.
//   - meanÃ—30 lÃ m pháº³ng peak â†’ gÃ¢y stockout Ä‘Ãºng lÃºc cáº§n nháº¥t.
//
// V4 FIX:
//   - max_monthly thay vÃ¬ mean â†’ buffer cho worst case thá»±c táº¿.
//   - min_stock_adjusted = max(max_monthly Ã— 0.3, 50) â†’ safety stock scale theo
//     consumption (consumption cao â†’ safety stock cao), floor 50 Ä‘á»ƒ trÃ¡nh
//     quÃ¡ tháº¥p cho váº­t tÆ° tiÃªu hao Ã­t.
//
// BACKWARD COMPAT:
//   - ComputeAsync() giá»¯ nguyÃªn V1 cho tests cÅ© (ReplenishmentForecastingTests).
//   - ComputeAsyncV4() lÃ  algorithm má»›i, sáº½ Ä‘Æ°á»£c handler chuyá»ƒn sang dÃ¹ng.
// =============================================================================
internal record ForecastLineInternal(
    Guid ProductId,
    Guid WarehouseId,
    Guid UnitId,
    decimal CurrentStock,
    decimal MinStock,
    decimal? MaxStock,
    decimal AvgDailyOut,
    decimal ForecastNextMonth,
    decimal SuggestedReplenishQty,
    decimal EstimatedUnitPrice,
    decimal EstimatedTotal,
    Guid? BidContractId,
    string? BidContractNo,
    Guid? BidLotId,
    string? BidLotName,
    string Reason)
{
    public ForecastLineDto ToDto() => new(
        ProductId, ProductSku: "", ProductName: "", UnitId, UnitCode: "",
        CurrentStock, MinStock, MaxStock, AvgDailyOut, ForecastNextMonth,
        SuggestedReplenishQty, EstimatedUnitPrice, EstimatedTotal,
        BidContractId, BidContractNo, BidLotId, BidLotName, Reason);
}

internal static class ReplenishmentCalculator
{
    private const int LookbackDays = 90;
    private const int MinOutEvents = 3;
    private const int ForecastDays = 30;

    // V4 constants
    private const int V4LookbackDays = 90;            // 3 thÃ¡ng
    private const decimal V4SafetyStockFloor = 50m;   // floor cho min_stock_adjusted
    private const decimal V4SafetyStockRatio = 0.3m;  // 30% max_monthly

    /// <summary>
    /// Helper record Ä‘á»ƒ group consumption theo thÃ¡ng (chá»‰ dÃ¹ng cho V4).
    /// Khai bÃ¡o private bÃªn trong class Ä‘á»ƒ dÃ¹ng Ä‘Æ°á»£c lÃ m kiá»ƒu tráº£ vá» cá»§a method.
    /// </summary>
    private record MonthlyConsumption(
        Guid ProductId,
        DateTime Month,
        decimal TotalOut,
        int EventCount);

    /// <summary>
    /// V1 algorithm: mean Ã— 30 (giá»¯ láº¡i cho backward compat vá»›i tests cÅ©).
    /// </summary>
    public static async Task<List<ForecastLineInternal>> ComputeAsync(
        IInventoryDbContext db, Guid tenantId, DateTime asOfDate, CancellationToken ct)
    {
        var (lines, _) = await ComputeInternalAsync(db, tenantId, asOfDate, useV4: false, ct);
        return lines;
    }

    /// <summary>
    /// V4 algorithm: worst-case max consumption trong 3 thÃ¡ng + scale min_stock.
    /// </summary>
    public static async Task<List<ForecastLineInternal>> ComputeAsyncV4(
        IInventoryDbContext db, Guid tenantId, DateTime asOfDate, CancellationToken ct)
    {
        var (lines, _) = await ComputeInternalAsync(db, tenantId, asOfDate, useV4: true, ct);
        return lines;
    }

    /// <summary>
    /// Shared query pipeline; chá»‰ khÃ¡c pháº§n tÃ­nh forecast + suggested qty.
    /// useV4=true â†’ max consumption thÃ¡ng + scaled min_stock.
    /// useV4=false â†’ mean Ã— 30 (V1).
    /// </summary>
    private static async Task<(List<ForecastLineInternal> lines, List<MonthlyConsumption> monthlyData)>
        ComputeInternalAsync(
            IInventoryDbContext db, Guid tenantId, DateTime asOfDate, bool useV4, CancellationToken ct)
    {
        // 1. Láº¥y táº¥t cáº£ kho RECEIVING ACTIVE trong tenant
        var receivingWarehouses = await db.Warehouses.AsNoTracking()
            .Where(w => w.TenantId == tenantId && w.Type == WarehouseType.Receiving && w.Status == WarehouseStatus.Active)
            .ToListAsync(ct);
        if (receivingWarehouses.Count == 0) return (new List<ForecastLineInternal>(), new List<MonthlyConsumption>());
        var warehouseIds = receivingWarehouses.Select(w => w.Id).ToList();

        // 2. Tá»“n kho hiá»‡n táº¡i (gá»™p cÃ¡c location trong cÃ¹ng warehouse, láº¥y available)
        var stockByProductWarehouse = await db.Stock.AsNoTracking()
            .Where(s => s.TenantId == tenantId && warehouseIds.Contains(s.WarehouseId))
            .GroupBy(s => new { s.ProductId, s.WarehouseId })
            .Select(g => new
            {
                g.Key.ProductId,
                g.Key.WarehouseId,
                Available = g.Sum(x => x.Quantity - x.ReservedQty)
            })
            .ToListAsync(ct);

        // 3. TÃ­nh consumption 90 ngÃ y gáº§n nháº¥t (OUT/TransferOut/Issue) - group by product
        var fromDate = asOfDate.AddDays(-LookbackDays);
        var outboundByProduct = await db.StockMovements.AsNoTracking()
            .Where(m => m.TenantId == tenantId
                && warehouseIds.Contains(m.WarehouseId)
                && (m.MovementType == StockMovementType.OUT
                    || m.MovementType == StockMovementType.TRANSFER_OUT
                    || m.MovementType == StockMovementType.ADJUST_OUT
                    || m.MovementType == StockMovementType.RETURN_OUT)
                && m.PostedAt >= fromDate
                && m.PostedAt < asOfDate)
            .GroupBy(m => m.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                TotalOut = g.Sum(x => x.Quantity),
                OutCount = g.Count()
            })
            .ToListAsync(ct);

        // 3b. V4: láº¥y chi tiáº¿t theo tá»«ng thÃ¡ng (3 thÃ¡ng gáº§n nháº¥t) - chá»‰ load khi cáº§n
        //      Group theo (product, yyyy-MM) Ä‘á»ƒ tÃ¬m MAX thÃ¡ng.
        List<MonthlyConsumption> monthlyConsumption = new();
        if (useV4)
        {
            var fromMonthStart = new DateTime(asOfDate.Year, asOfDate.Month, 1).AddMonths(-2);
            // Load raw movements trong 3 thÃ¡ng gáº§n nháº¥t
            var recentMovements = await db.StockMovements.AsNoTracking()
                .Where(m => m.TenantId == tenantId
                    && warehouseIds.Contains(m.WarehouseId)
                    && (m.MovementType == StockMovementType.OUT
                        || m.MovementType == StockMovementType.TRANSFER_OUT
                        || m.MovementType == StockMovementType.ADJUST_OUT
                        || m.MovementType == StockMovementType.RETURN_OUT)
                    && m.PostedAt >= fromMonthStart
                    && m.PostedAt < asOfDate)
                .Select(m => new { m.ProductId, m.Quantity, m.PostedAt })
                .ToListAsync(ct);

            monthlyConsumption = recentMovements
                .GroupBy(m => new { m.ProductId, Month = new DateTime(m.PostedAt.Year, m.PostedAt.Month, 1) })
                .Select(g => new MonthlyConsumption(
                    ProductId: g.Key.ProductId,
                    Month: g.Key.Month,
                    TotalOut: g.Sum(x => x.Quantity),
                    EventCount: g.Count()))
                .ToList();
        }

        // 4. Láº¥y danh sÃ¡ch product ACTIVE (kÃ¨m MinStock/MaxStock/CostPrice/BaseUnitId/CategoryId)
        var products = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active)
            .Select(p => new
            {
                p.Id,
                p.Sku,
                p.Name,
                p.BaseUnitId,
                p.MinStock,
                p.MaxStock,
                p.CostPrice,
                p.CategoryId
            })
            .ToListAsync(ct);

        // 5. Pre-load BidContract ACTIVE trong tenant (status=ACTIVE + asOfDate trong khoáº£ng start..end)
        var activeContracts = await db.BidContracts.AsNoTracking()
            .Include(c => c.BidLot)
            .Where(c => c.TenantId == tenantId
                && c.BidContractStatus == BidContractStatus.Active
                && c.ContractStartDate <= asOfDate
                && c.ContractEndDate >= asOfDate)
            .ToListAsync(ct);
        var contractIds = activeContracts.Select(c => c.Id).ToList();
        var supplierProducts = await db.SupplierProducts.AsNoTracking()
            .Where(sp => sp.TenantId == tenantId && contractIds.Contains(sp.PartyId))
            .ToListAsync(ct);
        var productsBySupplier = supplierProducts
            .GroupBy(sp => sp.ProductId)
            .ToDictionary(g => g.Key, g => g.Select(sp => sp.PartyId).ToHashSet());

        // V4 helpers: pre-compute max_monthly per product
        var maxMonthlyByProduct = useV4
            ? monthlyConsumption
                .GroupBy(x => x.ProductId)
                .ToDictionary(g => g.Key, g => g.Max(x => x.TotalOut))
            : new Dictionary<Guid, decimal>();

        var result = new List<ForecastLineInternal>();
        // 6. Vá»›i má»—i product ACTIVE, vá»›i má»—i warehouse nháº­n â†’ tÃ­nh dÃ²ng Ä‘á» xuáº¥t
        foreach (var product in products)
        {
            // Láº¥y tá»•ng tá»“n cá»§a product nÃ y trong táº¥t cáº£ warehouse RECEIVING
            var currentStock = stockByProductWarehouse
                .Where(s => s.ProductId == product.Id)
                .Sum(s => s.Available);

            // Skip náº¿u product khÃ´ng cÃ³ trong kho cháºµn
            var inAnyReceiving = stockByProductWarehouse.Any(s => s.ProductId == product.Id);
            if (!inAnyReceiving) continue;

            var outStat = outboundByProduct.FirstOrDefault(o => o.ProductId == product.Id);
            var totalOut90d = outStat?.TotalOut ?? 0m;
            var outCount = outStat?.OutCount ?? 0;

            decimal avgDailyOut, forecastNextMonth, effectiveMinStock;
            string reason;

            if (outCount >= MinOutEvents)
            {
                if (useV4)
                {
                    // === V4: worst-case + scaled safety stock ===
                    var maxMonthly = maxMonthlyByProduct.TryGetValue(product.Id, out var v) ? v : totalOut90d;
                    forecastNextMonth = Math.Round(maxMonthly, 2);
                    // Scale min_stock theo consumption: high consumption â†’ higher buffer
                    var scaledMin = Math.Round(maxMonthly * V4SafetyStockRatio, 2);
                    effectiveMinStock = Math.Max(scaledMin, V4SafetyStockFloor);
                    avgDailyOut = Math.Round(maxMonthly / ForecastDays, 4);
                    reason = $"V4: max thÃ¡ng {maxMonthly:N0} (3 thÃ¡ng), safety {effectiveMinStock:N0}";
                }
                else
                {
                    // === V1: mean Ã— 30 ===
                    avgDailyOut = Math.Round(totalOut90d / LookbackDays, 4);
                    forecastNextMonth = Math.Round(avgDailyOut * ForecastDays, 2);
                    effectiveMinStock = product.MinStock;
                    reason = $"Trend 3 thÃ¡ng: {totalOut90d:N0} / {LookbackDays} ngÃ y";
                }
            }
            else
            {
                avgDailyOut = 0;
                forecastNextMonth = 0;
                effectiveMinStock = product.MinStock;
                reason = $"KhÃ´ng Ä‘á»§ lá»‹ch sá»­ ({outCount} láº§n OUT, cáº§n >= {MinOutEvents})";
            }

            decimal suggestedQty = 0m;
            if (forecastNextMonth > 0)
            {
                // V4 dÃ¹ng effectiveMinStock (Ä‘Ã£ scale); V1 dÃ¹ng product.MinStock
                suggestedQty = Math.Max(0m, forecastNextMonth + effectiveMinStock - currentStock);
            }
            else if (product.MaxStock.HasValue)
            {
                // Fallback giá»¯ nguyÃªn cho cáº£ V1 vÃ  V4 khi khÃ´ng Ä‘á»§ lá»‹ch sá»­
                suggestedQty = Math.Max(0m, product.MaxStock.Value - currentStock);
            }

            if (suggestedQty <= 0) continue;

            // Match BidContract
            BidContract? matchedContract = null;
            if (productsBySupplier.TryGetValue(product.Id, out var supplierParties))
            {
                matchedContract = activeContracts
                    .Where(c => supplierParties.Contains(c.WinningPartyId))
                    .OrderByDescending(c => c.ContractValue - c.UsedValue)
                    .FirstOrDefault();
            }
            // Fallback: match theo category - chÆ°a cÃ³ cÆ¡ cháº¿ category trong BidContract nÃªn bá» qua

            // Sá»­ dá»¥ng warehouse Ä‘áº§u tiÃªn cÃ³ chá»©a product (Ä‘Æ¡n giáº£n hÃ³a cho Phase 1)
            var warehouseId = stockByProductWarehouse.First(s => s.ProductId == product.Id).WarehouseId;

            result.Add(new ForecastLineInternal(
                ProductId: product.Id,
                WarehouseId: warehouseId,
                UnitId: product.BaseUnitId,
                CurrentStock: currentStock,
                MinStock: product.MinStock,                // giá»¯ giÃ¡ trá»‹ gá»‘c tá»« master
                MaxStock: product.MaxStock,
                AvgDailyOut: avgDailyOut,
                ForecastNextMonth: forecastNextMonth,
                SuggestedReplenishQty: Math.Ceiling(suggestedQty),  // round up
                EstimatedUnitPrice: product.CostPrice,
                EstimatedTotal: Math.Ceiling(suggestedQty) * product.CostPrice,
                BidContractId: matchedContract?.Id,
                BidContractNo: matchedContract?.ContractNo,
                BidLotId: matchedContract?.BidLotId,
                BidLotName: matchedContract?.BidLot?.LotName,
                Reason: reason));
        }
        return (result, monthlyConsumption);
    }
}
