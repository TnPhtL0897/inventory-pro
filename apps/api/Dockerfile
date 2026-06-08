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

# IMPORTANT: KHÔNG hardcode ASPNETCORE_URLS ở đây.
# Render free tier inject PORT=10000 và truyền ASPNETCORE_URLS=http://+:$PORT qua env.
# Nếu Dockerfile set ASPNETCORE_URLS=http://+:8080, env từ Render vẫn override (ưu tiên cao hơn),
# nhưng để chắc chắn và tránh nhầm lẫn, ta để ASPNETCORE_URLS do Render quyết định.
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV DOTNET_gcServer=1

# EXPOSE 8080 cho local docker run; Render sẽ dùng $PORT=10000 thông qua ASPNETCORE_URLS env.
EXPOSE 8080
EXPOSE 10000

# Health check dùng built-in endpoint. Trỏ vào 8080 (local) - Render sẽ tự health check qua /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

ENTRYPOINT ["dotnet", "InventoryPro.API.dll"]
