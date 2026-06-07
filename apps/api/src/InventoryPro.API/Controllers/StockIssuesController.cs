using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Inventory.Issues;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/stock-issues")]
[Produces("application/json")]
public class StockIssuesController : ControllerBase
{
    private readonly IMediator _mediator;
    public StockIssuesController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null, [FromQuery] Guid? partyId = null,
        [FromQuery] Guid? branchId = null, [FromQuery] Guid? warehouseId = null,
        [FromQuery] string? purpose = null, [FromQuery] string? status = null,
        [FromQuery] DateTime? dateFrom = null, [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListStockIssuesQuery(page, pageSize, search, partyId, branchId, warehouseId, purpose, status, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<StockIssueDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetStockIssueByIdQuery(id), ct);
        return Ok(ApiResponse<StockIssueDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStockIssueRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateStockIssueCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<StockIssueDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStockIssueRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateStockIssueCommand(id, request), ct);
        return Ok(ApiResponse<StockIssueDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteStockIssueCommand(id), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/post")]
    public async Task<IActionResult> Post(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new PostStockIssueCommand(id), ct);
        return Ok(ApiResponse<StockIssueDto>.Ok(result));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelStockIssueRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CancelStockIssueCommand(id, request.Reason), ct);
        return Ok(ApiResponse<StockIssueDto>.Ok(result));
    }
}
