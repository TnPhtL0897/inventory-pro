namespace InventoryPro.Application.Common.Models;

/// <summary>
/// Wrapper chuẩn cho response API. Dùng cho cả success và error.
/// </summary>
public class ApiResponse<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }

    public static ApiResponse<T> Ok(T data) => new() { Success = true, Data = data };

    public static ApiResponse<T> Fail(string code, string message, object? details = null)
        => new() { Success = false, Error = new ApiError { Code = code, Message = message, Details = details } };
}

public class ApiError
{
    public string Code { get; init; } = "";
    public string Message { get; init; } = "";
    public object? Details { get; init; }
}

public class PaginatedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = Array.Empty<T>();
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public bool HasMore => (long)Page * PageSize < Total;
}
