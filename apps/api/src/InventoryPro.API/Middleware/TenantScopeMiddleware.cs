using System.Security.Claims;
using InventoryPro.Application.Common.Tenancy;

namespace InventoryPro.API.Middleware;

/// <summary>
/// Extract tenant_id và branch_ids từ JWT, inject vào HttpContext.Items
/// + TenantContext scoped service.
/// </summary>
public class TenantScopeMiddleware
{
    public const string TenantIdItemKey = "TenantId";
    public const string UserIdItemKey = "UserId";
    public const string BranchIdsItemKey = "BranchIds";
    public const string RoleItemKey = "Role";

    private readonly RequestDelegate _next;

    public TenantScopeMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, TenantContext tenantContext)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var tenantId = context.User.FindFirst("tenant_id")?.Value;
            var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? context.User.FindFirst("sub")?.Value;
            var branchIds = context.User.FindAll("branch_id").Select(c => c.Value).ToList();
            var role = context.User.FindFirst("role")?.Value;

            if (!string.IsNullOrEmpty(tenantId) && Guid.TryParse(tenantId, out var tid))
            {
                tenantContext.TenantId = tid;
                context.Items[TenantIdItemKey] = tid;
            }
            if (!string.IsNullOrEmpty(userId) && Guid.TryParse(userId, out var uid))
            {
                tenantContext.UserId = uid;
                context.Items[UserIdItemKey] = uid;
            }
            if (branchIds.Count > 0)
            {
                var bIds = branchIds.Select(Guid.Parse).ToList();
                tenantContext.BranchIds = bIds;
                context.Items[BranchIdsItemKey] = bIds;
            }
            if (!string.IsNullOrEmpty(role))
            {
                tenantContext.Role = role;
                context.Items[RoleItemKey] = role;
            }
        }

        await _next(context);
    }
}
