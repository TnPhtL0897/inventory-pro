using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Purchasing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/purchase-orders")]
[Produces("application/json")]
public class PurchaseOrdersController : ControllerBase
{
    private readonly IMediator _mediator;
    public PurchaseOrdersController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] Guid? partyId = null,
        [FromQuery] Guid? branchId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListPurchaseOrdersQuery(page, pageSize, search, partyId, branchId, status, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<PurchaseOrderDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetPurchaseOrderByIdQuery(id), ct);
        return Ok(ApiResponse<PurchaseOrderDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseOrderRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreatePurchaseOrderCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<PurchaseOrderDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePurchaseOrderRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdatePurchaseOrderCommand(id, request), ct);
        return Ok(ApiResponse<PurchaseOrderDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeletePurchaseOrderCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApprovePurchaseOrderRequest? body, CancellationToken ct)
    {
        var result = await _mediator.Send(new ApprovePurchaseOrderCommand(id, body?.Notes), ct);
        return Ok(ApiResponse<PurchaseOrderDto>.Ok(result));
    }

    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new PostPurchaseOrderCommand(id), ct);
        return Ok(ApiResponse<PurchaseOrderDto>.Ok(result));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelPurchaseOrderRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CancelPurchaseOrderCommand(id, request.Reason), ct);
        return Ok(ApiResponse<PurchaseOrderDto>.Ok(result));
    }
}
