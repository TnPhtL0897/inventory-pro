using Cronos;
using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Replenishment;
using InventoryPro.Domain.Replenishment;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Application.Common.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.API.BackgroundServices;

/// <summary>
/// BackgroundService cháº¡y dá»± trÃ¹ cuá»‘i thÃ¡ng tá»± Ä‘á»™ng theo cron config.
/// - Config trong appsettings: Replenishment:Enabled (bool), Replenishment:Cron (string, default "0 2 25 * *")
/// - Vá»›i má»—i tick: loop qua táº¥t cáº£ active tenants, vá»›i má»—i tenant táº¡o 1 scope â†’ resolve scoped services â†’ cháº¡y ReplenishmentCommand
/// - Idempotency: handler tá»± throw náº¿u thÃ¡ng Ä‘Ã³ Ä‘Ã£ cháº¡y (DB UNIQUE constraint + handler check)
/// - Lá»—i 1 tenant khÃ´ng áº£nh hÆ°á»Ÿng tenants khÃ¡c
/// </summary>
public class ReplenishmentBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<ReplenishmentBackgroundService> _logger;

    public ReplenishmentBackgroundService(
        IServiceScopeFactory scopeFactory,
        IConfiguration config,
        ILogger<ReplenishmentBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _config.GetValue<bool>("Replenishment:Enabled", false);
        if (!enabled)
        {
            _logger.LogInformation("ReplenishmentBackgroundService disabled (set Replenishment:Enabled=true to enable).");
            return;
        }

        var cronExpr = _config["Replenishment:Cron"] ?? "0 2 25 * *";
        CronExpression cron;
        try
        {
            // Cronos máº·c Ä‘á»‹nh format 5-field (phÃºt giá» ngÃ y thÃ¡ng thá»©). Náº¿u user muá»‘n 6-field cÃ³ thá»ƒ dÃ¹ng CronFormat.IncludeSeconds.
            cron = CronExpression.Parse(cronExpr);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Invalid Replenishment:Cron expression: {Cron}. Service stopped.", cronExpr);
            return;
        }

        _logger.LogInformation("ReplenishmentBackgroundService started. Cron: {Cron}, Timezone: UTC", cronExpr);

        while (!stoppingToken.IsCancellationRequested)
        {
            var nextRun = cron.GetNextOccurrence(DateTime.UtcNow);
            if (!nextRun.HasValue) break;
            var delay = nextRun.Value - DateTime.UtcNow;
            if (delay > TimeSpan.Zero)
            {
                _logger.LogInformation("Next replenishment run at {NextRun:o} (in {Delay}).", nextRun.Value, delay);
                try
                {
                    await Task.Delay(delay, stoppingToken);
                }
                catch (TaskCanceledException) { break; }
            }

            if (stoppingToken.IsCancellationRequested) break;
            await RunOnceForAllTenantsAsync(stoppingToken);
        }
    }

    private async Task RunOnceForAllTenantsAsync(CancellationToken ct)
    {
        // Láº¥y danh sÃ¡ch tenant active (sá»­ dá»¥ng scope riÃªng, khÃ´ng cáº§n TenantContext)
        List<Guid> tenantIds;
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IInventoryDbContext>();
            tenantIds = await db.Branches.AsNoTracking()
                .Select(b => b.TenantId)
                .Distinct()
                .ToListAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list tenants for replenishment run.");
            return;
        }

        var fiscalMonth = DateTime.UtcNow.Month;
        var fiscalYear = DateTime.UtcNow.Year;
        var asOfDate = new DateTime(fiscalYear, fiscalMonth, 1).AddDays(-1);

        _logger.LogInformation("Replenishment: starting run for month {Month}/{Year} across {TenantCount} tenants.",
            fiscalMonth, fiscalYear, tenantIds.Count);

        foreach (var tenantId in tenantIds)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                using var tenantScope = _scopeFactory.CreateScope();
                var db = tenantScope.ServiceProvider.GetRequiredService<IInventoryDbContext>();
                var mediator = tenantScope.ServiceProvider.GetRequiredService<IMediator>();
                var tenantContext = tenantScope.ServiceProvider.GetRequiredService<TenantContext>();
                tenantContext.TenantId = tenantId;
                tenantContext.UserId = null;  // system

                var req = new RunReplenishmentRequest(
                    FiscalYear: fiscalYear,
                    FiscalMonth: fiscalMonth,
                    AsOfDate: asOfDate,
                    SaveAsPurchaseRequest: true,
                    Notes: $"[SCHEDULED] Dá»± trÃ¹ cuá»‘i thÃ¡ng tá»± Ä‘á»™ng {fiscalMonth}/{fiscalYear}");
                var result = await mediator.Send(new RunReplenishmentCommand(req, ReplenishmentRunType.Scheduled), ct);
                _logger.LogInformation("Replenishment: tenant {Tenant} completed. Lines={Lines}, TotalValue={Total}, PRs={PrCount}",
                    tenantId, result.ProductCount, result.TotalEstimatedValue, result.CreatedPurchaseRequestIds.Count);
            }
            catch (Exception ex) when (ex.Message.Contains("ÄÃ£ cháº¡y dá»± trÃ¹") || ex.Message.Contains("race condition"))
            {
                _logger.LogInformation("Replenishment: tenant {Tenant} skipped - {Reason}", tenantId, ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Replenishment: tenant {Tenant} failed.", tenantId);
            }
        }
    }
}
