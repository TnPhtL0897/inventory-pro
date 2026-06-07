using System.Net;
using System.Text.Json;
using InventoryPro.Application.Common.Exceptions;

namespace InventoryPro.API.Middleware;

/// <summary>
/// Global exception handler. Convert exception → ApiError response chuẩn.
/// </summary>
public class ExceptionHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlerMiddleware> _logger;

    public ExceptionHandlerMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception ex)
    {
        var (statusCode, code) = ex switch
        {
            ValidationException => (HttpStatusCode.BadRequest, "VALIDATION_ERROR"),
            NotFoundException => (HttpStatusCode.NotFound, "NOT_FOUND"),
            ForbiddenException => (HttpStatusCode.Forbidden, "FORBIDDEN"),
            UnauthorizedException => (HttpStatusCode.Unauthorized, "UNAUTHORIZED"),
            ConflictException => (HttpStatusCode.Conflict, "CONFLICT"),
            BusinessRuleException => (HttpStatusCode.UnprocessableEntity, "BUSINESS_RULE_VIOLATION"),
            _ => (HttpStatusCode.InternalServerError, "INTERNAL_ERROR"),
        };

        _logger.Log(ex is not BusinessRuleException and not ValidationException ? LogLevel.Error : LogLevel.Warning,
            ex, "Exception: {Message}", ex.Message);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = new
        {
            success = false,
            error = new
            {
                code,
                message = ex.Message,
                details = ex is ValidationException v ? v.Errors : null,
            },
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    }
}
