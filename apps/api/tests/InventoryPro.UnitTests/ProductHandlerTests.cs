using FluentAssertions;
using InventoryPro.API.Middleware;
using InventoryPro.Application.Catalog.Products;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.UnitTests.TestFixtures;
using Xunit;

namespace InventoryPro.UnitTests;

public class ProductHandlerTests
{
    [Fact]
    public async Task CreateProduct_WithDuplicateSku_ThrowsConflict()
    {
        var tenantId = Guid.NewGuid();
        var (db, tenant) = DbContextFactory.CreateBasic(tenantId: tenantId);

        // Seed sẵn 1 product với SKU "DUP-001"
        var unitId = db.UnitsOfMeasure.First().Id;
        db.Products.Add(new()
        {
            TenantId = tenantId,
            Sku = "DUP-001",
            Name = "First Product",
            BaseUnitId = unitId,
        });
        await db.SaveChangesAsync();

        var handler = new ProductCommandHandler(db, tenant);
        var req = new CreateProductRequest("DUP-001", null, "Second", null, null, unitId, "GOODS", 0, 0, 0, null, null);

        var act = async () => await handler.Handle(new CreateProductCommand(req), default);
        await act.Should().ThrowAsync<ConflictException>().WithMessage("*SKU*DUP-001*");
    }

    [Fact]
    public async Task CreateProduct_WithInvalidBaseUnit_ThrowsNotFound()
    {
        var tenantId = Guid.NewGuid();
        var (db, tenant) = DbContextFactory.CreateBasic(tenantId: tenantId);

        var handler = new ProductCommandHandler(db, tenant);
        var req = new CreateProductRequest("NEW-001", null, "New Product", null, null, Guid.NewGuid(), "GOODS", 0, 0, 0, null, null);

        var act = async () => await handler.Handle(new CreateProductCommand(req), default);
        await act.Should().ThrowAsync<NotFoundException>().WithMessage("*Base unit*");
    }

    [Fact]
    public async Task GetProductById_WithOtherTenantProduct_ThrowsNotFound()
    {
        var (db, tenant) = DbContextFactory.CreateBasic();
        var productId = db.Products.First().Id;

        // Switch sang tenant khác
        tenant.TenantId = Guid.NewGuid();
        var handler = new ProductQueryHandler(db, tenant);

        var act = async () => await handler.Handle(new GetProductByIdQuery(productId), default);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task ListProducts_OnlyReturnsCurrentTenantProducts()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var (db, tenant) = DbContextFactory.CreateBasic(tenantId: tenantA);

        // Add product cho tenantB
        var unitId = db.UnitsOfMeasure.First().Id;
        db.Products.Add(new()
        {
            TenantId = tenantB,
            Sku = "OTHER-001",
            Name = "Other Tenant Product",
            BaseUnitId = unitId,
        });
        await db.SaveChangesAsync();

        tenant.TenantId = tenantA;
        var handler = new ProductQueryHandler(db, tenant);

        var result = await handler.Handle(new ListProductsQuery(1, 20, null, null, null), default);
        result.Items.Should().HaveCount(1, "chỉ thấy product của tenantA");
        result.Items[0].Sku.Should().Be("SKU-001");
    }
}
