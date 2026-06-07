using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using HealthChecks.UI.Client;
using InventoryPro.API.Middleware;
using InventoryPro.Application;
using InventoryPro.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// =============================================================================
// Logging (Serilog)
// =============================================================================
builder.Host.UseSerilog((context, configuration) =>
    configuration
        .ReadFrom.Configuration(context.Configuration)
        .Enrich.FromLogContext()
        .WriteTo.Console()
        .WriteTo.File(
            path: "logs/inventorypro-.log",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 30));

// =============================================================================
// Application Services
// =============================================================================
builder.Services
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration);

// Scoped TenantContext cho mỗi request
builder.Services.AddScoped<TenantContext>();

// =============================================================================
// Background Services (chỉ register nếu enabled trong config)
// =============================================================================
var replenishmentEnabled = builder.Configuration.GetValue<bool>("Replenishment:Enabled", false);
if (replenishmentEnabled)
{
    builder.Services.AddHostedService<InventoryPro.API.BackgroundServices.ReplenishmentBackgroundService>();
}

// =============================================================================
// API & Swagger
// =============================================================================
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "InventoryPro API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new()
    {
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
    });
    options.AddSecurityRequirement(new()
    {
        {
            new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        },
    });
});

// =============================================================================
// CORS
// =============================================================================
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? new[] { "http://localhost:3000" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("DefaultCors", policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

// =============================================================================
// Authentication & Authorization
// =============================================================================
builder.Services.AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
    {
        var supabaseUrl = builder.Configuration["Supabase:Url"];
        var jwtSecret = builder.Configuration["Supabase:JwtSecret"];

        if (string.IsNullOrEmpty(supabaseUrl) || string.IsNullOrEmpty(jwtSecret))
        {
            // Tránh crash app ở startup; thực tế request sẽ 401
            supabaseUrl ??= "https://placeholder.supabase.co";
            jwtSecret ??= "placeholder-jwt-secret-for-startup-only";
        }

        // Supabase JWT dùng HS256 với secret làm signing key
        options.TokenValidationParameters = new()
        {
            ValidateIssuer = true,
            ValidIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1",
            ValidateAudience = true,
            ValidAudience = "authenticated",
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
                System.Text.Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdmin", policy =>
        policy.RequireClaim("role", "ADMIN"));
    options.AddPolicy("RequireManager", policy =>
        policy.RequireAssertion(ctx =>
            ctx.User.HasClaim("role", "ADMIN") ||
            ctx.User.HasClaim("role", "MANAGER")));
});

// =============================================================================
// Rate Limiting
// =============================================================================
var perMinute = builder.Configuration.GetValue<int>("RateLimit:PerMinute", 100);
var perHour = builder.Configuration.GetValue<int>("RateLimit:PerHour", 1000);

builder.Services.AddRateLimiter(options =>
{
    // Global: partition theo IP (hoặc user id nếu đã authenticate)
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var partitionKey = context.User.Identity?.IsAuthenticated == true
            ? $"user:{context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString()}"
            : $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
        return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = perMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true,
        });
    });
    options.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.Headers["Retry-After"] = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            success = false,
            error = new
            {
                code = "RATE_LIMITED",
                message = $"Quá nhiều request. Tối đa {perMinute}/phút. Vui lòng thử lại sau.",
            },
        }, ct);
    };
});

// =============================================================================
// Health Checks
// =============================================================================
builder.Services.AddHealthChecks()
    .AddCheck("self", () => Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy())
    .AddDbContextCheck<InventoryPro.Infrastructure.Persistence.InventoryDbContext>(
        name: "database",
        tags: new[] { "ready", "db" });

// =============================================================================
// Build app
// =============================================================================
var app = builder.Build();

// =============================================================================
// Middleware pipeline
// =============================================================================
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlerMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();

app.UseRateLimiter();
app.UseCors("DefaultCors");

app.UseAuthentication();
app.UseMiddleware<TenantScopeMiddleware>();
// IdempotencyMiddleware phải sau TenantScopeMiddleware (cần TenantId làm cache key)
app.UseMiddleware<IdempotencyMiddleware>();
app.UseAuthorization();

app.MapControllers();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse,
});

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false, // chỉ check "self"
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});

try
{
    Log.Information("Starting InventoryPro API");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

// Cho phép test project reference
public partial class Program { }
