using FluentAssertions;
using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Purchasing;
using InventoryPro.Domain.Bidding;
using InventoryPro.Domain.Catalog;
using InventoryPro.Domain.Parties;
using InventoryPro.Domain.Purchasing;
using InventoryPro.Domain.Tenancy;
using InventoryPro.Infrastructure.Persistence;
using InventoryPro.UnitTests.TestFixtures;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace InventoryPro.UnitTests;

/// <summary>
/// Test validation PO phải gắn với HĐ thầu (Bidding business rules).
/// Đơn vị công lập: mỗi PO phải link tới 1 BidContract, NCC phải trúng, trong hạn, không vượt giá trị.
/// </summary>
public class PurchaseOrderBiddingValidationTests
{
    private static (Guid tenantId, Guid userId, Guid branchId, Guid partyId, Guid productId, Guid unitId, Guid contractId) SeedIds()
    {
        return (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
    }

    private static InventoryDbContext BuildDb(
        Guid tenantId, Guid userId, Guid branchId, Guid partyId, Guid productId, Guid unitId, Guid contractId,
        DateTime contractStart, DateTime contractEnd, decimal contractValue, decimal usedValue = 0,
        List<Guid>? lotProductIds = null,
        Guid? bidLotId = null)
    {
        var options = new DbContextOptionsBuilder<InventoryDbContext>()
            .UseInMemoryDatabase(databaseName: $"test-{Guid.NewGuid()}")
            .Options;
        var db = new InventoryDbContext(options);

        db.Branches.Add(new Branch { Id = branchId, TenantId = tenantId, Code = "MAIN", Name = "Main", IsDefault = true });
        db.Parties.Add(new Party
        {
            Id = partyId,
            TenantId = tenantId,
            Code = "NCC-001",
            Name = "Nhà thầu trúng",
            PartyType = PartyType.Supplier,
        });
        db.UnitsOfMeasure.Add(new UnitOfMeasure { Id = unitId, TenantId = tenantId, Code = "PCS", Name = "Cái" });
        db.Products.Add(new Product
        {
            Id = productId, TenantId = tenantId, Sku = "SP-001", Name = "SP test",
            BaseUnitId = unitId, CostPrice = 100, SellPrice = 150,
        });

        // BidLot
        if (bidLotId == null) bidLotId = Guid.NewGuid();
        var lot = new BidLot
        {
            Id = bidLotId.Value,
            TenantId = tenantId,
            BidPackageId = Guid.NewGuid(),
            LotNo = "LOT-001",
            LotName = "Lô test",
            BidLotStatus = BidLotStatus.Awarded,
        };
        db.BidLots.Add(lot);

        // BidLotLines (cho phép check product nằm trong lot)
        if (lotProductIds != null && lotProductIds.Any())
        {
            foreach (var pid in lotProductIds)
            {
                db.BidLotLines.Add(new BidLotLine
                {
                    TenantId = tenantId,
                    BidLotId = bidLotId.Value,
                    ProductId = pid,
                    Quantity = 100,
                    UnitId = unitId,
                });
            }
        }

        // BidContract
        db.BidContracts.Add(new BidContract
        {
            Id = contractId,
            TenantId = tenantId,
            BidLotId = bidLotId.Value,
            ContractNo = "HD-2026-0001",
            WinningPartyId = partyId,
            ContractValue = contractValue,
            ContractStartDate = contractStart,
            ContractEndDate = contractEnd,
            UsedValue = usedValue,
            BidContractStatus = BidContractStatus.Active,
        });

        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task CreatePo_NullBidContractId_ThrowsBusinessRule()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddDays(-10), DateTime.UtcNow.Date.AddYears(1), 1_000_000_000m);
        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: partyId,
            OrderDate: DateTime.UtcNow.Date,
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: Guid.Empty,  // ⭐ thiếu HĐ thầu
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(productId, unitId, 10, 100, 0, 0, null)
            });

        var act = async () => await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*phải gắn với*hợp đồng thầu*");
    }

    [Fact]
    public async Task CreatePo_WrongParty_ThrowsBusinessRule()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        var otherPartyId = Guid.NewGuid();
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddDays(-10), DateTime.UtcNow.Date.AddYears(1), 1_000_000_000m);
        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: otherPartyId,  // ⭐ khác party trong HĐ
            OrderDate: DateTime.UtcNow.Date,
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: contractId,
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(productId, unitId, 10, 100, 0, 0, null)
            });

        var act = async () => await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*nhà thầu trúng*");
    }

    [Fact]
    public async Task CreatePo_AfterContractExpiry_ThrowsBusinessRule()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        // HĐ đã hết hạn
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddYears(-2), DateTime.UtcNow.Date.AddDays(-1), 1_000_000_000m);
        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: partyId,
            OrderDate: DateTime.UtcNow.Date,  // ⭐ sau hạn
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: contractId,
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(productId, unitId, 10, 100, 0, 0, null)
            });

        var act = async () => await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*vượt quá ngày kết thúc*");
    }

    [Fact]
    public async Task CreatePo_ExceedsContractValue_ThrowsBusinessRule()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        // HĐ 10tr, đã dùng 9tr, PO mới 5tr → vượt
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddDays(-10), DateTime.UtcNow.Date.AddYears(1),
            contractValue: 10_000_000m, usedValue: 9_000_000m,
            lotProductIds: new List<Guid> { productId });
        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: partyId,
            OrderDate: DateTime.UtcNow.Date,
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: contractId,
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(productId, unitId, 50, 100_000, 0, 0, null)  // 50 * 100k = 5tr → tổng cùng đã dùng = 14tr > 10tr
            });

        var act = async () => await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*vượt quá giá trị còn lại*");
    }

    [Fact]
    public async Task CreatePo_WithinContract_Succeeds()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        // HĐ 100tr, dùng 30tr → còn 70tr. PO 50tr → OK
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddDays(-10), DateTime.UtcNow.Date.AddYears(1),
            contractValue: 100_000_000m, usedValue: 30_000_000m,
            lotProductIds: new List<Guid> { productId });
        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: partyId,
            OrderDate: DateTime.UtcNow.Date,
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: contractId,
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(productId, unitId, 500, 100_000, 0, 0, null)  // 500 * 100k = 50tr
            });

        var dto = await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        dto.Should().NotBeNull();
        dto.BidContractId.Should().Be(contractId);
        dto.BidContractNo.Should().Be("HD-2026-0001");
        dto.BidContractRemainingValue.Should().Be(20_000_000m);  // 100tr - 30tr - 50tr = 20tr
    }

    [Fact]
    public async Task CreatePo_ProductNotInLot_ThrowsBusinessRule()
    {
        var (tenantId, userId, branchId, partyId, productId, unitId, contractId) = SeedIds();
        var otherProductId = Guid.NewGuid();
        // Lô chỉ có productId; PO có otherProductId → reject
        var db = BuildDb(tenantId, userId, branchId, partyId, productId, unitId, contractId,
            DateTime.UtcNow.Date.AddDays(-10), DateTime.UtcNow.Date.AddYears(1),
            contractValue: 100_000_000m, usedValue: 0,
            lotProductIds: new List<Guid> { productId });

        // Add otherProduct
        db.Products.Add(new Product
        {
            Id = otherProductId, TenantId = tenantId, Sku = "OTHER", Name = "Other",
            BaseUnitId = unitId, CostPrice = 100, SellPrice = 150,
        });
        await db.SaveChangesAsync();

        var tenant = new TenantContext { TenantId = tenantId, UserId = userId, Role = "ADMIN" };
        var handler = new PurchaseOrderCommandHandler(db, tenant);

        var req = new CreatePurchaseOrderRequest(
            BranchId: branchId,
            PartyId: partyId,
            OrderDate: DateTime.UtcNow.Date,
            ExpectedDate: null,
            Currency: "VND", ExchangeRate: 1, DiscountAmount: 0, ShippingAmount: 0,
            PaymentTerms: 0, ShippingAddress: null, Notes: null, InternalNotes: null,
            BidContractId: contractId,
            BidLotId: null,
            Lines: new List<CreatePurchaseOrderLineRequest>
            {
                new(otherProductId, unitId, 10, 100, 0, 0, null)
            });

        var act = async () => await handler.Handle(new CreatePurchaseOrderCommand(req), default);
        await act.Should().ThrowAsync<BusinessRuleException>()
            .WithMessage("*không thuộc danh mục lô thầu*");
    }
}
