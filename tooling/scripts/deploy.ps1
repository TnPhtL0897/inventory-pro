# =============================================================================
# InventoryPro — Full deploy script (Windows PowerShell, $0 cost)
# =============================================================================

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "WARN  $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "ERROR $msg" -ForegroundColor Red; exit 1 }

# =============================================================================
# Pre-flight
# =============================================================================
Step "Pre-flight checks"
$required = @("pnpm", "dotnet", "supabase", "fly", "vercel", "git")
foreach ($cmd in $required) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Fail "Missing CLI: $cmd"
    }
}
if (-not (Test-Path ".env.local")) { Fail "Missing .env.local" }
if (-not (Test-Path ".git")) { Fail "Not a git repo" }

# =============================================================================
# Step 1: Git
# =============================================================================
Step "Check git status"
$status = git status --porcelain
if ($status) {
    Warn "Có thay đổi chưa commit:"
    git status --short
    $reply = Read-Host "Commit & push? (y/n)"
    if ($reply -eq "y") {
        git add -A
        git commit -m "chore: deploy production"
        git push origin main
    }
}

# =============================================================================
# Step 2: Supabase
# =============================================================================
Step "Apply Supabase migrations"
$envContent = Get-Content .env.local | Where-Object { $_ -match "=" }
$envMap = @{}
foreach ($line in $envContent) {
    $k, $v = $line -split "=", 2
    $envMap[$k] = $v
}
$supabaseUrl = $envMap["NEXT_PUBLIC_SUPABASE_URL"]
$supabaseRef = ($supabaseUrl -split "\.")[0] -replace "https://", ""
Step "Project ref: $supabaseRef"

supabase link --project-ref $supabaseRef
supabase db push

# =============================================================================
# Step 3: Vercel
# =============================================================================
Step "Deploy Web to Vercel"
vercel --prod --yes `
    -b "NEXT_PUBLIC_SUPABASE_URL=$($envMap["NEXT_PUBLIC_SUPABASE_URL"])" `
    -b "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($envMap["NEXT_PUBLIC_SUPABASE_ANON_KEY"])" `
    -b "NEXT_PUBLIC_API_BASE_URL=https://inventory-prod.fly.dev" `
    -b "NEXT_PUBLIC_APP_NAME=Quản lý kho vật tư Pro" `
    -b "NEXT_PUBLIC_APP_VERSION=0.1.0"

# =============================================================================
# Step 4: Fly.io
# =============================================================================
Step "Deploy API to Fly.io"
fly apps create inventory-prod 2>$null

$dbPwd = $envMap["DB_PASSWORD"]
$connStr = "Host=db.${supabaseRef}.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=${dbPwd};SslMode=Require;TrustServerCertificate=true"
fly secrets set `
    "Supabase__Url=$($envMap["NEXT_PUBLIC_SUPABASE_URL"])" `
    "Supabase__JwtSecret=$($envMap["SUPABASE_JWT_SECRET"])" `
    "Supabase__AnonKey=$($envMap["NEXT_PUBLIC_SUPABASE_ANON_KEY"])" `
    "Supabase__ServiceRoleKey=$($envMap["SUPABASE_SERVICE_ROLE_KEY"])" `
    "ConnectionStrings__Supabase=$connStr" `
    --app inventory-prod

fly deploy --remote-only --strategy bluegreen

# =============================================================================
# Step 5: Smoke test
# =============================================================================
Step "Smoke test"
Start-Sleep -Seconds 10

try {
    $response = Invoke-WebRequest -Uri "https://inventory-prod.fly.dev/health/live" -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200) { Write-Host "✅ API live" -ForegroundColor Green }
} catch {
    Warn "API live check failed: $_"
}

try {
    $response = Invoke-WebRequest -Uri "https://inventory-prod.vercel.app/login" -UseBasicParsing -TimeoutSec 30
    if ($response.Content -match "Đăng nhập") { Write-Host "✅ Web live" -ForegroundColor Green }
} catch {
    Warn "Web check failed: $_"
}

# =============================================================================
# Done
# =============================================================================
Step "Deploy hoàn tất! Cost = $0"
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Web: https://inventory-prod.vercel.app"
Write-Host "  API: https://inventory-prod.fly.dev"
Write-Host ""
Write-Host "Manual steps:" -ForegroundColor Yellow
Write-Host "1. Supabase Dashboard > Auth > Site URL: https://inventory-prod.vercel.app"
Write-Host "2. Update CORS trong appsettings.Production.json + fly deploy lại"
Write-Host "3. (Optional) Custom domain"
