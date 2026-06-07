using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Domain.Parties;
using InventoryPro.Infrastructure.Persistence;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace InventoryPro.Application.Parties;

// =============================================================================
// Queries
// =============================================================================
public record GetPartyByIdQuery(Guid Id) : IRequest<PartyDto>;
public record ListPartiesQuery(int Page = 1, int PageSize = 20, string? Search = null, string? PartyType = null, string? Status = null) : IRequest<PaginatedResult<PartyDto>>;

// =============================================================================
// Commands
// =============================================================================
public record CreatePartyCommand(CreatePartyRequest Request) : IRequest<PartyDto>;
public record UpdatePartyCommand(Guid Id, UpdatePartyRequest Request) : IRequest<PartyDto>;
public record DeletePartyCommand(Guid Id) : IRequest<Unit>;

// =============================================================================
// Handlers
// =============================================================================
public class PartyQueryHandler :
    IRequestHandler<GetPartyByIdQuery, PartyDto>,
    IRequestHandler<ListPartiesQuery, PaginatedResult<PartyDto>>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PartyQueryHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PartyDto> Handle(GetPartyByIdQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Parties
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {request.Id} không tồn tại");
        return ToDto(entity);
    }

    public async Task<PaginatedResult<PartyDto>> Handle(ListPartiesQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.Parties.AsNoTracking().Where(p => p.TenantId == _tenant.TenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(p => p.Name.ToLower().Contains(s) || p.Code.ToLower().Contains(s) || (p.TaxCode != null && p.TaxCode.ToLower().Contains(s)));
        }
        if (!string.IsNullOrEmpty(request.PartyType))
        {
            var pt = Enum.Parse<PartyType>(request.PartyType, ignoreCase: true);
            q = q.Where(p => p.PartyType == pt);
        }
        if (!string.IsNullOrEmpty(request.Status))
        {
            var st = Enum.Parse<PartyStatus>(request.Status, ignoreCase: true);
            q = q.Where(p => p.Status == st);
        }

        var total = await q.CountAsync(ct);
        var items = await q
            .OrderBy(p => p.Name)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        return new PaginatedResult<PartyDto>
        {
            Items = items.Select(ToDto).ToList(),
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    private static PartyDto ToDto(Party p) => new(
        p.Id, p.PartyType.ToString().ToUpperInvariant(), p.Code, p.Name, p.TaxCode,
        p.ContactName, p.ContactEmail, p.ContactPhone, p.Address, p.City, p.Country,
        p.PaymentTerms, p.CreditLimit, p.BankAccount, p.BankName, p.Notes,
        p.Status.ToString().ToUpperInvariant(), p.CreatedAt, p.UpdatedAt);
}

public class PartyCommandHandler :
    IRequestHandler<CreatePartyCommand, PartyDto>,
    IRequestHandler<UpdatePartyCommand, PartyDto>,
    IRequestHandler<DeletePartyCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public PartyCommandHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PartyDto> Handle(CreatePartyCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;

        var codeExists = await _db.Parties.AnyAsync(p => p.TenantId == _tenant.TenantId && p.Code == r.Code, ct);
        if (codeExists) throw new ConflictException($"Mã đối tác '{r.Code}' đã tồn tại");

        if (!string.IsNullOrEmpty(r.TaxCode))
        {
            var taxExists = await _db.Parties.AnyAsync(p => p.TenantId == _tenant.TenantId && p.TaxCode == r.TaxCode, ct);
            if (taxExists) throw new ConflictException($"Mã số thuế '{r.TaxCode}' đã tồn tại");
        }

        var entity = new Party
        {
            TenantId = _tenant.TenantId!.Value,
            PartyType = Enum.TryParse<PartyType>(r.PartyType, true, out var pt) ? pt : PartyType.Supplier,
            Code = r.Code,
            Name = r.Name,
            TaxCode = r.TaxCode,
            ContactName = r.ContactName,
            ContactEmail = r.ContactEmail,
            ContactPhone = r.ContactPhone,
            Address = r.Address,
            City = r.City,
            Country = r.Country ?? "VN",
            PaymentTerms = r.PaymentTerms ?? 0,
            CreditLimit = r.CreditLimit ?? 0,
            BankAccount = r.BankAccount,
            BankName = r.BankName,
            Notes = r.Notes,
            CreatedBy = _tenant.UserId,
        };
        _db.Parties.Add(entity);
        await _db.SaveChangesAsync(ct);
        return entity.Adapt<PartyDto>();
    }

    public async Task<PartyDto> Handle(UpdatePartyCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {request.Id} không tồn tại");

        var r = request.Request;
        if (!string.IsNullOrEmpty(r.Name)) entity.Name = r.Name;
        if (r.TaxCode != null && r.TaxCode != entity.TaxCode)
        {
            var exists = await _db.Parties.AnyAsync(p => p.TenantId == _tenant.TenantId && p.TaxCode == r.TaxCode && p.Id != request.Id, ct);
            if (exists) throw new ConflictException($"Mã số thuế '{r.TaxCode}' đã tồn tại");
            entity.TaxCode = r.TaxCode;
        }
        if (r.ContactName != null) entity.ContactName = r.ContactName;
        if (r.ContactEmail != null) entity.ContactEmail = r.ContactEmail;
        if (r.ContactPhone != null) entity.ContactPhone = r.ContactPhone;
        if (r.Address != null) entity.Address = r.Address;
        if (r.City != null) entity.City = r.City;
        if (!string.IsNullOrEmpty(r.Country)) entity.Country = r.Country;
        if (r.PaymentTerms.HasValue) entity.PaymentTerms = r.PaymentTerms.Value;
        if (r.CreditLimit.HasValue) entity.CreditLimit = r.CreditLimit.Value;
        if (r.BankAccount != null) entity.BankAccount = r.BankAccount;
        if (r.BankName != null) entity.BankName = r.BankName;
        if (r.Notes != null) entity.Notes = r.Notes;
        if (!string.IsNullOrEmpty(r.Status) && Enum.TryParse<PartyStatus>(r.Status, true, out var s)) entity.Status = s;

        await _db.SaveChangesAsync(ct);
        return entity.Adapt<PartyDto>();
    }

    public async Task<Unit> Handle(DeletePartyCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.Parties
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {request.Id} không tồn tại");

        // Soft check: nếu đang có supplier mapping, archive thay vì xóa
        var hasLinks = await _db.SupplierProducts.AnyAsync(sp => sp.PartyId == request.Id, ct);
        if (hasLinks)
        {
            entity.Status = PartyStatus.Inactive;
            await _db.SaveChangesAsync(ct);
            return Unit.Value;
        }
        _db.Parties.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// =============================================================================
// SupplierProduct handlers
// =============================================================================
public record ListSupplierProductsQuery(Guid PartyId, int Page = 1, int PageSize = 50) : IRequest<PaginatedResult<SupplierProductDto>>;
public record CreateSupplierProductCommand(CreateSupplierProductRequest Request) : IRequest<SupplierProductDto>;
public record DeleteSupplierProductCommand(Guid Id) : IRequest<Unit>;

public class SupplierProductHandler :
    IRequestHandler<ListSupplierProductsQuery, PaginatedResult<SupplierProductDto>>,
    IRequestHandler<CreateSupplierProductCommand, SupplierProductDto>,
    IRequestHandler<DeleteSupplierProductCommand, Unit>
{
    private readonly InventoryDbContext _db;
    private readonly TenantContext _tenant;

    public SupplierProductHandler(InventoryDbContext db, TenantContext tenant) { _db = db; _tenant = tenant; }

    public async Task<PaginatedResult<SupplierProductDto>> Handle(ListSupplierProductsQuery request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var q = _db.SupplierProducts.AsNoTracking()
            .Where(sp => sp.TenantId == _tenant.TenantId && sp.PartyId == request.PartyId);

        var total = await q.CountAsync(ct);
        var items = await q
            .Join(_db.Products, sp => sp.ProductId, p => p.Id, (sp, p) => new { sp, p })
            .OrderBy(x => x.p.Name)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new SupplierProductDto(
                x.sp.Id, x.sp.PartyId, x.sp.ProductId, x.p.Sku, x.p.Name,
                x.sp.SupplierSku, x.sp.CostPrice, x.sp.MinOrderQty, x.sp.LeadTimeDays,
                x.sp.IsPreferred, x.sp.Notes))
            .ToListAsync(ct);

        return new PaginatedResult<SupplierProductDto>
        {
            Items = items,
            Total = total,
            Page = request.Page,
            PageSize = request.PageSize,
        };
    }

    public async Task<SupplierProductDto> Handle(CreateSupplierProductCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var r = request.Request;

        // Validate party tồn tại và là supplier/both
        var party = await _db.Parties.FirstOrDefaultAsync(p => p.Id == r.PartyId && p.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"Party {r.PartyId} không tồn tại");
        if (party.PartyType == PartyType.Customer)
            throw new BusinessRuleException("Đối tác này là khách hàng, không thể thêm làm nhà cung cấp");

        // Validate product tồn tại
        var productExists = await _db.Products.AnyAsync(p => p.Id == r.ProductId && p.TenantId == _tenant.TenantId, ct);
        if (!productExists) throw new NotFoundException($"Product {r.ProductId} không tồn tại");

        var entity = new SupplierProduct
        {
            TenantId = _tenant.TenantId!.Value,
            PartyId = r.PartyId,
            ProductId = r.ProductId,
            SupplierSku = r.SupplierSku,
            CostPrice = r.CostPrice,
            MinOrderQty = r.MinOrderQty <= 0 ? 1 : r.MinOrderQty,
            LeadTimeDays = r.LeadTimeDays,
            IsPreferred = r.IsPreferred,
            Notes = r.Notes,
        };
        _db.SupplierProducts.Add(entity);
        await _db.SaveChangesAsync(ct);

        var product = await _db.Products.AsNoTracking().FirstAsync(p => p.Id == r.ProductId, ct);
        return new SupplierProductDto(entity.Id, entity.PartyId, entity.ProductId, product.Sku, product.Name,
            entity.SupplierSku, entity.CostPrice, entity.MinOrderQty, entity.LeadTimeDays, entity.IsPreferred, entity.Notes);
    }

    public async Task<Unit> Handle(DeleteSupplierProductCommand request, CancellationToken ct)
    {
        _tenant.EnsureAuthenticated();
        var entity = await _db.SupplierProducts
            .FirstOrDefaultAsync(sp => sp.Id == request.Id && sp.TenantId == _tenant.TenantId, ct)
            ?? throw new NotFoundException($"SupplierProduct {request.Id} không tồn tại");
        _db.SupplierProducts.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
