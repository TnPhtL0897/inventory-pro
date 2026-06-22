# =============================================================================
# InventoryPro — Full deploy script (Windows PowerShell, $0 cost)
# Stack: Next.js web → Cloudflare Pages | CF Workers API → Cloudflare
# =============================================================================

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "WARN  $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "ERROR $msg" -ForegroundColor Red; exit 1 }

# =============================================================================
# Pre-flight
# =============================================================================
Step "Pre-flight checks"
$required = @("pnpm", "supabase", "gh", "wrangler", "git")
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
# Step 3: Cloudflare Workers (API)
# =============================================================================
Step "Deploy API Worker (Cloudflare Workers)"
Push-Location apps/api-worker

$dbUrl = $envMap["DATABASE_URL"]
if ([string]::IsNullOrEmpty($dbUrl)) { Fail "Missing DATABASE_URL" }
if ([string]::IsNullOrEmpty($envMap["SUPABASE_JWT_SECRET"])) { Fail "Missing SUPABASE_JWT_SECRET" }

$envMap["NEXT_PUBLIC_SUPABASE_URL"]            | wrangler secret put SUPABASE_URL
$envMap["NEXT_PUBLIC_SUPABASE_ANON_KEY"]       | wrangler secret put SUPABASE_ANON_KEY
$envMap["SUPABASE_SERVICE_ROLE_KEY"]           | wrangler secret put SUPABASE_SERVICE_ROLE_KEY
$envMap["SUPABASE_JWT_SECRET"]                 | wrangler secret put SUPABASE_JWT_SECRET
$dbUrl                                         | wrangler secret put DATABASE_URL

npm run deploy
Pop-Location

Step "API Worker deployed: https://quankho-api.letanphatptt.workers.dev"

# =============================================================================
# Step 4: Cloudflare Pages (Web)
# =============================================================================
Step "Deploy Web to Cloudflare Pages"
Write-Host ""
Write-Host "CF Pages deploy trigger qua git push — Pages tự build khi push main:" -ForegroundColor Cyan
Write-Host "  git push origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "Đảm bảo CF Pages Project 'quankho-web' đã connect repo này:" -ForegroundColor Yellow
Write-Host "  - Root directory: apps/web"
Write-Host "  - Build command: pnpm install && pnpm --filter web build"
Write-Host "  - Output directory: .next"
Write-Host "  - Compatibility flags: nodejs_compat"
Write-Host "  - Env vars (runtime):"
Write-Host "      NEXT_PUBLIC_SUPABASE_URL = $($envMap["NEXT_PUBLIC_SUPABASE_URL"])"
Write-Host ""

$webUrl = "https://quankho.pages.dev"

# =============================================================================
# Step 5: Smoke test
# =============================================================================
Step "Smoke test"
Start-Sleep -Seconds 10

try {
    $response = Invoke-WebRequest -Uri "https://quankho-api.letanphatptt.workers.dev/health" -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200) { Write-Host "✅ API live" -ForegroundColor Green }
} catch {
    Warn "API live check failed: $_"
}

try {
    $response = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200) { Write-Host "✅ Web live" -ForegroundColor Green }
} catch {
    Warn "Web check failed: $_"
}

# =============================================================================
# Done
# =============================================================================
Step "Deploy hoàn tất! Cost = $0"
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Web: $webUrl"
Write-Host "  API: https://quankho-api.letanphatptt.workers.dev"
Write-Host ""
Write-Host "Manual steps:" -ForegroundColor Yellow
Write-Host "1. Supabase Dashboard > Auth > Site URL: $webUrl"