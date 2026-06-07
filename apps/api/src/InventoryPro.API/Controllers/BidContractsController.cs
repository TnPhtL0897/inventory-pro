using InventoryPro.Application.Bidding;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/bid-contracts")]
[Produces("application/json")]
public class BidContractsController : ControllerBase
{
    private readonly IMediator _mediator;
    public BidContractsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] Guid? bidLotId = null, [FromQuery] Guid? winningPartyId = null,
        [FromQuery] string? status = null, [FromQuery] bool? expiringSoon = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListBidContractsQuery(page, pageSize, bidLotId, winningPartyId, status, expiringSoon), ct);
        return Ok(ApiResponse<PaginatedResult<BidContractDto>>.Ok(result));
    }

    [HttpGet("active-lookup")]
    public async Task<IActionResult> GetActiveLookup(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetActiveBidContractsLookupQuery(), ct);
        return Ok(ApiResponse<List<BidContractLookupDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetBidContractByIdQuery(id), ct);
        return Ok(ApiResponse<BidContractDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBidContractRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateBidContractCommand(req), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<BidContractDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBidContractRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateBidContractCommand(id, req), ct);
        return Ok(ApiResponse<BidContractDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteBidContractCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/terminate")]
    public async Task<IActionResult> Terminate(Guid id, [FromBody] TerminateBidContractRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new TerminateBidContractCommand(id, req), ct);
        return Ok(ApiResponse<BidContractDto>.Ok(result));
    }
}
