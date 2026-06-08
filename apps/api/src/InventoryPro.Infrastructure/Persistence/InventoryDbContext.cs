using System.Reflection;
using InventoryPro.Application.Common.Persistence;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Inventory;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;
using InventoryPro.Domain.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Infrastructure.Persistence;

/// <summary>
/// DbContext chính cho InventoryPro. Kết nối Supabase Postgres.
/// Multi-tenancy: Global query filter sẽ được thêm vào các entity trong phase sau.
/// Implement IInventoryDbContext (defined ở Application layer) để handlers depend
/// vào abstraction thay vì concrete class — tránh circular dependency khi
/// Application tham chiếu Infrastructure.
/// </summary>
public class InventoryDbContext : DbContext, IInventoryDbContext
{
    public InventoryDbContext(DbContextOptions<InventoryDbContext> options) : base(options)
    {
    }

    // Tenancy
    public DbSet<Branch> Branches => Set<Branch>();

    // Catalog
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<UnitOfMeasure> UnitsOfMeasure => Set<UnitOfMeasure>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductUnit> ProductUnits => Set<ProductUnit>();

    // Inventory
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Stock> Stock => Set<Stock>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<StockTransfer> StockTransfers => Set<StockTransfer>();
    public DbSet<StockTransferLine> StockTransferLines => Set<StockTransferLine>();
    public DbSet<StockTake> StockTakes => Set<StockTake>();
    public DbSet<StockTakeLine> StockTakeLines => Set<StockTakeLine>();

    // Parties
    public DbSet<Party> Parties => Set<Party>();
    public DbSet<SupplierProduct> SupplierProducts => Set<SupplierProduct>();

    // Purchasing
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<GoodsReceiptLine> GoodsReceiptLines => Set<GoodsReceiptLine>();
    public DbSet<StockIssue> StockIssues => Set<StockIssue>();
    public DbSet<StockIssueLine> StockIssueLines => Set<StockIssueLine>();

    // Bidding (Đấu thầu - đơn vị công lập)
    public DbSet<Bidding.BidPlan> BidPlans => Set<Bidding.BidPlan>();
    public DbSet<Bidding.PurchaseRequest> PurchaseRequests => Set<Bidding.PurchaseRequest>();
    public DbSet<Bidding.PurchaseRequestLine> PurchaseRequestLines => Set<Bidding.PurchaseRequestLine>();
    public DbSet<Bidding.BidPackage> BidPackages => Set<Bidding.BidPackage>();
    public DbSet<Bidding.BidLot> BidLots => Set<Bidding.BidLot>();
    public DbSet<Bidding.BidLotLine> BidLotLines => Set<Bidding.BidLotLine>();
    public DbSet<Bidding.BidBidder> BidBidders => Set<Bidding.BidBidder>();
    public DbSet<Bidding.BidContract> BidContracts => Set<Bidding.BidContract>();

    // Replenishment (Dự trù cuối tháng)
    public DbSet<Replenishment.MonthEndForecastRun> MonthEndForecastRuns => Set<Replenishment.MonthEndForecastRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());
    }
}
