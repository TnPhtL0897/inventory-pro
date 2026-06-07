using InventoryPro.Application.Common.Models;
using InventoryPro.Application.Inventory.Warehouses;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/locations")]
[Produces("application/json")]
public class LocationsController : ControllerBase
{
    private readonly IMediator _mediator;
    public LocationsController(IMediator mediator) => _mediator = mediator;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100,
        [FromQuery] Guid? warehouseId = null,
        [FromQuery] Guid? parentId = null,
        [FromQuery] string? locationType = null,
        [FromQuery] bool? isPickable = null,
        [FromQuery] string? status = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new ListLocationsQuery(page, pageSize, warehouseId, parentId, locationType, isPickable, status), ct);
        return Ok(ApiResponse<PaginatedResult<LocationDto>>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await _mediator.Send(new GetLocationByIdQuery(id), ct);
        return Ok(ApiResponse<LocationDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLocationRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new CreateLocationCommand(request), ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, ApiResponse<LocationDto>.Ok(result));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateLocationRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new UpdateLocationCommand(id, request), ct);
        return Ok(ApiResponse<LocationDto>.Ok(result));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteLocationCommand(id), ct);
        return NoContent();
    }
}
