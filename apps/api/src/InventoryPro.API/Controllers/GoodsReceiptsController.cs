using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Purchasing;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/goods-receipts")]
[Produces("application/json")]
public class GoodsReceiptsController : ControllerBase
{
    private readonly IMediator _mediator;
    public GoodsReceiptsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] Guid? partyId = null,
        [FromQuery] Guid? purchaseOrderId = null,
        [FromQuery] Guid? branchId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListGoodsReceiptsQuery(page, pageSize, search, partyId, purchaseOrderId, branchId, status, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<GoodsReceiptDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetGoodsReceiptByIdQuery(id), ct);
        return Ok(ApiResponse<GoodsReceiptDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGoodsReceiptRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateGoodsReceiptCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<GoodsReceiptDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGoodsReceiptRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateGoodsReceiptCommand(id, request), ct);
        return Ok(ApiResponse<GoodsReceiptDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteGoodsReceiptCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new PostGoodsReceiptCommand(id), ct);
        return Ok(ApiResponse<GoodsReceiptDto>.Ok(result));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelGoodsReceiptRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CancelGoodsReceiptCommand(id, request.Reason), ct);
        return Ok(ApiResponse<GoodsReceiptDto>.Ok(result));
    }
}
