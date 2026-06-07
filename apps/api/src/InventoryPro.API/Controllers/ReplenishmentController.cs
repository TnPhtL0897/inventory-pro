using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Replenishment;
using InventoryPro.Domain.Replenishment;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

/// <summary>
/// API Dự trù cuối tháng cho kho chẵn (RECEIVING).
/// Workflow:
///   1. POST /preview  → xem trước danh sách gợi ý bổ sung (dry-run, không save gì)
///   2. POST /run      → chạy thật, tạo 1 PurchaseRequest DRAFT nếu SaveAsPurchaseRequest=true
///   3. GET  /runs     → xem lịch sử chạy (theo tháng)
/// Idempotency: 1 tenant chỉ chạy được 1 lần / tháng (UNIQUE constraint + handler check).
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/replenishment")]
[Produces("application/json")]
public class ReplenishmentController : ControllerBase
{
    private readonly IMediator _mediator;
    public ReplenishmentController(IMediator mediator) => _mediator = mediator;

    /// <summary>Preview - xem trước các dòng đề xuất bổ sung (không save).</summary>
    [HttpPost("preview")]
    public async Task<IActionResult> Preview([FromBody] RunReplenishmentRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new PreviewReplenishmentQuery(request), ct);
        return Ok(ApiResponse<ForecastPreviewDto>.Ok(result));
    }

    /// <summary>Run - chạy thật, tạo PurchaseRequest DRAFT nếu request.SaveAsPurchaseRequest = true.</summary>
    [HttpPost("run")]
    public async Task<IActionResult> Run([FromBody] RunReplenishmentRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new RunReplenishmentCommand(request, ReplenishmentRunType.Manual), ct);
        return Ok(ApiResponse<MonthEndForecastRunDto>.Ok(result));
    }

    /// <summary>Lịch sử chạy dự trù (filter theo năm).</summary>
    [HttpGet("runs")]
    public async Task<IActionResult> ListRuns(
        [FromQuery] int? year,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListReplenishmentRunsQuery(year, page, pageSize), ct);
        return Ok(ApiResponse<PaginatedResult<MonthEndForecastRunDto>>.Ok(result));
    }
}
