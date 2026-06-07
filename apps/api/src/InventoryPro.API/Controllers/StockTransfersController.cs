using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Exceptions;
using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Inventory.Transfers;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/stock-transfers")]
[Produces("application/json")]
public class StockTransfersController : ControllerBase
{
    private readonly IMediator _mediator;
    public StockTransfersController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] Guid? fromBranchId = null,
        [FromQuery] Guid? toBranchId = null,
        [FromQuery] Guid? fromWarehouseId = null,
        [FromQuery] Guid? toWarehouseId = null,
        [FromQuery] string? status = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListStockTransfersQuery(page, pageSize, search, fromBranchId, toBranchId, fromWarehouseId, toWarehouseId, status, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<StockTransferDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetStockTransferByIdQuery(id), ct);
        return Ok(ApiResponse<StockTransferDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStockTransferRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateStockTransferCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<StockTransferDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStockTransferRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateStockTransferCommand(id, request), ct);
        return Ok(ApiResponse<StockTransferDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteStockTransferCommand(id), ct);
        return NoContent();
    }

    /// <summary>Ship: tạo TRANSFER_OUT movements (xuất khỏi kho nguồn).</summary>
    [HttpPost("{id:guid}/ship")]
    public async Task<IActionResult> Ship(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new ShipStockTransferCommand(id), ct);
        return Ok(ApiResponse<StockTransferDto>.Ok(result));
    }

    /// <summary>Receive: tạo TRANSFER_IN movements (nhập vào kho đích).</summary>
    [HttpPost("{id:guid}/receive")]
    public async Task<IActionResult> Receive(Guid id, [FromBody] ReceiveStockTransferRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new ReceiveStockTransferCommand(id, request), ct);
        return Ok(ApiResponse<StockTransferDto>.Ok(result));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelStockTransferRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CancelStockTransferCommand(id, request.Reason), ct);
        return Ok(ApiResponse<StockTransferDto>.Ok(result));
    }
}

public record CancelStockTransferRequest(string Reason);
