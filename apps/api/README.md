# InventoryPro API

ASP.NET Core 8 Web API với Clean Architecture.

## Cấu trúc

- **InventoryPro.API**: Controllers, Middleware, Program.cs
- **InventoryPro.Application**: Use cases, DTOs, MediatR handlers, FluentValidation
- **InventoryPro.Domain**: Entities, value objects, business rules
- **InventoryPro.Infrastructure**: EF Core, Supabase client, integrations

## Setup local

```bash
# Yêu cầu .NET 8 SDK
dotnet --version

# Restore + Build
dotnet restore
dotnet build

# Chạy API
dotnet run --project src/InventoryPro.API

# Test
dotnet test
```

API chạy ở `http://localhost:5000` (theo `launchSettings.json`).

## Endpoints

- `GET /health` — Health check
- `GET /api/v1/auth/me` — Thông tin user hiện tại
- `POST /api/v1/auth/signout` — Đăng xuất

(Sẽ bổ sung thêm ở các phase tiếp theo.)

## Cấu hình

Sửa `appsettings.Development.json` hoặc set env vars:

- `ConnectionStrings__Supabase` — Postgres connection string
- `Supabase__Url`, `Supabase__JwtSecret`, `Supabase__AnonKey`, `Supabase__ServiceRoleKey`
- `Cors__AllowedOrigins` — danh sách origins được phép (comma-separated)
