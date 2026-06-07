using InventoryPro.Application.Catalog;
using InventoryPro.Application.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/units")]
[Produces("application/json")]
public class UnitsController : ControllerBase
{
    private readonly IMediator _mediator;
    public UnitsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] bool? isActive = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new ListUnitsQuery(page, pageSize, isActive), ct);
        return Ok(ApiResponse<PaginatedResult<UnitOfMeasureDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetUnitByIdQuery(id), ct);
        return Ok(ApiResponse<UnitOfMeasureDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUnitRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateUnitCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<UnitOfMeasureDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUnitRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateUnitCommand(id, request), ct);
        return Ok(ApiResponse<UnitOfMeasureDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteUnitCommand(id), ct);
        return NoContent();
    }
}
