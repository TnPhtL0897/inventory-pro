using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Inventory.StockTakes;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/stock-takes")]
[Produces("application/json")]
public class StockTakesController : ControllerBase
{
    private readonly IMediator _mediator;
    public StockTakesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] Guid? branchId = null,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListStockTakesQuery(page, pageSize, search, branchId, warehouseId, status, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<StockTakeDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetStockTakeByIdQuery(id), ct);
        return Ok(ApiResponse<StockTakeDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStockTakeRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateStockTakeCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<StockTakeDto>.Ok(result));
    }

    /// <summary>Bulk update số đếm cho nhiều dòng.</summary>
    [HttpPut("{id:guid}/counts")]
    public async Task<IActionResult> UpdateCounts(Guid id, [FromBody] BulkUpdateCountedQtyRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateCountedQtyCommand(id, request), ct);
        return Ok(ApiResponse<StockTakeDto>.Ok(result));
    }

    /// <summary>Post = tạo ADJUST_IN/OUT movements dựa trên variance.</summary>
    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new PostStockTakeCommand(id), ct);
        return Ok(ApiResponse<StockTakeDto>.Ok(result));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelStockTakeRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CancelStockTakeCommand(id, request.Reason), ct);
        return Ok(ApiResponse<StockTakeDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteStockTakeCommand(id), ct);
        return NoContent();
    }
}
