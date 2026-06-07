using InventoryPro.Application.Bidding;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/bid-lots")]
[Produces("application/json")]
public class BidLotsController : ControllerBase
{
    private readonly IMediator _mediator;
    public BidLotsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] Guid? bidPackageId = null, [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListBidLotsQuery(page, pageSize, bidPackageId, status), ct);
        return Ok(ApiResponse<PaginatedResult<BidLotDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetBidLotByIdQuery(id), ct);
        return Ok(ApiResponse<BidLotDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBidLotRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateBidLotCommand(req), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<BidLotDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBidLotRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateBidLotCommand(id, req), ct);
        return Ok(ApiResponse<BidLotDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteBidLotCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new PublishBidLotCommand(id), ct);
        return Ok(ApiResponse<BidLotDto>.Ok(result));
    }

    [HttpPost("{id:guid}/bidders")]
    public async Task<IActionResult> AddBidder(Guid id, [FromBody] AddBidderRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new AddBidderCommand(id, req), ct);
        return Ok(ApiResponse<BidLotDto>.Ok(result));
    }

    [HttpDelete("{id:guid}/bidders/{bidderId:guid}")]
    public async Task<IActionResult> RemoveBidder(Guid id, Guid bidderId, CancellationToken ct)
    {
        await _mediator.Send(new RemoveBidderCommand(id, bidderId), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/award")]
    public async Task<IActionResult> Award(Guid id, [FromBody] AwardBidLotRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new AwardBidLotCommand(id, req), ct);
        return Ok(ApiResponse<BidLotDto>.Ok(result));
    }
}
