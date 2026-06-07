# =============================================================================
# Multi-stage Dockerfile cho InventoryPro API
# Build context: repo root
# Build: docker build -f apps/api/Dockerfile -t inventorypro-api .
# Run:   docker run -p 8080:8080 --env-file apps/api/.env.production inventorypro-api
# =============================================================================

# ---- Stage 1: build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution + project files first (cache restore layer)
COPY apps/api/InventoryPro.sln apps/api/
COPY apps/api/src/InventoryPro.Domain/InventoryPro.Domain.csproj apps/api/src/InventoryPro.Domain/
COPY apps/api/src/InventoryPro.Application/InventoryPro.Application.csproj apps/api/src/InventoryPro.Application/
COPY apps/api/src/InventoryPro.Infrastructure/InventoryPro.Infrastructure.csproj apps/api/src/InventoryPro.Infrastructure/
COPY apps/api/src/InventoryPro.API/InventoryPro.API.csproj apps/api/src/InventoryPro.API/
COPY apps/api/tests/InventoryPro.UnitTests/InventoryPro.UnitTests.csproj apps/api/tests/InventoryPro.UnitTests/
COPY apps/api/tests/InventoryPro.IntegrationTests/InventoryPro.IntegrationTests.csproj apps/api/tests/InventoryPro.IntegrationTests/

# Restore
RUN dotnet restore apps/api/InventoryPro.sln

# Copy source code
COPY apps/api/src apps/api/src
COPY apps/api/tests apps/api/tests

# Build & publish (no-restore vì đã restore ở trên)
RUN dotnet publish apps/api/src/InventoryPro.API/InventoryPro.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    --no-self-contained \
    /p:UseAppHost=false

# ---- Stage 2: runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Run as non-root for security
RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser appuser

# Copy published output
COPY --from=build /app/publish .

# Set ownership
RUN chown -R appuser:appuser /app
USER appuser

# ASP.NET Core trên port 8080 theo convention của cloud providers
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV DOTNET_gcServer=1

EXPOSE 8080

# Health check dùng built-in endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

ENTRYPOINT ["dotnet", "InventoryPro.API.dll"]
