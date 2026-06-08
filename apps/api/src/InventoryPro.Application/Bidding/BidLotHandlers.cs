using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Bidding;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Bidding;

using InventoryPro.Application.Common.Tenancy;

// =============================================================================
// BID LOT HANDLERS (Lô/Phần thầu)
// =============================================================================

public record GetBidLotByIdQuery(Guid Id) : IRequest<BidLotDto>;
public record ListBidLotsQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? BidPackageId = null,
    string? Status = null) : IRequest<PaginatedResult<BidLotDto>>;
public record CreateBidLotCommand(CreateBidLotRequest Request) : IRequest<BidLotDto>;
public record UpdateBidLotCommand(Guid Id, UpdateBidLotRequest Request) : IRequest<BidLotDto>;
public record DeleteBidLotCommand(Guid Id) : IRequest<Unit>;
public record PublishBidLotCommand(Guid Id) : IRequest<BidLotDto>;
public record AddBidderCommand(Guid Id, AddBidderRequest Request) : IRequest<BidLotDto>;
public record RemoveBidderCommand(Guid LotId, Guid BidderId) : IRequest<Unit>;
public record AwardBidLotCommand(Guid Id, AwardBidLotRequest Request) : IRequest<BidLotDto>;

public class BidLotQueryHandler :
    IRequestHandler<GetBidLotByIdQuery, BidLotDto>,
    IRequestHandler<ListBidLotsQuery, PaginatedResult<BidLotDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidLotQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidLotDto> Handle(GetBidLotByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots.AsNoTracking()
            .Include(x => x.BidPackage)
            .Include(x => x.AwardedBidder)
            .Include(x => x.Contract)
            .Include(x => x.Lines)
            .Include(x => x.Bidders).ThenInclude(b => b.Party)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        return await ToDtoAsync(lot, ct);
    }

    public async Task<PaginatedResult<BidLotDto>> Handle(ListBidLotsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.BidLots.AsNoTracking()
            .Include(x => x.BidPackage)
            .Include(x => x.AwardedBidder)
            .Include(x => x.Contract)
            .Include(x => x.Lines)
            .Include(x => x.Bidders).ThenInclude(b => b.Party)
            .Where(x => x.TenantId == _tenant.TenantId);
        if (request.BidPackageId.HasValue) q = q.Where(x => x.BidPackageId == request.BidPackageId.Value);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<BidLotStatus>(request.Status, true);
            q = q.Where(x => x.BidLotStatus == st);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderBy(x => x.LotNo)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var dtos = new List<BidLotDto>();
        foreach (var lot in items) dtos.Add(await ToDtoAsync(lot, ct));

        return new PaginatedResult<BidLotDto>
        {
            Items = dtos,
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public static async Task<BidLotDto> ToDtoAsync(BidLot lot, InventoryDbContext db)
    {
        var productIds = lot.Lines.Select(l => l.ProductId).Distinct().ToList();
        var unitIds = lot.Lines.Select(l => l.UnitId).Distinct().ToList();
        var products = await db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => new { p.Sku, p.Name });
        var units = await db.UnitsOfMeasure.AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code);

        var lineDtos = lot.Lines.Select(l =>
        {
            products.TryGetValue(l.ProductId, out var p);
            units.TryGetValue(l.UnitId, out var u);
            return new BidLotLineDto(
                l.Id, l.ProductId, p?.Sku, p?.Name, l.UnitId, u,
                l.Quantity, l.EstimatedUnitPrice,
                l.Quantity * (l.EstimatedUnitPrice ?? 0), l.Notes);
        }).ToList();

        var bidderDtos = lot.Bidders.Select(b => new BidBidderDto(
            b.Id, b.PartyId, b.Party?.Name, b.Party?.Code,
            b.BidPrice, b.BidDate, b.IsWinner, b.Rank, b.EvaluationScore, b.Notes
        )).ToList();

        return new BidLotDto(
            lot.Id, lot.LotNo, lot.LotName,
            lot.BidPackageId, lot.BidPackage?.PackageNo,
            lot.BidLotStatus.ToString().ToUpperInvariant(),
            lot.ProductCategory, lot.EstimatedValue, lot.QuantityTotal, lot.Unit,
            lot.AwardedBidderId, lot.AwardedBidder?.Name,
            lot.AwardedValue, lot.AwardedDate, lot.DecisionNo,
            lot.ContractId, lot.Contract?.ContractNo,
            lineDtos, bidderDtos, lot.CreatedAt, lot.UpdatedAt);
    }

    private async Task<BidLotDto> ToDtoAsync(BidLot lot, CancellationToken ct) => await ToDtoAsync(lot, _db);
}

public class BidLotCommandHandler :
    IRequestHandler<CreateBidLotCommand, BidLotDto>,
    IRequestHandler<UpdateBidLotCommand, BidLotDto>,
    IRequestHandler<DeleteBidLotCommand, Unit>,
    IRequestHandler<PublishBidLotCommand, BidLotDto>,
    IRequestHandler<AddBidderCommand, BidLotDto>,
    IRequestHandler<RemoveBidderCommand, Unit>,
    IRequestHandler<AwardBidLotCommand, BidLotDto>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidLotCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidLotDto> Handle(CreateBidLotCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        if (string.IsNullOrWhiteSpace(r.LotName))
            throw new ValidationException("Tên lô thầu không được trống");

        var package = await _db.BidPackages.FirstOrDefaultAsync(x => x.Id == r.BidPackageId && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidPackage {r.BidPackageId} không tồn tại");
        if (package.BidPackageStatus == BidPackageStatus.Published)
            throw new BusinessRuleException("Không thể thêm lô vào gói thầu đã publish");

        var entity = new BidLot
        {
            TenantId = _tenant.TenantId!.Value,
            BidPackageId = r.BidPackageId,
            LotNo = r.LotNo,
            LotName = r.LotName,
            BidLotStatus = BidLotStatus.Draft,
            ProductCategory = r.ProductCategory,
            EstimatedValue = r.EstimatedValue,
            QuantityTotal = r.QuantityTotal,
            Unit = r.Unit,
            CreatedBy = _tenant.UserId,
        };
        foreach (var line in r.Lines ?? new())
        {
            entity.Lines.Add(new BidLotLine
            {
                TenantId = _tenant.TenantId.Value,
                ProductId = line.ProductId,
                Quantity = line.Quantity,
                UnitId = line.UnitId,
                EstimatedUnitPrice = line.EstimatedUnitPrice,
                Notes = line.Notes,
            });
        }
        _db.BidLots.Add(entity);
        await _db.SaveChangesAsync(ct);
        return await GetLotDtoAsync(entity.Id, ct);
    }

    public async Task<BidLotDto> Handle(UpdateBidLotCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        if (lot.BidLotStatus != BidLotStatus.Draft)
            throw new BusinessRuleException("Chỉ lô thầu ở trạng thái DRAFT mới sửa được");

        var r = request.Request;
        lot.LotName = r.LotName;
        lot.ProductCategory = r.ProductCategory;
        lot.EstimatedValue = r.EstimatedValue;
        lot.QuantityTotal = r.QuantityTotal;
        lot.Unit = r.Unit;

        if (r.Lines != null)
        {
            _db.BidLotLines.RemoveRange(lot.Lines);
            lot.Lines.Clear();
            foreach (var line in r.Lines)
            {
                lot.Lines.Add(new BidLotLine
                {
                    TenantId = _tenant.TenantId!.Value,
                    ProductId = line.ProductId,
                    Quantity = line.Quantity,
                    UnitId = line.UnitId,
                    EstimatedUnitPrice = line.EstimatedUnitPrice,
                    Notes = line.Notes,
                });
            }
        }
        await _db.SaveChangesAsync(ct);
        return await GetLotDtoAsync(lot.Id, ct);
    }

    public async Task<Unit> Handle(DeleteBidLotCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        if (lot.BidLotStatus != BidLotStatus.Draft)
            throw new BusinessRuleException("Chỉ xóa được lô thầu ở trạng thái DRAFT");
        _db.BidLots.Remove(lot);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<BidLotDto> Handle(PublishBidLotCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots.Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        if (lot.BidLotStatus != BidLotStatus.Draft)
            throw new BusinessRuleException("Chỉ publish lô thầu ở trạng thái DRAFT");
        if (lot.Lines.Count == 0) throw new BusinessRuleException("Lô thầu phải có ít nhất 1 dòng vật tư");

        lot.BidLotStatus = BidLotStatus.Published;
        await _db.SaveChangesAsync(ct);
        return await GetLotDtoAsync(lot.Id, ct);
    }

    public async Task<BidLotDto> Handle(AddBidderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        if (lot.BidLotStatus == BidLotStatus.Cancelled || lot.BidLotStatus == BidLotStatus.Awarded)
            throw new BusinessRuleException("Lô thầu đã đóng hoặc đã trúng");

        var party = await _db.Parties.FirstOrDefaultAsync(p => p.Id == request.Request.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {request.Request.PartyId} không tồn tại");

        var existing = await _db.BidBidders.FirstOrDefaultAsync(b => b.BidLotId == lot.Id && b.PartyId == request.Request.PartyId, ct);
        if (existing != null) throw new BusinessRuleException("Nhà thầu này đã đăng ký dự thầu lô này");

        var bidder = new BidBidder
        {
            TenantId = _tenant.TenantId!.Value,
            BidLotId = lot.Id,
            PartyId = request.Request.PartyId,
            BidPrice = request.Request.BidPrice,
            BidDate = request.Request.BidDate ?? DateTime.UtcNow,
            EvaluationScore = request.Request.EvaluationScore,
            Rank = request.Request.Rank,
            Notes = request.Request.Notes,
        };
        _db.BidBidders.Add(bidder);
        if (lot.BidLotStatus == BidLotStatus.Published)
            lot.BidLotStatus = BidLotStatus.Evaluating;
        await _db.SaveChangesAsync(ct);
        return await GetLotDtoAsync(lot.Id, ct);
    }

    public async Task<Unit> Handle(RemoveBidderCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var b = await _db.BidBidders
            .FirstOrDefaultAsync(x => x.BidLotId == request.LotId && x.Id == request.BidderId, ct)
            ?? throw new NotFoundException($"Bidder không tồn tại");
        if (b.IsWinner) throw new BusinessRuleException("Không thể xóa nhà thầu đã trúng");
        _db.BidBidders.Remove(b);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<BidLotDto> Handle(AwardBidLotCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var lot = await _db.BidLots
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {request.Id} không tồn tại");
        if (lot.BidLotStatus == BidLotStatus.Awarded)
            throw new BusinessRuleException("Lô thầu đã được chấm trúng rồi");
        if (lot.BidLotStatus == BidLotStatus.Cancelled)
            throw new BusinessRuleException("Lô thầu đã hủy");

        var winner = await _db.BidBidders
            .FirstOrDefaultAsync(b => b.Id == request.Request.BidderId && b.BidLotId == lot.Id, ct)
            ?? throw new NotFoundException("Nhà thầu được chọn không nằm trong danh sách dự thầu");
        if (winner.IsWinner) throw new BusinessRuleException("Nhà thầu này đã được đánh dấu trúng");

        // Mark winner
        winner.IsWinner = true;
        lot.AwardedBidderId = winner.PartyId;
        lot.AwardedValue = request.Request.AwardedValue;
        lot.AwardedDate = request.Request.AwardedDate;
        lot.DecisionNo = request.Request.DecisionNo;
        lot.BidLotStatus = BidLotStatus.Awarded;

        // Auto-create BidContract
        var year = (request.Request.AwardedDate ?? DateTime.UtcNow).Year;
        var prefix = $"HĐ-{year}-";
        var count = await _db.BidContracts.CountAsync(c => c.TenantId == _tenant.TenantId && c.ContractNo.StartsWith(prefix), ct);
        var contractNo = $"{prefix}{(count + 1).ToString("D4")}";

        var contract = new BidContract
        {
            TenantId = _tenant.TenantId.Value,
            BidLotId = lot.Id,
            ContractNo = contractNo,
            ContractName = $"HĐ thầu cho lô '{lot.LotName}'",
            WinningPartyId = winner.PartyId,
            ContractValue = request.Request.AwardedValue,
            ContractStartDate = request.Request.AwardedDate,
            ContractEndDate = request.Request.AwardedDate.AddYears(1),  // default 1 năm, user có thể sửa
            BidContractStatus = BidContractStatus.Active,
            CreatedBy = _tenant.UserId,
        };
        _db.BidContracts.Add(contract);
        await _db.SaveChangesAsync(ct);

        // Trigger DB sẽ auto-set lot.contract_id = contract.id
        // Nhưng EF cache có thể stale, cần refresh
        await _db.Entry(lot).ReloadAsync(ct);

        return await GetLotDtoAsync(lot.Id, ct);
    }

    private async Task<BidLotDto> GetLotDtoAsync(Guid lotId, CancellationToken ct)
    {
        var lot = await _db.BidLots.AsNoTracking()
            .Include(x => x.BidPackage)
            .Include(x => x.AwardedBidder)
            .Include(x => x.Contract)
            .Include(x => x.Lines)
            .Include(x => x.Bidders).ThenInclude(b => b.Party)
            .FirstAsync(x => x.Id == lotId, ct);
        return await BidLotQueryHandler.ToDtoAsync(lot, _db);
    }
}
