using InventoryPro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace InventoryPro.Infrastructure.DependencyInjection;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // EF Core + Supabase Postgres
        var connectionString = configuration.GetConnectionString("Supabase")
            ?? configuration["DATABASE_URL"]
            ?? throw new InvalidOperationException("Connection string chưa cấu hình");

        services.AddDbContext<InventoryDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsHistoryTable("__ef_migrations");
                npgsql.EnableRetryOnFailure(maxRetryCount: 3);
            });

            if (configuration.GetValue<bool>("Logging:EnableEFCoreLogging"))
            {
                options.EnableSensitiveDataLogging();
            }
        });

        return services;
    }
}
