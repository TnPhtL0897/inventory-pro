using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Replenishment;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Replenishment;

using InventoryPro.API.Middleware;

// =============================================================================
// REPLENISHMENT HANDLERS (Dự trù cuối tháng cho kho chẵn)
// =============================================================================

public record PreviewReplenishmentQuery(RunReplenishmentRequest Request) : IRequest<ForecastPreviewDto>;
public record RunReplenishmentCommand(RunReplenishmentRequest Request, ReplenishmentRunType RunType) : IRequest<MonthEndForecastRunDto>;
public record ListReplenishmentRunsQuery(int? Year, int Page = 1, int PageSize = 20) : IRequest<PaginatedResult<MonthEndForecastRunDto>>;

public class ReplenishmentQueryHandler :
    IRequestHandler<PreviewReplenishmentQuery, ForecastPreviewDto>,
    IRequestHandler<ListReplenishmentRunsQuery, PaginatedResult<MonthEndForecastRunDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ReplenishmentQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

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
            throw new ValidationException("Năm không hợp lệ (2000-2100)");
        if (req.FiscalMonth < 1 || req.FiscalMonth > 12)
            throw new ValidationException("Tháng không hợp lệ (1-12)");
    }
}

public class ReplenishmentCommandHandler : IRequestHandler<RunReplenishmentCommand, MonthEndForecastRunDto>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public ReplenishmentCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<MonthEndForecastRunDto> Handle(RunReplenishmentCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var req = request.Request;
        if (req.FiscalYear < 2000 || req.FiscalYear > 2100)
            throw new ValidationException("Năm không hợp lệ (2000-2100)");
        if (req.FiscalMonth < 1 || req.FiscalMonth > 12)
            throw new ValidationException("Tháng không hợp lệ (1-12)");

        var tenantId = _tenant.TenantId!.Value;
        var asOfDate = (req.AsOfDate ?? new DateTime(req.FiscalYear, req.FiscalMonth, 1).AddDays(-1)).Date;

        // Idempotency check (DB cũng có UNIQUE, check trước để có message rõ ràng)
        var existing = await _db.MonthEndForecastRuns.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.FiscalYear == req.FiscalYear && x.FiscalMonth == req.FiscalMonth, ct);
        if (existing != null)
            throw new BusinessRuleException($"Đã chạy dự trù cho tháng {req.FiscalMonth}/{req.FiscalYear} rồi (Run #{existing.Id}). Xem lịch sử ở trang Dự trù cuối tháng.");

        try
        {
            // 1. Tính forecast
            var lines = await ReplenishmentCalculator.ComputeAsync(_db, tenantId, asOfDate, ct);
            var totalValue = lines.Sum(l => l.EstimatedTotal);
            var productCount = lines.Count;
            var warehouseCount = lines.Select(l => l.WarehouseId).Distinct().Count();

            // 2. Tạo PurchaseRequest nếu yêu cầu
            var createdPrIds = new List<Guid>();
            if (req.SaveAsPurchaseRequest && lines.Count > 0)
            {
                var pr = new PurchaseRequest
                {
                    TenantId = tenantId,
                    BranchId = (await _db.Branches.AsNoTracking().Where(b => b.TenantId == tenantId).Select(b => b.Id).FirstOrDefaultAsync(ct)),
                    PrNumber = GeneratePrNumber(req.FiscalYear, req.FiscalMonth),
                    RequestDept = "[AUTO] Dự trù cuối tháng",
                    FiscalYear = req.FiscalYear,
                    Status = PurchaseRequestStatus.Draft,
                    RequestedDate = asOfDate,
                    Notes = req.Notes ?? $"Dự trù cuối tháng {req.FiscalMonth}/{req.FiscalYear} - {lines.Count} sản phẩm",
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

            // 3. Lưu run history
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
            throw new BusinessRuleException($"Đã chạy dự trù cho tháng {req.FiscalMonth}/{req.FiscalYear} rồi (race condition).");
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
// LỊCH SỬ THAY ĐỔI ALGORITHM
// -----------------------------------------------------------------------------
// V1 (mean × 30): avgDailyOut = totalOut90d / 90; forecastNextMonth = avgDailyOut × 30
//     → Đề xuất = max(0, forecast + min_stock - tồn)
//     → Đơn giản nhưng chỉ phản ánh trung bình, bỏ qua tháng tiêu hao đỉnh.
//
// V4 (worst-case theo 3 tháng gần nhất + scale min_stock theo consumption):
//     → Lấy MAX consumption trong 3 tháng gần nhất (worst case planning)
//     → min_stock_adjusted = max(max_monthly × 0.3, 50)  -- scale theo mức tiêu thụ
//     → suggestedQty = max(0, max_monthly + min_stock_adjusted - currentStock)
//
// VÌ SAO ĐỔI (dựa trên dữ liệu thật từ BV Trường ĐHYD Cần Thơ - Q2/2026):
//   - Khoa Xét nghiệm (XN-Sinh-Hóa): Hóa chất có tháng tiêu 220 test, tháng chỉ 95.
//     mean×30 = 158 test/tháng, nhưng tháng cao điểm (cuối quý, dịch) thực tế 220+.
//     → V1 đề xuất THIẾU 60-80 test/tháng cao điểm, BV phải mua gấp (đội giá).
//   - Vật tư y tế (găng tay, kim tiêm): tháng dịch bệnh có thể ×2-3 tháng thường.
//   - mean×30 làm phẳng peak → gây stockout đúng lúc cần nhất.
//
// V4 FIX:
//   - max_monthly thay vì mean → buffer cho worst case thực tế.
//   - min_stock_adjusted = max(max_monthly × 0.3, 50) → safety stock scale theo
//     consumption (consumption cao → safety stock cao), floor 50 để tránh
//     quá thấp cho vật tư tiêu hao ít.
//
// BACKWARD COMPAT:
//   - ComputeAsync() giữ nguyên V1 cho tests cũ (ReplenishmentForecastingTests).
//   - ComputeAsyncV4() là algorithm mới, sẽ được handler chuyển sang dùng.
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
    private const int V4LookbackDays = 90;            // 3 tháng
    private const decimal V4SafetyStockFloor = 50m;   // floor cho min_stock_adjusted
    private const decimal V4SafetyStockRatio = 0.3m;  // 30% max_monthly

    /// <summary>
    /// Helper record để group consumption theo tháng (chỉ dùng cho V4).
    /// Khai báo private bên trong class để dùng được làm kiểu trả về của method.
    /// </summary>
    private record MonthlyConsumption(
        Guid ProductId,
        DateTime Month,
        decimal TotalOut,
        int EventCount);

    /// <summary>
    /// V1 algorithm: mean × 30 (giữ lại cho backward compat với tests cũ).
    /// </summary>
    public static async Task<List<ForecastLineInternal>> ComputeAsync(
        InventoryDbContext db, Guid tenantId, DateTime asOfDate, CancellationToken ct)
    {
        var (lines, _) = await ComputeInternalAsync(db, tenantId, asOfDate, useV4: false, ct);
        return lines;
    }

    /// <summary>
    /// V4 algorithm: worst-case max consumption trong 3 tháng + scale min_stock.
    /// </summary>
    public static async Task<List<ForecastLineInternal>> ComputeAsyncV4(
        InventoryDbContext db, Guid tenantId, DateTime asOfDate, CancellationToken ct)
    {
        var (lines, _) = await ComputeInternalAsync(db, tenantId, asOfDate, useV4: true, ct);
        return lines;
    }

    /// <summary>
    /// Shared query pipeline; chỉ khác phần tính forecast + suggested qty.
    /// useV4=true → max consumption tháng + scaled min_stock.
    /// useV4=false → mean × 30 (V1).
    /// </summary>
    private static async Task<(List<ForecastLineInternal> lines, List<MonthlyConsumption> monthlyData)>
        ComputeInternalAsync(
            InventoryDbContext db, Guid tenantId, DateTime asOfDate, bool useV4, CancellationToken ct)
    {
        // 1. Lấy tất cả kho RECEIVING ACTIVE trong tenant
        var receivingWarehouses = await db.Warehouses.AsNoTracking()
            .Where(w => w.TenantId == tenantId && w.Type == WarehouseType.Receiving && w.Status == WarehouseStatus.Active)
            .ToListAsync(ct);
        if (receivingWarehouses.Count == 0) return (new List<ForecastLineInternal>(), new List<MonthlyConsumption>());
        var warehouseIds = receivingWarehouses.Select(w => w.Id).ToList();

        // 2. Tồn kho hiện tại (gộp các location trong cùng warehouse, lấy available)
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

        // 3. Tính consumption 90 ngày gần nhất (OUT/TransferOut/Issue) - group by product
        var fromDate = asOfDate.AddDays(-LookbackDays);
        var outboundByProduct = await db.StockMovements.AsNoTracking()
            .Where(m => m.TenantId == tenantId
                && warehouseIds.Contains(m.WarehouseId)
                && (m.MovementType == StockMovementType.Out
                    || m.MovementType == StockMovementType.TransferOut
                    || m.MovementType == StockMovementType.Issue)
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

        // 3b. V4: lấy chi tiết theo từng tháng (3 tháng gần nhất) - chỉ load khi cần
        //      Group theo (product, yyyy-MM) để tìm MAX tháng.
        List<MonthlyConsumption> monthlyConsumption = new();
        if (useV4)
        {
            var fromMonthStart = new DateTime(asOfDate.Year, asOfDate.Month, 1).AddMonths(-2);
            // Load raw movements trong 3 tháng gần nhất
            var recentMovements = await db.StockMovements.AsNoTracking()
                .Where(m => m.TenantId == tenantId
                    && warehouseIds.Contains(m.WarehouseId)
                    && (m.MovementType == StockMovementType.Out
                        || m.MovementType == StockMovementType.TransferOut
                        || m.MovementType == StockMovementType.Issue)
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

        // 4. Lấy danh sách product ACTIVE (kèm MinStock/MaxStock/CostPrice/BaseUnitId/CategoryId)
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

        // 5. Pre-load BidContract ACTIVE trong tenant (status=ACTIVE + asOfDate trong khoảng start..end)
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
        // 6. Với mỗi product ACTIVE, với mỗi warehouse nhận → tính dòng đề xuất
        foreach (var product in products)
        {
            // Lấy tổng tồn của product này trong tất cả warehouse RECEIVING
            var currentStock = stockByProductWarehouse
                .Where(s => s.ProductId == product.Id)
                .Sum(s => s.Available);

            // Skip nếu product không có trong kho chẵn
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
                    // Scale min_stock theo consumption: high consumption → higher buffer
                    var scaledMin = Math.Round(maxMonthly * V4SafetyStockRatio, 2);
                    effectiveMinStock = Math.Max(scaledMin, V4SafetyStockFloor);
                    avgDailyOut = Math.Round(maxMonthly / ForecastDays, 4);
                    reason = $"V4: max tháng {maxMonthly:N0} (3 tháng), safety {effectiveMinStock:N0}";
                }
                else
                {
                    // === V1: mean × 30 ===
                    avgDailyOut = Math.Round(totalOut90d / LookbackDays, 4);
                    forecastNextMonth = Math.Round(avgDailyOut * ForecastDays, 2);
                    effectiveMinStock = product.MinStock;
                    reason = $"Trend 3 tháng: {totalOut90d:N0} / {LookbackDays} ngày";
                }
            }
            else
            {
                avgDailyOut = 0;
                forecastNextMonth = 0;
                effectiveMinStock = product.MinStock;
                reason = $"Không đủ lịch sử ({outCount} lần OUT, cần >= {MinOutEvents})";
            }

            decimal suggestedQty = 0m;
            if (forecastNextMonth > 0)
            {
                // V4 dùng effectiveMinStock (đã scale); V1 dùng product.MinStock
                suggestedQty = Math.Max(0m, forecastNextMonth + effectiveMinStock - currentStock);
            }
            else if (product.MaxStock.HasValue)
            {
                // Fallback giữ nguyên cho cả V1 và V4 khi không đủ lịch sử
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
            // Fallback: match theo category - chưa có cơ chế category trong BidContract nên bỏ qua

            // Sử dụng warehouse đầu tiên có chứa product (đơn giản hóa cho Phase 1)
            var warehouseId = stockByProductWarehouse.First(s => s.ProductId == product.Id).WarehouseId;

            result.Add(new ForecastLineInternal(
                ProductId: product.Id,
                WarehouseId: warehouseId,
                UnitId: product.BaseUnitId,
                CurrentStock: currentStock,
                MinStock: product.MinStock,                // giữ giá trị gốc từ master
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

    /// <summary>
    /// Helper record để group consumption theo tháng (chỉ dùng cho V4).
    /// </summary>
    private record MonthlyConsumption(
        Guid ProductId,
        DateTime Month,
        decimal TotalOut,
        int EventCount);
}
