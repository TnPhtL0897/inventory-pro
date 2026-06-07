using System.Security.Claims;
using InventoryPro.API.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InventoryPro.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class AuthController : ControllerBase
{
    /// <summary>
    /// Lấy thông tin user hiện tại (từ JWT).
    /// </summary>
    [HttpGet("me")]
    public IActionResult Me()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        var email = User.FindFirst(ClaimTypes.Email)?.Value
            ?? User.FindFirst("email")?.Value;
        var fullName = User.FindFirst("full_name")?.Value;
        var role = User.FindFirst("role")?.Value;
        var tenantId = User.FindFirst("tenant_id")?.Value;
        var branchIds = User.FindAll("branch_id").Select(c => c.Value).ToList();

        return Ok(new
        {
            success = true,
            data = new
            {
                userId,
                email,
                fullName,
                role,
                tenantId,
                branchIds,
            },
        });
    }
}
