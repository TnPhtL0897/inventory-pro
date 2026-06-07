using InventoryPro.Application.Bidding;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/bid-plans")]
[Produces("application/json")]
public class BidPlansController : ControllerBase
{
    private readonly IMediator _mediator;
    public BidPlansController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] int? fiscalYear = null, [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListBidPlansQuery(page, pageSize, fiscalYear, status), ct);
        return Ok(ApiResponse<PaginatedResult<BidPlanDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetBidPlanByIdQuery(id), ct);
        return Ok(ApiResponse<BidPlanDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBidPlanRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateBidPlanCommand(req), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<BidPlanDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBidPlanRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateBidPlanCommand(id, req), ct);
        return Ok(ApiResponse<BidPlanDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteBidPlanCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveBidPlanRequest? body, CancellationToken ct)
    {
        var result = await _mediator.Send(new ApproveBidPlanCommand(id, body?.Notes), ct);
        return Ok(ApiResponse<BidPlanDto>.Ok(result));
    }
}
