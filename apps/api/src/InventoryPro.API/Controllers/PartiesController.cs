using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Parties;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/parties")]
[Produces("application/json")]
public class PartiesController : ControllerBase
{
    private readonly IMediator _mediator;

    public PartiesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? partyType = null,
        [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListPartiesQuery(page, pageSize, search, partyType, status), ct);
        return Ok(ApiResponse<PaginatedResult<PartyDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetPartyByIdQuery(id), ct);
        return Ok(ApiResponse<PartyDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePartyRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreatePartyCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<PartyDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePartyRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdatePartyCommand(id, request), ct);
        return Ok(ApiResponse<PartyDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeletePartyCommand(id), ct);
        return NoContent();
    }

    // SupplierProduct endpoints
    [HttpGet("{partyId:guid}/products")]
    public async Task<IActionResult> ListSupplierProducts(Guid partyId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListSupplierProductsQuery(partyId, page, pageSize), ct);
        return Ok(ApiResponse<PaginatedResult<SupplierProductDto>>.Ok(result));
    }

    [HttpPost("{partyId:guid}/products")]
    public async Task<IActionResult> AddSupplierProduct(Guid partyId, [FromBody] CreateSupplierProductRequest request, CancellationToken ct)
    {
        // Force partyId từ URL khớp với body để bảo mật
        var req = request with { PartyId = partyId };
        var result = await _mediator.Send(new CreateSupplierProductCommand(req), ct);
        return Created("", ApiResponse<SupplierProductDto>.Ok(result));
    }

    [HttpDelete("products/{id:guid}")]
    public async Task<IActionResult> RemoveSupplierProduct(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteSupplierProductCommand(id), ct);
        return NoContent();
    }
}
