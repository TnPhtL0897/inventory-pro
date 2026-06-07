namespace InventoryPro.Application.Replenishment;

// =============================================================================
// CONTROL POINTS - KIỂM TRA TỰ ĐỘNG KHI CHẠY DỰ TRÙ
// =============================================================================
// Pure C# validators. Không phụ thuộc EF Core, không throw exception.
// Mỗi rule trả về danh sách ControlPointIssue, hoặc rỗng nếu OK.

/// <summary>
/// Mức độ cảnh báo của 1 control point.
/// </summary>
public enum ControlPointSeverity
{
    /// <summary>Không có vấn đề.</summary>
    Ok = 0,

    /// <summary>Thông tin, không chặn dự trù.</summary>
    Info = 1,

    /// <summary>Cảnh báo, nên xem xét trước khi duyệt.</summary>
    Warning = 2,

    /// <summary>Nghiêm trọng, bắt buộc review.</summary>
    Critical = 3
}

/// <summary>
/// 1 vấn đề được phát hiện bởi control point.
/// </summary>
/// <param name="Severity">Mức độ: Ok / Info / Warning / Critical.</param>
/// <param name="Code">Mã rule (vd: "MIN_STOCK_BREACH", "CONTRACT_EXPIRING").</param>
/// <param name="Message">Mô tả ngắn gọn cho UI/email.</param>
/// <param name="ProductId">Sản phẩm liên quan (nếu có).</param>
/// <param name="ContractId">HĐ thầu liên quan (nếu có).</param>
public sealed record ControlPointIssue(
    ControlPointSeverity Severity,
    string Code,
    string Message,
    Guid? ProductId = null,
    Guid? ContractId = null)
{
    /// <summary>Tạo issue trạng thái OK (dùng làm mặc định khi không có vấn đề).</summary>
    public static ControlPointIssue Ok(string code) =>
        new(ControlPointSeverity.Ok, code, string.Empty);

    /// <summary>True nếu issue có vấn đề (severity > Ok).</summary>
    public bool HasIssue => Severity > ControlPointSeverity.Ok;
}

/// <summary>
/// Bộ validator control point dùng cho dự trù cuối tháng.
/// Tất cả method là static, pure, không phụ thuộc EF Core.
/// </summary>
public static class ReplenishmentControlPointValidator
{
    // Mã rule - dùng làm key ổn định để dedupe, i18n, hoặc filter.
    public const string CodeMinStockBreach     = "MIN_STOCK_BREACH";
    public const string CodeContractExpiring   = "CONTRACT_EXPIRING";
    public const string CodeConsumptionAnomaly = "CONSUMPTION_ANOMALY";
    public const string CodeSingleSupplier     = "SINGLE_SUPPLIER";
    public const string CodeInactiveUsage      = "INACTIVE_USAGE";

    // ---------------------------------------------------------------------
    // 1. Tồn kho dưới mức tối thiểu
    // ---------------------------------------------------------------------

    /// <summary>
    /// Cảnh báo khi tồn kho hiện tại dưới mức tối thiểu.
    /// Trả về <see cref="ControlPointSeverity.Ok"/> nếu tồn kho hợp lệ hoặc dữ liệu không đầy đủ.
    /// </summary>
    /// <param name="currentStock">Tồn kho hiện tại của sản phẩm.</param>
    /// <param name="minStock">Ngưỡng tồn tối thiểu cấu hình trên sản phẩm.</param>
    /// <param name="productName">Tên sản phẩm (chỉ dùng để build message).</param>
    /// <param name="productId">Id sản phẩm (gắn vào issue).</param>
    /// <returns>Issue Warning nếu vi phạm, ngược lại Ok.</returns>
    public static ControlPointIssue CheckMinStockBreach(
        decimal currentStock,
        decimal minStock,
        string productName,
        Guid? productId = null)
    {
        if (string.IsNullOrWhiteSpace(productName))
            productName = "(không tên)";

        if (currentStock < minStock)
        {
            return new ControlPointIssue(
                ControlPointSeverity.Warning,
                CodeMinStockBreach,
                $"SP \"{productName}\": tồn kho {currentStock} dưới mức tối thiểu {minStock}.",
                productId);
        }

        return ControlPointIssue.Ok(CodeMinStockBreach);
    }

    // ---------------------------------------------------------------------
    // 2. HĐ thầu sắp hết hạn
    // ---------------------------------------------------------------------

    /// <summary>
    /// Cảnh báo hợp đồng sắp hết hạn trong vòng N ngày tới.
    /// Không cảnh báo nếu HĐ đã hết hạn (xem xét bỏ rule khác nếu cần).
    /// </summary>
    /// <param name="contractEndDate">Ngày kết thúc HĐ.</param>
    /// <param name="asOfDate">Ngày đánh giá (mặc định = UtcNow tại caller).</param>
    /// <param name="daysAhead">Số ngày look-ahead, mặc định 30.</param>
    /// <param name="contractId">Id hợp đồng (gắn vào issue).</param>
    public static ControlPointIssue CheckContractExpiring(
        DateTime contractEndDate,
        DateTime? asOfDate = null,
        int daysAhead = 30,
        Guid? contractId = null)
    {
        var today = (asOfDate ?? DateTime.UtcNow).Date;
        var end   = contractEndDate.Date;
        var days  = (end - today).Days;

        if (days < 0)
        {
            // Đã hết hạn - không raise issue ở rule này.
            return ControlPointIssue.Ok(CodeContractExpiring);
        }

        if (days <= daysAhead)
        {
            return new ControlPointIssue(
                ControlPointSeverity.Warning,
                CodeContractExpiring,
                $"HĐ sắp hết hạn trong {days} ngày (ngưỡng cảnh báo {daysAhead}).",
                ContractId: contractId);
        }

        return ControlPointIssue.Ok(CodeContractExpiring);
    }

    // ---------------------------------------------------------------------
    // 3. Bất thường tiêu thụ (tăng/giảm đột biến)
    // ---------------------------------------------------------------------

    /// <summary>
    /// Cảnh báo khi tiêu thụ tháng hiện tại lệch khỏi trung bình quá <paramref name="threshold"/>
    /// (theo tỉ lệ). Tăng đột biến thường dẫn đến thiếu hàng; giảm đột biến dẫn đến tồn đọng.
    /// </summary>
    /// <param name="currentConsumption">Tiêu thụ tháng hiện tại (đã cộng dồn).</param>
    /// <param name="avgConsumption">Trung bình tiêu thụ / tháng (cơ sở so sánh).</param>
    /// <param name="threshold">Ngưỡng tỉ lệ lệch (vd: 0.3 = 30%). Mặc định 0.3.</param>
    /// <param name="productName">Tên sản phẩm cho message.</param>
    /// <param name="productId">Id sản phẩm.</param>
    public static ControlPointIssue CheckConsumptionAnomaly(
        decimal currentConsumption,
        decimal avgConsumption,
        double threshold = 0.3,
        string productName = "",
        Guid? productId = null)
    {
        if (avgConsumption <= 0m)
            return ControlPointIssue.Ok(CodeConsumptionAnomaly);

        var deviation = Math.Abs(
            (double)((currentConsumption - avgConsumption) / avgConsumption));

        if (deviation <= threshold)
            return ControlPointIssue.Ok(CodeConsumptionAnomaly);

        var direction = currentConsumption > avgConsumption
            ? "tăng đột biến"
            : "giảm đột biến";

        var label = string.IsNullOrWhiteSpace(productName)
            ? "(không tên)"
            : productName;

        return new ControlPointIssue(
            ControlPointSeverity.Critical,
            CodeConsumptionAnomaly,
            $"SP \"{label}\": tiêu thụ tháng hiện tại {currentConsumption} lệch " +
            $"{avgConsumption} (TB) - {direction} {deviation:P0}.",
            productId);
    }

    // ---------------------------------------------------------------------
    // 4. Sản phẩm chỉ có 1 nhà cung cấp
    // ---------------------------------------------------------------------

    /// <summary>
    /// Cảnh báo sản phẩm chỉ liên kết với 1 nhà cung cấp (rủi ro supply chain).
    /// </summary>
    /// <param name="supplierCount">Số NCC đang active của sản phẩm.</param>
    /// <param name="productName">Tên sản phẩm.</param>
    /// <param name="productId">Id sản phẩm.</param>
    public static ControlPointIssue CheckSingleSupplier(
        int supplierCount,
        string productName = "",
        Guid? productId = null)
    {
        if (supplierCount >= 2)
            return ControlPointIssue.Ok(CodeSingleSupplier);

        var label = string.IsNullOrWhiteSpace(productName)
            ? "(không tên)"
            : productName;

        return new ControlPointIssue(
            ControlPointSeverity.Info,
            CodeSingleSupplier,
            $"SP \"{label}\" chỉ có {supplierCount} NCC - cân nhắc thêm nguồn thay thế.",
            productId);
    }

    // ---------------------------------------------------------------------
    // 5. Sản phẩm không phát sinh sử dụng trong thời gian dài
    // ---------------------------------------------------------------------

    /// <summary>
    /// Cảnh báo sản phẩm không phát sinh xuất/nhập trong N ngày - có thể loại bỏ tồn kho.
    /// </summary>
    /// <param name="daysSinceLastUse">Số ngày tính từ lần sử dụng gần nhất.</param>
    /// <param name="thresholdDays">Ngưỡng cảnh báo, mặc định 180.</param>
    /// <param name="productName">Tên sản phẩm.</param>
    /// <param name="productId">Id sản phẩm.</param>
    public static ControlPointIssue CheckInactiveUsage(
        int daysSinceLastUse,
        int thresholdDays = 180,
        string productName = "",
        Guid? productId = null)
    {
        if (daysSinceLastUse < thresholdDays)
            return ControlPointIssue.Ok(CodeInactiveUsage);

        var label = string.IsNullOrWhiteSpace(productName)
            ? "(không tên)"
            : productName;

        return new ControlPointIssue(
            ControlPointSeverity.Info,
            CodeInactiveUsage,
            $"SP \"{label}\" không phát sinh sử dụng {daysSinceLastUse} ngày " +
            $"(ngưỡng {thresholdDays}) - cân nhắc loại bỏ tồn.",
            productId);
    }
}
