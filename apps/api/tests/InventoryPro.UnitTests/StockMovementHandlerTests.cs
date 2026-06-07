using FluentAssertions;
using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Inventory.Stock;
using InventoryPro.Domain.Inventory;
using InventoryPro.UnitTests.TestFixtures;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InventoryPro.UnitTests;

/// <summary>
/// Test idempotency cho StockCommandHandler - đảm bảo cùng idempotency_key
/// trả về cùng movement (không insert duplicate).
/// </summary>
public class StockMovementHandlerTests
{
    [Fact]
    public async Task RecordMovement_WithSameIdempotencyKey_ReturnsExisting()
    {
        // Arrange
        var (db, tenant) = DbContextFactory.CreateBasic();
        var productId = db.Products.First().Id;
        var unitId = db.Products.First().BaseUnitId;
        var whId = db.Warehouses.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;
        var idempotencyKey = Guid.NewGuid();

        var handler = new StockCommandHandler(db, tenant);
        var req = new RecordMovementRequest(branchId, whId, locId, productId, unitId, "IN", 10m, 100m, "Test", null, null, null);

        // Act 1: lần đầu
        var first = await handler.Handle(new RecordMovementCommand(req, idempotencyKey), default);
        var firstId = first.Id;

        // Act 2: cùng key lần 2
        var second = await handler.Handle(new RecordMovementCommand(req, idempotencyKey), default);

        // Assert: phải trả về cùng movement
        firstId.Should().Be(second.Id, "idempotency: cùng key phải trả về cùng record");
        db.StockMovements.Count().Should().Be(1, "không được insert duplicate");
    }

    [Fact]
    public async Task RecordMovement_WithInvalidProduct_ThrowsNotFound()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var unitId = db.Products.First().BaseUnitId;
        var whId = db.Warehouses.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;
        var handler = new StockCommandHandler(db, tenant);

        var req = new RecordMovementRequest(
            branchId, whId, locId, Guid.NewGuid(), unitId, "IN", 10m, null, null, null, null, null);

        var act = async () => await handler.Handle(new RecordMovementCommand(req, Guid.NewGuid()), default);
        await act.Should().ThrowAsync<NotFoundException>().WithMessage("*Product*");
    }

    [Fact]
    public async Task RecordMovement_WithNegativeQuantity_ThrowsValidation()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var productId = db.Products.First().Id;
        var unitId = db.Products.First().BaseUnitId;
        var whId = db.Warehouses.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;
        var handler = new StockCommandHandler(db, tenant);

        var req = new RecordMovementRequest(
            branchId, whId, locId, productId, unitId, "IN", -5m, null, null, null, null, null);

        var act = async () => await handler.Handle(new RecordMovementCommand(req, Guid.NewGuid()), default);
        await act.Should().ThrowAsync<ValidationException>().WithMessage("*Quantity*");
    }

    [Fact]
    public async Task RecordMovement_WithInvalidMovementType_ThrowsValidation()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var productId = db.Products.First().Id;
        var unitId = db.Products.First().BaseUnitId;
        var whId = db.Warehouses.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;
        var handler = new StockCommandHandler(db, tenant);

        var req = new RecordMovementRequest(
            branchId, whId, locId, productId, unitId, "INVALID_TYPE", 5m, null, null, null, null, null);

        var act = async () => await handler.Handle(new RecordMovementCommand(req, Guid.NewGuid()), default);
        await act.Should().ThrowAsync<ValidationException>().WithMessage("*MovementType*");
    }

    [Fact]
    public async Task RecordMovement_BatchTrackedProduct_WithoutBatchNo_ThrowsValidation()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var product = db.Products.First();
        product.IsBatchTracked = true;
        await db.SaveChangesAsync();

        var unitId = product.BaseUnitId;
        var whId = db.Warehouses.First().Id;
        var locId = db.Locations.First().Id;
        var branchId = db.Branches.First().Id;
        var handler = new StockCommandHandler(db, tenant);

        var req = new RecordMovementRequest(
            branchId, whId, locId, product.Id, unitId, "IN", 5m, null, null, null, null, null);

        var act = async () => await handler.Handle(new RecordMovementCommand(req, Guid.NewGuid()), default);
        await act.Should().ThrowAsync<ValidationException>().WithMessage("*batch_no*");
    }
}
