using System.Text;
using System.Text.Json;
using InventoryPro.Application.Common.Models;

namespace InventoryPro.API.Middleware;

/// <summary>
/// Idempotency middleware (theo ADR-0002): nếu request có header "Idempotency-Key"
/// và method là POST/PUT/PATCH, kiểm tra cache response trước khi vào controller.
/// Nếu key đã tồn tại → trả về response cũ. Ngược lại, buffer response để cache lại.
/// Cache lưu in-memory (24h TTL), production nên dùng Redis.
/// </summary>
public class IdempotencyMiddleware
{
    public const string HeaderName = "Idempotency-Key";
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly RequestDelegate _next;
    private readonly ILogger<IdempotencyMiddleware> _logger;
    private static readonly Dictionary<string, (int Status, string ContentType, byte[] Body, DateTime Expires)> _cache = new();

    public IdempotencyMiddleware(RequestDelegate next, ILogger<IdempotencyMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Chỉ áp dụng cho write methods có header Idempotency-Key
        var method = context.Request.Method;
        if (method is not ("POST" or "PUT" or "PATCH"))
        {
            await _next(context);
            return;
        }
        if (!context.Request.Headers.TryGetValue(HeaderName, out var keyValues) ||
            string.IsNullOrWhiteSpace(keyValues.ToString()))
        {
            await _next(context);
            return;
        }

        var key = keyValues.ToString();
        var tenantId = context.Items["TenantId"]?.ToString() ?? "_anon";
        var cacheKey = $"{tenantId}:{method}:{context.Request.Path}:{key}";

        // Cleanup expired (lazy)
        var now = DateTime.UtcNow;
        var expired = _cache.Where(kv => kv.Value.Expires < now).Select(kv => kv.Key).ToList();
        foreach (var ek in expired) _cache.Remove(ek);

        // Cache hit: trả về response cũ
        if (_cache.TryGetValue(cacheKey, out var cached))
        {
            _logger.LogInformation("Idempotency cache HIT: {Key}", cacheKey);
            context.Response.StatusCode = cached.Status;
            context.Response.ContentType = cached.ContentType;
            context.Response.Headers["Idempotent-Replay"] = "true";
            await context.Response.Body.WriteAsync(cached.Body, context.RequestAborted);
            return;
        }

        // Cache miss: buffer response để lưu lại
        var originalBody = context.Response.Body;
        using var memStream = new MemoryStream();
        context.Response.Body = memStream;
        try
        {
            await _next(context);
        }
        finally
        {
            context.Response.Body = originalBody;
        }

        memStream.Position = 0;
        var bodyBytes = memStream.ToArray();
        await originalBody.WriteAsync(bodyBytes, context.RequestAborted);

        // Chỉ cache 2xx responses
        if (context.Response.StatusCode is >= 200 and < 300)
        {
            _cache[cacheKey] = (context.Response.StatusCode, context.Response.ContentType ?? "application/json", bodyBytes, now + Ttl);
            _logger.LogInformation("Idempotency cache STORE: {Key} (status {Status})", cacheKey, context.Response.StatusCode);
        }
    }
}
