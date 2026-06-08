using InventoryPro.Application.Common.Exceptions;

namespace InventoryPro.Application.Common.Tenancy;

/// <summary>
/// Scoped service chứa thông tin tenant hiện tại của request.
/// Inject vào bất kỳ handler/service nào cần biết đang xử lý cho tenant nào.
/// Defined ở Application layer (không phải API) để Application handlers có thể inject.
/// </summary>
public class TenantContext
{
    public Guid? TenantId { get; set; }
    public Guid? UserId { get; set; }
    public List<Guid>? BranchIds { get; set; }
    public string? Role { get; set; }

    public bool IsAuthenticated => TenantId.HasValue && UserId.HasValue;
    public bool IsAdmin => Role == "ADMIN";

    public void EnsureAuthenticated()
    {
        if (!IsAuthenticated)
            throw new UnauthorizedException("User chưa đăng nhập");
    }
}
