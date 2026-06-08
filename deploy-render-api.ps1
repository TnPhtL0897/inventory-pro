# =============================================================================
# DEPLOY BACKEND API TO RENDER
# =============================================================================
# Tạo Render Web Service cho .NET API (InventoryPro.API)
# Poll deploy status, return serviceId + URL + health check
#
# Yêu cầu env (load từ deploy-secrets-local.ps1):
#   RENDER_API_KEY         (rnd_xxx)
#   SUPABASE_URL           (https://xxx.supabase.co)
#   SUPABASE_JWT_SECRET    (from Supabase dashboard)
#   SUPABASE_SERVICE_KEY   (service_role key)
#   SUPABASE_DB_CONN       (postgresql://postgres:PWD@db.xxx.supabase.co:5432/postgres)
#
# CORS__AllowedOrigins__0 sẽ là PLACEHOLDER, update sau khi Vercel xong
#
# Chạy:
#   powershell -ExecutionPolicy Bypass -File deploy-render-api.ps1
# =============================================================================

param(
  [string]$RenderApiKey    = $env:RENDER_API_KEY,
  [string]$SupabaseUrl     = $env:SUPABASE_URL,
  [string]$JwtSecret       = $env:SUPABASE_JWT_SECRET,
  [string]$ServiceKey      = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$DbConn          = $env:SUPABASE_DB_CONN,
  [string]$RepoUrl         = "https://github.com/TnPhtL0897/inventory-pro",
  [string]$Branch          = "main",
  [string]$ServiceName     = "inventory-pro-api",
  [string]$Region          = "singapore",
  [string]$Plan            = "free",
  [int]$PollIntervalSec    = 15,
  [int]$MaxPollMinutes    = 15,
  [string]$OutputFile      = "render-deploy-result.json",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# ---- Color helpers ----
function Write-Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)    { Write-Host "[ERR] $msg" -ForegroundColor Red }
function Write-Info($msg)   { Write-Host "[i] $msg" -ForegroundColor Gray }

# =============================================================================
# PRE-CHECK
# =============================================================================
Write-Section "Pre-check"

if (-not $RenderApiKey) { Write-Err "RENDER_API_KEY missing"; exit 1 }
Write-Ok "RENDER_API_KEY loaded"

$requiredVars = @{
  "SUPABASE_URL"               = $SupabaseUrl
  "SUPABASE_JWT_SECRET"        = $JwtSecret
  "SUPABASE_SERVICE_ROLE_KEY"  = $ServiceKey
  "SUPABASE_DB_CONN"           = $DbConn
}
foreach ($k in $requiredVars.Keys) {
  $v = $requiredVars[$k]
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Err "$k is EMPTY"
    Write-Info "Set via: `$env:$k = 'value' before running this script"
    exit 1
  }
  Write-Ok "$k loaded (len=$($v.Length))"
}

if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
  Write-Err "curl not found"; exit 1
}
Write-Ok "curl available"

# =============================================================================
# QUAN TRỌNG: Dockerfile hardcode port 8080, nhưng Render free cần $PORT
# =============================================================================
# Strategy: set ASPNETCORE_URLS=http://+:$PORT (Render inject PORT=10000)
# sẽ OVERRIDE Dockerfile ENV. Ta không cần sửa Dockerfile.
Write-Section "Port strategy"
Write-Info "Dockerfile hardcode port 8080; Render free tier injects PORT=10000."
Write-Info "Override via env var ASPNETCORE_URLS=http://+:\$PORT (Render tự expand)"

# =============================================================================
# STEP 1: Get ownerId (Render workspaces/owners)
# =============================================================================
Write-Section "Step 1: Get owner info from Render"

$headers = @{
  "Accept"        = "application/json"
  "Authorization" = "Bearer $RenderApiKey"
}

try {
  $ownersResp = Invoke-RestMethod -Uri "https://api.render.com/v1/owners" `
    -Method Get -Headers $headers -TimeoutSec 30
} catch {
  Write-Err "Failed to call /v1/owners: $_"
  exit 1
}

if (-not $ownersResp -or $ownersResp.Count -eq 0) {
  Write-Err "No owners found for this Render account"
  exit 1
}

# Prefer 'user' type owner, fallback to first
$owner = $ownersResp | Where-Object { $_.type -eq "user" } | Select-Object -First 1
if (-not $owner) { $owner = $ownersResp[0] }
$ownerId = $owner.owner.id
Write-Ok "ownerId = $ownerId (name: $($owner.owner.name))"

# =============================================================================
# STEP 2: Check if service already exists (idempotent)
# =============================================================================
Write-Section "Step 2: Check for existing service '$ServiceName'"

$existingId = $null
try {
  $servicesResp = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=100" `
    -Method Get -Headers $headers -TimeoutSec 30
  $existing = $servicesResp | Where-Object { $_.service.name -eq $ServiceName } | Select-Object -First 1
  if ($existing) {
    $existingId = $existing.service.id
    Write-Warn "Service '$ServiceName' đã tồn tại: $existingId"
    $svc = $existing
  } else {
    Write-Ok "Service name '$ServiceName' is free"
  }
} catch {
  Write-Warn "Cannot list services (OK nếu account mới): $_"
}

# =============================================================================
# STEP 3: Create service (nếu chưa có)
# =============================================================================
$serviceId = $null
$serviceUrl = $null

if ($existingId) {
  $serviceId = $existingId
  # Try to fetch details to get URL
  try {
    $svcDetail = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId" `
      -Method Get -Headers $headers -TimeoutSec 30
    $serviceUrl = $svcDetail.service.serviceDetails.url
  } catch { Write-Warn "Cannot fetch service detail: $_" }
  Write-Ok "Reusing existing service: $serviceId"
} else {
  Write-Section "Step 3: Create Render Web Service"
  # envVars order matters: ASPNETCORE_URLS dùng $PORT (Render tự inject)
  # Lưu ý: PowerShell JSON encoding sẽ giữ $PORT literal, Render sẽ expand lúc runtime
  $body = @{
    type        = "web_service"
    name        = $ServiceName
    ownerId     = $ownerId
    repo        = $RepoUrl
    branch      = $Branch
    # QUAN TRỌNG: Dockerfile dùng COPY apps/api/... (path từ repo root).
    # Nếu rootDir=apps/api/src/InventoryPro.API thì build context sẽ là dir đó,
    # khiến tất cả COPY apps/api/... FAIL → build failed → service không start.
    # Fix: rootDir="" (repo root) + dockerfilePath="apps/api/Dockerfile".
    rootDir     = ""
    dockerfilePath = "apps/api/Dockerfile"
    plan        = $Plan
    region      = $Region
    envVars     = @(
      @{ key = "ASPNETCORE_ENVIRONMENT";     value = "Production" }
      @{ key = "ASPNETCORE_URLS";            value = 'http://+:$PORT' }
      @{ key = "Supabase__Url";              value = $SupabaseUrl }
      @{ key = "Supabase__JwtSecret";        value = $JwtSecret }
      @{ key = "Supabase__ServiceRoleKey";   value = $ServiceKey }
      @{ key = "ConnectionStrings__Supabase"; value = $DbConn }
      @{ key = "Cors__AllowedOrigins__0";    value = "https://PLACEHOLDER.vercel.app" }
      @{ key = "Replenishment__Enabled";     value = "true" }
    )
  } | ConvertTo-Json -Depth 10

  if ($DryRun) {
    Write-Info "DRY RUN - payload:"
    Write-Host $body
    exit 0
  }

  try {
    $svc = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
      -Method Post -Headers $headers -Body $body -ContentType "application/json" `
      -TimeoutSec 60
    $serviceId = $svc.service.id
    $serviceUrl = $svc.service.serviceDetails.url
    Write-Ok "Service created: $serviceId"
    Write-Ok "URL: $serviceUrl"
  } catch {
    $errBody = $_.Exception.Response
    if ($errBody) {
      $reader = New-Object System.IO.StreamReader($errBody.GetResponseStream())
      $errText = $reader.ReadToEnd()
      Write-Err "Render API error: $errText"
    } else {
      Write-Err "Failed to create service: $_"
    }
    exit 1
  }
}

# =============================================================================
# STEP 4: Trigger deploy (nếu service mới tạo) - Render tự động trigger khi create
# =============================================================================
Write-Section "Step 4: Poll deploy status"

$maxSeconds = $MaxPollMinutes * 60
$elapsed = 0
$deployId = $null
$deployStatus = $null
$lastDeploy = $null

while ($elapsed -lt $maxSeconds) {
  Start-Sleep -Seconds $PollIntervalSec
  $elapsed += $PollIntervalSec
  try {
    $deploysResp = Invoke-RestMethod `
      -Uri "https://api.render.com/v1/services/$serviceId/deploys?limit=1" `
      -Method Get -Headers $headers -TimeoutSec 30
    $lastDeploy = $deploysResp[0]
    if ($lastDeploy) {
      $deployId = $lastDeploy.deploy.id
      $deployStatus = $lastDeploy.deploy.status
      Write-Info "[$($elapsed)s] deployId=$deployId status=$deployStatus"

      if ($deployStatus -eq "live") {
        Write-Ok "DEPLOY LIVE!"
        break
      } elseif ($deployStatus -in @("build_failed", "deploy_failed", "canceled")) {
        Write-Err "DEPLOY FAILED with status: $deployStatus"
        break
      }
    } else {
      Write-Info "[$($elapsed)s] no deploy yet, waiting..."
    }
  } catch {
    Write-Warn "[$($elapsed)s] poll error: $_"
  }
}

if ($deployStatus -ne "live") {
  # Lấy logs để debug
  if ($deployId) {
    Write-Section "Build logs (last 100 lines)"
    try {
      $logs = Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/deploys/$deployId/logs" `
        -Method Get -Headers $headers -TimeoutSec 30
      if ($logs -is [array]) {
        $logs | Select-Object -Last 100 | ForEach-Object { Write-Host $_.message }
      } elseif ($logs.logs) {
        $logs.logs | Select-Object -Last 100 | ForEach-Object { Write-Host $_.message }
      } else {
        $logs | ConvertTo-Json -Depth 5 | Out-Host
      }
    } catch {
      Write-Warn "Cannot fetch logs: $_"
    }
  }

  $result = @{
    success     = $false
    serviceId   = $serviceId
    url         = $serviceUrl
    deployId    = $deployId
    deployStatus = $deployStatus
    healthCheck = $null
    error       = "Deploy did not reach 'live' status within $MaxPollMinutes minutes"
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputFile
  Write-Err "BLOCKED - kết quả lưu tại $OutputFile"
  exit 1
}

# =============================================================================
# STEP 5: Health check
# =============================================================================
Write-Section "Step 5: Health check GET $($serviceUrl)/health"

$healthOk = $false
$healthBody = $null
for ($i = 1; $i -le 5; $i++) {
  Start-Sleep -Seconds 3
  try {
    $healthResp = Invoke-RestMethod -Uri "$serviceUrl/health" `
      -Method Get -TimeoutSec 10 -ErrorAction Stop
    $healthBody = $healthResp | ConvertTo-Json -Compress
    if ($healthResp.status -eq "Healthy" -or $healthResp.status -eq "healthy") {
      $healthOk = $true
      Write-Ok "Health check passed: $healthBody"
      break
    } else {
      Write-Warn "Health response: $healthBody (attempt $i/5)"
    }
  } catch {
    Write-Warn "Health check attempt $i failed: $_"
  }
}

# =============================================================================
# DONE
# =============================================================================
Write-Section "Result"
$result = @{
  success       = $healthOk
  serviceId     = $serviceId
  url           = $serviceUrl
  deployId      = $deployId
  deployStatus  = $deployStatus
  healthCheck   = $healthBody
  healthOk      = $healthOk
  notes         = @(
    "Free tier: có thể sleep sau 15 min không traffic",
    "CORS placeholder sẽ update sau khi Vercel URL có",
    "Nếu health fail, kiểm tra logs tại https://dashboard.render.com/web/$serviceId"
  )
}
$result | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputFile
Write-Ok "Result saved: $OutputFile"
Write-Ok "Service URL: $serviceUrl"
Write-Host "`n$result`n" -ForegroundColor Green
