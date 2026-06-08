using FluentAssertions;
using InventoryPro.Application.Common.Tenancy;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Inventory.Warehouses;
using InventoryPro.UnitTests.TestFixtures;
using Xunit;

namespace InventoryPro.UnitTests;

public class WarehouseHandlerTests
{
    [Fact]
    public async Task DeleteWarehouse_WithStock_ThrowsConflict()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var whId = db.Warehouses.First().Id;
        var productId = db.Products.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;

        db.Stock.Add(new()
        {
            TenantId = tenant.TenantId!.Value,
            BranchId = branchId,
            WarehouseId = whId,
            LocationId = locId,
            ProductId = productId,
        });
        await db.SaveChangesAsync();

        var handler = new WarehouseCommandHandler(db, tenant);
        var act = async () => await handler.Handle(new DeleteWarehouseCommand(whId), default);

        await act.Should().ThrowAsync<ConflictException>().WithMessage("*còn tồn kho*");
    }

    [Fact]
    public async Task DeleteWarehouse_WithLocations_ThrowsConflict()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var whId = db.Warehouses.First().Id;
        // Đã có 1 location từ seed
        var handler = new WarehouseCommandHandler(db, tenant);

        var act = async () => await handler.Handle(new DeleteWarehouseCommand(whId), default);
        await act.Should().ThrowAsync<ConflictException>().WithMessage("*vị trí*");
    }

    [Fact]
    public async Task DeleteWarehouse_NoStockNoLocation_MarksClosed()
    {
        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var (db, tenant) = DbContextFactory.CreateBasic(tenantId: tenantId, branchId: branchId);

        // Xóa location từ seed
        db.Locations.RemoveRange(db.Locations);
        await db.SaveChangesAsync();

        var whId = db.Warehouses.First().Id;
        var handler = new WarehouseCommandHandler(db, tenant);

        await handler.Handle(new DeleteWarehouseCommand(whId), default);

        var wh = await db.Warehouses.FindAsync(whId);
        wh!.Status.Should().Be(Domain.Inventory.WarehouseStatus.Closed);
    }
}
