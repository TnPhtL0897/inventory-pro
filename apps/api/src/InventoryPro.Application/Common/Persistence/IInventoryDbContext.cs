using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;
using InventoryPro.Domain.Replenishment;
using InventoryPro.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Common.Persistence;

/// <summary>
/// Abstraction của DbContext để Application layer có thể thao tác database
/// mà KHÔNG cần project-reference tới Infrastructure (tránh circular dependency).
///
/// Convention: Infrastructure.Persistence.InventoryDbContext implements interface này,
/// DI container bind IInventoryDbContext → InventoryDbContext (scoped).
///
/// Lưu ý: Mọi DbSet phải được khai báo ở đây với cùng tên như implementation để
/// các handler có thể truy cập mà không cast.
/// </summary>
public interface IInventoryDbContext
{
    // Tenancy
    DbSet<Branch> Branches { get; }

    // Catalog
    DbSet<Category> Categories { get; }
    DbSet<UnitOfMeasure> UnitsOfMeasure { get; }
    DbSet<Product> Products { get; }
    DbSet<ProductUnit> ProductUnits { get; }

    // Inventory
    DbSet<Warehouse> Warehouses { get; }
    DbSet<Location> Locations { get; }
    DbSet<Stock> Stock { get; }
    DbSet<StockMovement> StockMovements { get; }
    DbSet<StockTransfer> StockTransfers { get; }
    DbSet<StockTransferLine> StockTransferLines { get; }
    DbSet<StockTake> StockTakes { get; }
    DbSet<StockTakeLine> StockTakeLines { get; }

    // Parties
    DbSet<Party> Parties { get; }
    DbSet<SupplierProduct> SupplierProducts { get; }

    // Purchasing
    DbSet<PurchaseOrder> PurchaseOrders { get; }
    DbSet<PurchaseOrderLine> PurchaseOrderLines { get; }
    DbSet<GoodsReceipt> GoodsReceipts { get; }
    DbSet<GoodsReceiptLine> GoodsReceiptLines { get; }
    DbSet<StockIssue> StockIssues { get; }
    DbSet<StockIssueLine> StockIssueLines { get; }

    // Bidding
    DbSet<BidPlan> BidPlans { get; }
    DbSet<PurchaseRequest> PurchaseRequests { get; }
    DbSet<PurchaseRequestLine> PurchaseRequestLines { get; }
    DbSet<BidPackage> BidPackages { get; }
    DbSet<BidLot> BidLots { get; }
    DbSet<BidLotLine> BidLotLines { get; }
    DbSet<BidBidder> BidBidders { get; }
    DbSet<BidContract> BidContracts { get; }

    // Replenishment
    DbSet<MonthEndForecastRun> MonthEndForecastRuns { get; }

    // EF Core operations
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    int SaveChanges();
}
