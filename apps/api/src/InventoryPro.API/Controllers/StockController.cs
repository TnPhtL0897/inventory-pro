using InventoryPro.API.Middleware;
using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Inventory.Stock;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/stock")]
[Produces("application/json")]
public class StockController : ControllerBase
{
    private readonly IMediator _mediator;

    public StockController(IMediator mediator) => _mediator = mediator;

    /// <summary>Lấy tồn kho hiện tại (filter theo branch/warehouse/product).</summary>
    [HttpGet]
    public async Task<IActionResult> ListStock(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] Guid? branchId = null,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] Guid? productId = null,
        [FromQuery] Guid? categoryId = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListStockQuery(page, pageSize, branchId, warehouseId, productId, categoryId), ct);
        return Ok(ApiResponse<PaginatedResult<StockLevelDto>>.Ok(result));
    }

    /// <summary>Lấy lịch sử stock movements.</summary>
    [HttpGet("movements")]
    public async Task<IActionResult> ListMovements(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] Guid? branchId = null,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] Guid? productId = null,
        [FromQuery] string? movementType = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListMovementsQuery(page, pageSize, branchId, warehouseId, productId, movementType, dateFrom, dateTo), ct);
        return Ok(ApiResponse<PaginatedResult<StockMovementDto>>.Ok(result));
    }

    /// <summary>
    /// Ghi 1 stock movement (IN/OUT/ADJUST...). BẮT BUỘC có header Idempotency-Key.
    /// Cùng key + payload → cùng response (an toàn retry).
    /// </summary>
    [HttpPost("movements")]
    [ProducesResponseType(typeof(ApiResponse<StockMovementDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<StockMovementDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<StockMovementDto>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RecordMovement([FromBody] RecordMovementRequest request, CancellationToken ct)
    {
        if (!Request.Headers.TryGetValue(IdempotencyMiddleware.HeaderName, out var keyValues) ||
            !Guid.TryParse(keyValues.ToString(), out var idempotencyKey))
        {
            return BadRequest(ApiResponse<StockMovementDto>.Fail(
                "MISSING_IDEMPOTENCY_KEY",
                $"Phải có header '{IdempotencyMiddleware.HeaderName}' với UUID hợp lệ"));
        }

        var result = await _mediator.Send(new RecordMovementCommand(request, idempotencyKey), ct);
        return StatusCode(StatusCodes.Status201Created, ApiResponse<StockMovementDto>.Ok(result));
    }
}
