using InventoryPro.Application.Bidding;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/purchase-requests")]
[Produces("application/json")]
public class PurchaseRequestsController : ControllerBase
{
    private readonly IMediator _mediator;
    public PurchaseRequestsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] Guid? branchId = null, [FromQuery] Guid? bidPlanId = null,
        [FromQuery] string? status = null, [FromQuery] int? fiscalYear = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListPurchaseRequestsQuery(page, pageSize, branchId, bidPlanId, status, fiscalYear), ct);
        return Ok(ApiResponse<PaginatedResult<PurchaseRequestDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetPurchaseRequestByIdQuery(id), ct);
        return Ok(ApiResponse<PurchaseRequestDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseRequestRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreatePurchaseRequestCommand(req), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<PurchaseRequestDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePurchaseRequestRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdatePurchaseRequestCommand(id, req), ct);
        return Ok(ApiResponse<PurchaseRequestDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeletePurchaseRequestCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new SubmitPurchaseRequestCommand(id), ct);
        return Ok(ApiResponse<PurchaseRequestDto>.Ok(result));
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApprovePurchaseRequestRequest? body, CancellationToken ct)
    {
        var result = await _mediator.Send(new ApprovePurchaseRequestCommand(id, body?.Notes), ct);
        return Ok(ApiResponse<PurchaseRequestDto>.Ok(result));
    }
}
