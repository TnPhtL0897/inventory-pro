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
// BID CONTRACT HANDLERS
// =============================================================================

public record GetBidContractByIdQuery(Guid Id) : IRequest<BidContractDto>;
public record ListBidContractsQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? BidLotId = null,
    Guid? WinningPartyId = null,
    string? Status = null,
    bool? ExpiringSoon = null) : IRequest<PaginatedResult<BidContractDto>>;
public record CreateBidContractCommand(CreateBidContractRequest Request) : IRequest<BidContractDto>;
public record UpdateBidContractCommand(Guid Id, UpdateBidContractRequest Request) : IRequest<BidContractDto>;
public record DeleteBidContractCommand(Guid Id) : IRequest<Unit>;
public record TerminateBidContractCommand(Guid Id, TerminateBidContractRequest Request) : IRequest<BidContractDto>;
public record GetActiveBidContractsLookupQuery() : IRequest<List<BidContractLookupDto>>;

public class BidContractQueryHandler :
    IRequestHandler<GetBidContractByIdQuery, BidContractDto>,
    IRequestHandler<ListBidContractsQuery, PaginatedResult<BidContractDto>>,
    IRequestHandler<GetActiveBidContractsLookupQuery, List<BidContractLookupDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidContractQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidContractDto> Handle(GetBidContractByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.BidContracts.AsNoTracking()
            .Include(x => x.BidLot)
            .Include(x => x.WinningParty)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {request.Id} không tồn tại");
        return ToDto(c);
    }

    public async Task<PaginatedResult<BidContractDto>> Handle(ListBidContractsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.BidContracts.AsNoTracking()
            .Include(x => x.BidLot)
            .Include(x => x.WinningParty)
            .Where(x => x.TenantId == _tenant.TenantId);
        if (request.BidLotId.HasValue) q = q.Where(x => x.BidLotId == request.BidLotId.Value);
        if (request.WinningPartyId.HasValue) q = q.Where(x => x.WinningPartyId == request.WinningPartyId.Value);
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<BidContractStatus>(request.Status, true);
            q = q.Where(x => x.BidContractStatus == st);
        }
        if (request.ExpiringSoon == true)
        {
            var cutoff = DateTime.UtcNow.Date.AddDays(30);
            q = q.Where(x => x.BidContractStatus == BidContractStatus.Active && x.ContractEndDate <= cutoff);
        }

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(x => x.ContractStartDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        return new PaginatedResult<BidContractDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public async Task<List<BidContractLookupDto>> Handle(GetActiveBidContractsLookupQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var items = await _db.BidContracts.AsNoTracking()
            .Include(x => x.BidLot)
            .Include(x => x.WinningParty)
            .Where(x => x.TenantId == _tenant.TenantId && x.BidContractStatus == BidContractStatus.Active)
            .OrderBy(x => x.ContractNo)
            .ToListAsync(ct);

        return items.Select(c => new BidContractLookupDto(
            c.Id, c.ContractNo, c.ContractName,
            c.BidLotId, c.BidLot?.LotNo, c.BidLot?.LotName,
            c.WinningPartyId, c.WinningParty?.Name ?? "", c.WinningParty?.Code ?? "",
            c.ContractValue, c.UsedValue, c.ContractValue - c.UsedValue,
            c.ContractStartDate, c.ContractEndDate,
            (int)(c.ContractEndDate - DateTime.UtcNow.Date).TotalDays,
            c.BidContractStatus.ToString().ToUpperInvariant()
        )).ToList();
    }

    public static BidContractDto ToDto(BidContract c) =>
        new(c.Id, c.ContractNo, c.ContractName,
            c.BidLotId, c.BidLot?.LotNo, c.BidLot?.LotName,
            c.WinningPartyId, c.WinningParty?.Name, c.WinningParty?.Code,
            c.ContractValue, c.ContractStartDate, c.ContractEndDate,
            c.UsedValue, c.ContractValue - c.UsedValue,
            (int)(c.ContractEndDate - DateTime.UtcNow.Date).TotalDays,
            c.BidContractStatus.ToString().ToUpperInvariant(),
            c.PaymentTerms, c.AdvancePaymentPct, c.RetentionPct, c.WarrantyMonths,
            c.SigningDate, c.Notes, c.CreatedAt, c.UpdatedAt);
}

public class BidContractCommandHandler :
    IRequestHandler<CreateBidContractCommand, BidContractDto>,
    IRequestHandler<UpdateBidContractCommand, BidContractDto>,
    IRequestHandler<DeleteBidContractCommand, Unit>,
    IRequestHandler<TerminateBidContractCommand, BidContractDto>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public BidContractCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<BidContractDto> Handle(CreateBidContractCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;
        if (r.ContractValue <= 0) throw new ValidationException("Giá trị hợp đồng phải > 0");
        if (r.ContractEndDate < r.ContractStartDate)
            throw new ValidationException("Ngày kết thúc phải sau ngày bắt đầu");

        var lot = await _db.BidLots.FirstOrDefaultAsync(x => x.Id == r.BidLotId && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidLot {r.BidLotId} không tồn tại");
        if (lot.ContractId != null) throw new BusinessRuleException("Lô thầu này đã có hợp đồng");

        var party = await _db.Parties.FirstOrDefaultAsync(p => p.Id == r.WinningPartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.WinningPartyId} không tồn tại");

        var year = r.ContractStartDate.Year;
        var prefix = $"HĐ-{year}-";
        var count = await _db.BidContracts.CountAsync(c => c.TenantId == _tenant.TenantId && c.ContractNo.StartsWith(prefix), ct);

        var entity = new BidContract
        {
            TenantId = _tenant.TenantId!.Value,
            BidLotId = r.BidLotId,
            ContractNo = string.IsNullOrEmpty(r.ContractNo) ? $"{prefix}{(count + 1).ToString("D4")}" : r.ContractNo,
            ContractName = r.ContractName,
            WinningPartyId = r.WinningPartyId,
            ContractValue = r.ContractValue,
            ContractStartDate = r.ContractStartDate,
            ContractEndDate = r.ContractEndDate,
            PaymentTerms = r.PaymentTerms,
            AdvancePaymentPct = r.AdvancePaymentPct,
            RetentionPct = r.RetentionPct,
            WarrantyMonths = r.WarrantyMonths,
            SigningDate = r.SigningDate,
            Notes = r.Notes,
            BidContractStatus = BidContractStatus.Active,
            CreatedBy = _tenant.UserId,
        };
        _db.BidContracts.Add(entity);
        await _db.SaveChangesAsync(ct);
        // Trigger sẽ set lot.contract_id
        await _db.Entry(lot).ReloadAsync(ct);
        return BidContractQueryHandler.ToDto(entity);
    }

    public async Task<BidContractDto> Handle(UpdateBidContractCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.BidContracts.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {request.Id} không tồn tại");
        if (c.BidContractStatus == BidContractStatus.Terminated)
            throw new BusinessRuleException("HĐ thầu đã bị terminate, không sửa được");

        var r = request.Request;
        c.ContractName = r.ContractName;
        if (r.ContractValue > 0) c.ContractValue = r.ContractValue;
        c.ContractStartDate = r.ContractStartDate;
        c.ContractEndDate = r.ContractEndDate;
        c.PaymentTerms = r.PaymentTerms;
        c.AdvancePaymentPct = r.AdvancePaymentPct;
        c.RetentionPct = r.RetentionPct;
        c.WarrantyMonths = r.WarrantyMonths;
        c.SigningDate = r.SigningDate;
        c.Notes = r.Notes;
        await _db.SaveChangesAsync(ct);
        return BidContractQueryHandler.ToDto(c);
    }

    public async Task<Unit> Handle(DeleteBidContractCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.BidContracts.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {request.Id} không tồn tại");
        if (c.UsedValue > 0) throw new BusinessRuleException("HĐ thầu đã phát sinh PO/GRN, không thể xóa (chỉ terminate)");
        if (c.BidContractStatus == BidContractStatus.Active)
            throw new BusinessRuleException("HĐ thầu đang ACTIVE, không thể xóa");
        _db.BidContracts.Remove(c);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<BidContractDto> Handle(TerminateBidContractCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var c = await _db.BidContracts.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"BidContract {request.Id} không tồn tại");
        if (c.BidContractStatus == BidContractStatus.Terminated)
            throw new BusinessRuleException("HĐ thầu đã bị terminate");

        c.BidContractStatus = BidContractStatus.Terminated;
        c.Notes = (c.Notes ?? "") + $"\n[TERMINATED] {request.Request.Reason}";
        await _db.SaveChangesAsync(ct);
        return BidContractQueryHandler.ToDto(c);
    }
}
