using InventoryPro.Application.Bidding;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/bid-packages")]
[Produces("application/json")]
public class BidPackagesController : ControllerBase
{
    private readonly IMediator _mediator;
    public BidPackagesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] Guid? bidPlanId = null, [FromQuery] string? status = null, [FromQuery] string? type = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListBidPackagesQuery(page, pageSize, bidPlanId, status, type), ct);
        return Ok(ApiResponse<PaginatedResult<BidPackageDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetBidPackageByIdQuery(id), ct);
        return Ok(ApiResponse<BidPackageDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBidPackageRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateBidPackageCommand(req), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<BidPackageDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBidPackageRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateBidPackageCommand(id, req), ct);
        return Ok(ApiResponse<BidPackageDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteBidPackageCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, [FromBody] PublishBidPackageRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new PublishBidPackageCommand(id, req), ct);
        return Ok(ApiResponse<BidPackageDto>.Ok(result));
    }
}
