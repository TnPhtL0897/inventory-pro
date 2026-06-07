namespace InventoryPro.API.Middleware;

/// <summary>
/// Thêm security headers chuẩn vào response (defense in depth).
/// Bật: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
/// Production thêm Strict-Transport-Security (HSTS).
/// CSP được cấu hình riêng cho Swagger UI.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly bool _isProduction;

    public SecurityHeadersMiddleware(RequestDelegate next, IHostEnvironment env)
    {
        _next = next;
        _isProduction = env.IsProduction();
    }

    public Task InvokeAsync(HttpContext context)
    {
        // Set headers ngay đầu pipeline - trước cả response
        context.Response.OnStarting(() =>
        {
            var h = context.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["X-XSS-Protection"] = "1; mode=block";
            h["Referrer-Policy"] = "strict-origin-when-cross-origin";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
            h["Cross-Origin-Opener-Policy"] = "same-origin";

            if (_isProduction)
            {
                h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
            }

            // CSP cho API responses (chỉ cho JSON, không cần nhiều)
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";

            return Task.CompletedTask;
        });

        return _next(context);
    }
}
