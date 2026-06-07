using FluentAssertions;
using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Replenishment;
using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Replenishment;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Infrastructure.Persistence;
using InventoryPro.UnitTests.TestFixtures;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InventoryPro.UnitTests;

/// <summary>
/// Test algorithm dự trù cuối tháng cho kho chẵn (RECEIVING).
/// Verify:
///   - Công thức 3: forecast trend 3 tháng (>=3 lần OUT → dùng trend; <3 → fallback max_stock)
///   - Đề xuất = max(0, forecast + min_stock - tồn)
///   - Tồn đủ → không đề xuất
///   - Match HĐ thầu ACTIVE theo SupplierProduct
///   - SaveAsPurchaseRequest = true → tạo 1 PR DRAFT
///   - Idempotency: chạy 2 lần cùng tháng → fail lần 2
/// </summary>
public class ReplenishmentForecastingTests
{
    private static (Guid tenantId, Guid userId, Guid branchId, Guid productId, Guid unitId, Guid whId) SeedBaseIds()
        => (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

    private static InventoryDbContext BuildReceivingWarehouse(
        Guid tenantId, Guid branchId, Guid whId, Guid unitId)
    {
        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseInMemoryDatabase(databaseName: $"test-{Guid.NewGuid()}").Options;
        var db = new InventoryDbContext(options);
        db.Branches.Add(new Branch { Id = branchId, TenantId = tenantId, Code = "MAIN", Name = "Main", IsDefault = true });
        db.Warehouses.Add(new Warehouse
        {
            Id = whId, TenantId = tenantId, BranchId = branchId,
            Code = "WH-RCV-01", Name = "Kho chẵn",
            Type = WarehouseType.Receiving, Status = WarehouseStatus.Active,
        });
        db.UnitsOfMeasure.Add(new UnitOfMeasure { Id = unitId, TenantId = tenantId, Code = "PCS", Name = "Cái" });
        return db;
    }

    private static Product MakeProduct(Guid tenantId, Guid unitId, decimal minStock = 100, decimal? maxStock = 1000, decimal cost = 1000)
        => new()
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Sku = "SP-001", Name = "Bút bi",
            BaseUnitId = unitId, CostPrice = cost, SellPrice = 1500,
            MinStock = minStock, MaxStock = maxStock, Status = ProductStatus.Active,
        };

    private static Stock MakeStock(Guid tenantId, Guid branchId, Guid whId, Guid productId, decimal qty)
        => new()
        {
            TenantId = tenantId, BranchId = branchId, WarehouseId = whId,
            LocationId = Guid.NewGuid(), ProductId = productId,
            Quantity = qty, ReservedQty = 0, AvgCost = 1000,
        };

    private static StockMovement MakeOut(Guid tenantId, Guid branchId, Guid whId, Guid productId, Guid unitId, decimal qty, DateTime postedAt)
        => new()
        {
            TenantId = tenantId, BranchId = branchId, WarehouseId = whId,
            LocationId = Guid.NewGuid(), ProductId = productId, UnitId = unitId,
            MovementType = StockMovementType.Out, Status = StockMovementStatus.Posted,
            Quantity = qty, IdempotencyKey = Guid.NewGuid(), PostedAt = postedAt,
        };

    [Fact]
    public async Task Preview_NoHistory_FallsBackToMaxStock()
    {
        // ARRANGE: product max=1000, tồn=200, không có OUT nào
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 1000, cost: 500);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 200));
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var query = new PreviewReplenishmentQuery(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: new DateTime(2026, 6, 30),
            SaveAsPurchaseRequest: false, Notes: null));

        // ACT
        var handler = new ReplenishmentQueryHandler(db, tenant);
        var result = await handler.Handle(query, default);

        // ASSERT: đề xuất = max_stock - tồn = 1000 - 200 = 800
        result.Lines.Should().HaveCount(1);
        var line = result.Lines[0];
        line.SuggestedReplenishQty.Should().Be(800);
        line.Reason.Should().Contain("Không đủ lịch sử");
    }

    [Fact]
    public async Task Preview_HasHistory_UsesTrend()
    {
        // ARRANGE: 90 ngày có 5 lần OUT, mỗi lần 10 = total 50 → avgDailyOut=50/90=0.5556 → forecast=0.5556*30=16.67
        // tồn=200, min=100 → đề xuất = max(0, 16.67 + 100 - 200) = 0 (vì tồn > forecast + min)
        // tăng tổng OUT lên 5000 để forecast cao hơn tồn
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 5000, cost: 1000);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 200));

        var asOf = new DateTime(2026, 6, 30);
        // 5 lần OUT mỗi lần 1000 = 5000 trong 90 ngày
        for (int i = 0; i < 5; i++)
        {
            db.StockMovements.Add(MakeOut(tenantId, branchId, whId, productId, unitId, 1000, asOf.AddDays(-10 * (i + 1))));
        }
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var query = new PreviewReplenishmentQuery(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: asOf, SaveAsPurchaseRequest: false, Notes: null));

        // ACT
        var result = await new ReplenishmentQueryHandler(db, tenant).Handle(query, default);

        // ASSERT
        result.Lines.Should().HaveCount(1);
        var line = result.Lines[0];
        // avgDailyOut = 5000/90 = 55.56, forecast = 55.56*30 = 1666.67
        // suggestedQty = max(0, 1666.67 + 100 - 200) = 1566.67 → ceiling = 1567
        line.AvgDailyOut.Should().BeGreaterThan(50);
        line.ForecastNextMonth.Should().BeGreaterThan(1500);
        line.SuggestedReplenishQty.Should().Be(1567);
        line.Reason.Should().Contain("Trend 3 tháng");
    }

    [Fact]
    public async Task Preview_SufficientStock_NoSuggestion()
    {
        // ARRANGE: tồn rất cao (10000), max=1000 → tồn > max → không đề xuất (không tạo line)
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 1000, cost: 500);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 10000));
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var query = new PreviewReplenishmentQuery(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: new DateTime(2026, 6, 30),
            SaveAsPurchaseRequest: false, Notes: null));

        // ACT
        var result = await new ReplenishmentQueryHandler(db, tenant).Handle(query, default);

        // ASSERT: tồn >= max → suggested = max(0, ...) = 0 → không có line
        result.Lines.Should().BeEmpty();
    }

    [Fact]
    public async Task Run_CreatesPurchaseRequest_Draft()
    {
        // ARRANGE
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 1000, cost: 500);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 200));
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var cmd = new RunReplenishmentCommand(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: new DateTime(2026, 6, 30),
            SaveAsPurchaseRequest: true, Notes: "Test"), ReplenishmentRunType.Manual);

        // ACT
        var result = await new ReplenishmentCommandHandler(db, tenant).Handle(cmd, default);

        // ASSERT
        result.Status.Should().Be(nameof(ReplenishmentRunStatus.Completed).ToUpperInvariant());
        result.ProductCount.Should().Be(1);
        result.CreatedPurchaseRequestIds.Should().HaveCount(1);

        // Verify PR đã tạo
        var pr = await db.PurchaseRequests.Include(p => p.Lines).FirstAsync();
        pr.Status.ToString().Should().Be(nameof(PurchaseRequestStatus.Draft).ToUpperInvariant());
        pr.Lines.Should().HaveCount(1);
        pr.Lines.First().ProductId.Should().Be(product.Id);

        // Verify run history
        var run = await db.MonthEndForecastRuns.FirstAsync();
        run.TenantId.Should().Be(tenantId);
        run.FiscalYear.Should().Be(2026);
        run.FiscalMonth.Should().Be(7);
    }

    [Fact]
    public async Task Run_UniquePerMonthPerTenant_TwiceFails()
    {
        // ARRANGE: setup + chạy 1 lần
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 1000, cost: 500);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 200));
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var req = new RunReplenishmentRequest(2026, 7, new DateTime(2026, 6, 30), true, null);

        // ACT 1: lần đầu thành công
        var handler = new ReplenishmentCommandHandler(db, tenant);
        await handler.Handle(new RunReplenishmentCommand(req, ReplenishmentRunType.Manual), default);

        // ACT 2: lần 2 cùng tháng → fail
        // (InMemory DB không enforce UNIQUE, nhưng handler check trước → vẫn throw)
        var act = async () => await handler.Handle(new RunReplenishmentCommand(req, ReplenishmentRunType.Manual), default);

        // ASSERT
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*Đã chạy dự trù*");
    }

    [Fact]
    public async Task Preview_MatchesActiveBidContract()
    {
        // ARRANGE: product + BidContract ACTIVE với party là supplier của product
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var partyId = Guid.NewGuid();
        var contractId = Guid.NewGuid();
        var lotId = Guid.NewGuid();

        var db = BuildReceivingWarehouse(tenantId, branchId, whId, unitId);
        var product = MakeProduct(tenantId, unitId, minStock: 100, maxStock: 1000, cost: 500);
        db.Products.Add(product);
        db.Stock.Add(MakeStock(tenantId, branchId, whId, productId, 200));

        // Party (NCC) + SupplierProduct mapping party→product
        db.Parties.Add(new Party
        {
            Id = partyId, TenantId = tenantId, Code = "NCC-001", Name = "NCC Test",
            PartyType = PartyType.Supplier, Status = PartyStatus.Active,
        });
        db.SupplierProducts.Add(new SupplierProduct
        {
            TenantId = tenantId, PartyId = partyId, ProductId = productId,
            CostPrice = 500, IsPreferred = true,
        });
        // BidContract ACTIVE trong hạn
        var asOf = new DateTime(2026, 6, 30);
        db.BidContracts.Add(new BidContract
        {
            Id = contractId, TenantId = tenantId, BidLotId = lotId,
            ContractNo = "HĐ-2026-0001", WinningPartyId = partyId,
            ContractValue = 100_000_000m, ContractStartDate = asOf.AddDays(-30),
            ContractEndDate = asOf.AddDays(335), UsedValue = 0,
            BidContractStatus = BidContractStatus.Active,
        });
        db.BidLots.Add(new BidLot
        {
            Id = lotId, TenantId = tenantId, BidPackageId = Guid.NewGuid(),
            LotNo = "LOT-001", LotName = "Bút + Giấy", BidLotStatus = BidLotStatus.Awarded,
        });
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var query = new PreviewReplenishmentQuery(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: asOf, SaveAsPurchaseRequest: false, Notes: null));

        // ACT
        var result = await new ReplenishmentQueryHandler(db, tenant).Handle(query, default);

        // ASSERT: line có gợi ý BidContract
        result.Lines.Should().HaveCount(1);
        var line = result.Lines[0];
        line.BidContractId.Should().Be(contractId);
        line.BidContractNo.Should().Be("HĐ-2026-0001");
        line.BidLotId.Should().Be(lotId);
    }

    [Fact]
    public async Task Preview_NoReceivingWarehouse_ReturnsEmpty()
    {
        // ARRANGE: không có kho RECEIVING
        var (tenantId, userId, branchId, productId, unitId, whId) = SeedBaseIds();
        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseInMemoryDatabase(databaseName: $"test-{Guid.NewGuid()}").Options;
        var db = new InventoryDbContext(options);
        db.Branches.Add(new Branch { Id = branchId, TenantId = tenantId, Code = "MAIN", Name = "Main", IsDefault = true });
        // WH loại ISSUE (không phải RECEIVING)
        db.Warehouses.Add(new Warehouse
        {
            Id = whId, TenantId = tenantId, BranchId = branchId, Code = "WH-ISS-01", Name = "Kho lẻ",
            Type = WarehouseType.Issue, Status = WarehouseStatus.Active,
        });
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var query = new PreviewReplenishmentQuery(new RunReplenishmentRequest(
            FiscalYear: 2026, FiscalMonth: 7, AsOfDate: new DateTime(2026, 6, 30),
            SaveAsPurchaseRequest: false, Notes: null));

        // ACT
        var result = await new ReplenishmentQueryHandler(db, tenant).Handle(query, default);

        // ASSERT
        result.WarehouseCount.Should().Be(0);
        result.Lines.Should().BeEmpty();
    }
}
