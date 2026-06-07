using InventoryPro.API.Middleware;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Domain.Inventory;
using InventoryPro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.UnitTests.TestFixtures;

/// <summary>
/// Helper tạo In-Memory DbContext + TenantContext giả cho unit tests.
/// Mỗi test nên dùng instance mới (isolation).
/// </summary>
public static class DbContextFactory
{
    public static (InventoryDbContext db, TenantContext tenant) Create(
        Guid tenantId,
        Guid userId,
        params Action<InventoryDbContext>[] seedActions)
    {
        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseInMemoryDatabase(databaseName: $"test-{Guid.NewGuid()}")
            .Options;
        var db = new InventoryDbContext(options);
        foreach (var seed in seedActions) seed(db);
        db.SaveChanges();
        var tenant = new TenantContext
        {
            TenantId = tenantId,
            UserId = userId,
            Role = "ADMIN",
        };
        return (db, tenant);
    }

    public static (InventoryDbContext db, TenantContext tenant) CreateBasic(
        Guid tenantId = default,
        Guid userId = default,
        Guid? productId = null,
        Guid? unitId = null,
        Guid? warehouseId = null,
        Guid? branchId = null,
        Guid? locationId = null)
    {
        tenantId = tenantId == default ? Guid.NewGuid() : tenantId;
        userId = userId == default ? Guid.NewGuid() : userId;
        productId ??= Guid.NewGuid();
        unitId ??= Guid.NewGuid();
        warehouseId ??= Guid.NewGuid();
        branchId ??= Guid.NewGuid();
        locationId ??= Guid.NewGuid();

        return Create(tenantId, userId, db =>
        {
            // Branch
            db.Branches.Add(new Branch
            {
                Id = branchId.Value,
                TenantId = tenantId,
                Code = "MAIN",
                Name = "Main Branch",
                IsDefault = true,
            });
            // Unit
            db.UnitsOfMeasure.Add(new UnitOfMeasure
            {
                Id = unitId.Value,
                TenantId = tenantId,
                Code = "PCS",
                Name = "Cái",
            });
            // Product
            db.Products.Add(new Product
            {
                Id = productId.Value,
                TenantId = tenantId,
                Sku = "SKU-001",
                Name = "Test Product",
                BaseUnitId = unitId.Value,
                CostPrice = 100,
                SellPrice = 150,
            });
            // Warehouse
            db.Warehouses.Add(new Warehouse
            {
                Id = warehouseId.Value,
                TenantId = tenantId,
                BranchId = branchId.Value,
                Code = "WH-001",
                Name = "Test Warehouse",
                IsDefault = true,
            });
            // Location
            db.Locations.Add(new Location
            {
                Id = locationId.Value,
                TenantId = tenantId,
                BranchId = branchId.Value,
                WarehouseId = warehouseId.Value,
                Code = "A-01",
                Name = "Bin A-01",
            });
        });
    }
}
