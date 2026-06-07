namespace InventoryPro.Domain.Replenishment;

/// <summary>
/// Loại trigger chạy dự trù cuối tháng.
/// </summary>
public enum ReplenishmentRunType
{
    Manual = 0,        // User bấm từ UI
    Scheduled = 1      // BackgroundService tự chạy theo cron
}

/// <summary>
/// Trạng thái của 1 lần chạy dự trù.
/// </summary>
public enum ReplenishmentRunStatus
{
    Completed = 0,     // Chạy thành công
    Failed = 1         // Lỗi (xem error_message)
}
