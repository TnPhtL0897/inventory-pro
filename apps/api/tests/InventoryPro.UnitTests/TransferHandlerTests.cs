using FluentAssertions;
using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Inventory.Transfers;
using InventoryPro.UnitTests.TestFixtures;
using Xunit;

namespace InventoryPro.UnitTests;

public class TransferHandlerTests
{
    [Fact]
    public async Task CreateTransfer_SameSourceAndDestWarehouse_ThrowsValidation()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var whId = db.Warehouses.First().Id;
        var branchId = db.Branches.First().Id;
        var productId = db.Products.First().Id;
        var unitId = db.Products.First().BaseUnitId;
        var locId = db.Locations.First().Id;

        var handler = new StockTransferCommandHandler(db, tenant);
        var req = new CreateStockTransferRequest(
            branchId, whId, branchId, whId, DateTime.UtcNow, null, "Test",
            new()
            {
                new(productId, unitId, locId, locId, 10m, null, null, null, null, Guid.NewGuid())
            });

        var act = async () => await handler.Handle(new CreateStockTransferCommand(req), default);
        await act.Should().ThrowAsync<ValidationException>().WithMessage("*khác nhau*");
    }

    [Fact]
    public async Task CreateTransfer_NoLines_ThrowsValidation()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var whId = db.Warehouses.First().Id;
        var branchId = db.Branches.First().Id;
        // Tạo thêm 1 warehouse khác
        var wh2Id = Guid.NewGuid();
        db.Warehouses.Add(new()
        {
            Id = wh2Id,
            TenantId = tenant.TenantId!.Value,
            BranchId = branchId,
            Code = "WH-002",
            Name = "Other Warehouse",
        });
        await db.SaveChangesAsync();

        var handler = new StockTransferCommandHandler(db, tenant);
        var req = new CreateStockTransferRequest(branchId, whId, branchId, wh2Id, DateTime.UtcNow, null, "Test", new());

        var act = async () => await handler.Handle(new CreateStockTransferCommand(req), default);
        await act.Should().ThrowAsync<ValidationException>().WithMessage("*1 dòng*");
    }

    [Fact]
    public async Task CreateTransfer_ValidInputs_CreatesDraftTransfer()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var whId = db.Warehouses.First().Id;
        var branchId = db.Branches.First().Id;
        var productId = db.Products.First().Id;
        var unitId = db.Products.First().BaseUnitId;
        var locId = db.Locations.First().Id;

        // Tạo thêm wh2 với location2
        var wh2Id = Guid.NewGuid();
        var loc2Id = Guid.NewGuid();
        db.Warehouses.Add(new()
        {
            Id = wh2Id,
            TenantId = tenant.TenantId!.Value,
            BranchId = branchId,
            Code = "WH-002",
            Name = "Other Warehouse",
        });
        db.Locations.Add(new()
        {
            Id = loc2Id,
            TenantId = tenant.TenantId!.Value,
            BranchId = branchId,
            WarehouseId = wh2Id,
            Code = "B-01",
            Name = "Bin B-01",
        });
        await db.SaveChangesAsync();

        var handler = new StockTransferCommandHandler(db, tenant);
        var req = new CreateStockTransferRequest(
            branchId, whId, branchId, wh2Id, DateTime.UtcNow, null, "Test",
            new()
            {
                new(productId, unitId, locId, loc2Id, 5m, null, null, null, "Line 1", Guid.NewGuid())
            });

        var result = await handler.Handle(new CreateStockTransferCommand(req), default);

        result.TransferNumber.Should().StartWith("TR-");
        result.Status.Should().Be("DRAFT");
        result.LineCount.Should().Be(1);
    }
}
