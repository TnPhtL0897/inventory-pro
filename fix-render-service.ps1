# =============================================================================
# FIX RENDER SERVICE CONFIG (không tạo lại)
# =============================================================================
# Update existing service để:
#   - rootDir = "" (repo root)
#   - dockerfilePath = "apps/api/Dockerfile"
#   - ASPNETCORE_URLS = http://+:$PORT
# Sau đó trigger redeploy.
#
# Yêu cầu:
#   $env:RENDER_API_KEY = "rnd_xxx"
# =============================================================================

param(
  [string]$RenderApiKey = $env:RENDER_API_KEY,
  [string]$ServiceId    = "srv-d8j8h248aovs73929qng",
  [string]$RepoUrl      = "https://github.com/TnPhtL0897/inventory-pro",
  [string]$Branch       = "main"
)

$ErrorActionPreference = "Stop"
$headers = @{
  "Accept"        = "application/json"
  "Authorization" = "Bearer $RenderApiKey"
  "Content-Type"  = "application/json"
}

if (-not $RenderApiKey) {
  Write-Host "[ERR] RENDER_API_KEY missing. Set: `$env:RENDER_API_KEY = 'rnd_xxx'" -ForegroundColor Red
  exit 1
}

function Write-Section($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok($m)     { Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn($m)   { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err($m)    { Write-Host "[ERR] $m" -ForegroundColor Red }

# =============================================================================
# STEP 1: Get current service config
# =============================================================================
Write-Section "Step 1: Fetch current service config"

try {
  $svc = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" `
    -Method Get -Headers $headers -TimeoutSec 30
  $detail = $svc.service.serviceDetails
  Write-Ok "Service: $($svc.service.name)"
  Write-Ok "Current rootDir: '$($detail.rootDir)'"
  Write-Ok "Current dockerfilePath: '$($detail.dockerfilePath)'"
  Write-Ok "Current envVars count: $($detail.envVars.Count)"
} catch {
  Write-Err "Failed to fetch service: $_"
  exit 1
}

# =============================================================================
# STEP 2: Build PATCH body với rootDir="" + dockerfilePath đúng
# =============================================================================
Write-Section "Step 2: PATCH service config"

# Giữ nguyên envVars hiện tại, chỉ sửa rootDir + dockerfilePath
$body = @{
  serviceDetails = @{
    rootDir        = ""
    dockerfilePath = "apps/api/Dockerfile"
  }
} | ConvertTo-Json -Depth 10

Write-Host "PATCH body: $body"

try {
  Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" `
    -Method Patch -Headers $headers -Body $body -TimeoutSec 30
  Write-Ok "Service updated"
} catch {
  $err = $_.Exception.Response
  if ($err) {
    $reader = New-Object System.IO.StreamReader($err.GetResponseStream())
    Write-Err "PATCH failed: $($reader.ReadToEnd())"
  } else {
    Write-Err "PATCH failed: $_"
  }
  exit 1
}

# =============================================================================
# STEP 3: Trigger deploy
# =============================================================================
Write-Section "Step 3: Trigger deploy"

try {
  $deploy = Invoke-RestMethod `
    -Uri "https://api.render.com/v1/services/$ServiceId/deploys" `
    -Method Post -Headers $headers -TimeoutSec 30
  $deployId = $deploy.id
  Write-Ok "Deploy triggered: $deployId"
} catch {
  $err = $_.Exception.Response
  if ($err) {
    $reader = New-Object System.IO.StreamReader($err.GetResponseStream())
    Write-Err "Deploy trigger failed: $($reader.ReadToEnd())"
  } else {
    Write-Err "Deploy trigger failed: $_"
  }
  exit 1
}

# =============================================================================
# STEP 4: Poll deploy status
# =============================================================================
Write-Section "Step 4: Poll deploy status (max 15 min)"

$maxSeconds = 900
$elapsed = 0
$pollInterval = 15
$status = $null

while ($elapsed -lt $maxSeconds) {
  Start-Sleep -Seconds $pollInterval
  $elapsed += $pollInterval
  try {
    $deploysResp = Invoke-RestMethod `
      -Uri "https://api.render.com/v1/services/$ServiceId/deploys?limit=1" `
      -Method Get -Headers $headers -TimeoutSec 30
    $current = $deploysResp[0]
    if ($current) {
      $status = $current.deploy.status
      Write-Host "[$($elapsed)s] status=$status" -ForegroundColor Gray

      if ($status -eq "live") {
        Write-Ok "DEPLOY LIVE!"
        break
      } elseif ($status -in @("build_failed", "deploy_failed", "canceled")) {
        Write-Err "DEPLOY FAILED: $status"

        # Lấy logs
        Write-Section "Build logs (last 80 lines)"
        try {
          $logs = Invoke-RestMethod `
            -Uri "https://api.render.com/v1/services/$ServiceId/deploys/$($current.deploy.id)/logs" `
            -Method Get -Headers $headers -TimeoutSec 30
          if ($logs.logs) {
            $logs.logs | Select-Object -Last 80 | ForEach-Object { Write-Host $_.message }
          } else {
            $logs | ConvertTo-Json -Depth 3 | Out-Host
          }
        } catch {
          Write-Warn "Cannot fetch logs: $_"
        }
        exit 1
      }
    }
  } catch {
    Write-Warn "[$($elapsed)s] poll error: $_"
  }
}

if ($status -ne "live") {
  Write-Err "Deploy did not reach 'live' within 15 min. Final status: $status"
  exit 1
}

# =============================================================================
# STEP 5: Health check
# =============================================================================
Write-Section "Step 5: Health check"

$serviceUrl = $svc.service.serviceDetails.url
$healthOk = $false
for ($i = 1; $i -le 5; $i++) {
  Start-Sleep -Seconds 3
  try {
    $h = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get -TimeoutSec 15 -ErrorAction Stop
    Write-Ok "Health: $($h | ConvertTo-Json -Compress)"
    if ($h.status -eq "Healthy" -or $h.status -eq "healthy") {
      $healthOk = $true
      break
    }
  } catch {
    Write-Warn "Health attempt $i failed: $_"
  }
}

if ($healthOk) {
  Write-Ok "ALL GREEN! Service is live and healthy at $serviceUrl"
  exit 0
} else {
  Write-Warn "Service live but health check still failing. Check logs."
  exit 1
}
