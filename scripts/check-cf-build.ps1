# =============================================================================
# Cloudflare Pages Build Status Checker
# File: scripts/check-cf-build.ps1
#
# Tự động check trạng thái build + show log lỗi nếu fail
# Cần set biến môi trường: CF_API_TOKEN + CF_ACCOUNT_ID + CF_PROJECT_NAME
#
# Cách tạo CF_API_TOKEN:
#   1. Vào https://dash.cloudflare.com/profile/api-tokens
#   2. Create Token → Edit Cloudflare Pages template
#   3. Permissions: Account > Cloudflare Pages > Edit
#   4. Account Resources: chọn account chứa project
#
# Lấy CF_ACCOUNT_ID: Dashboard > Workers & Pages > click vào project > Overview > Account ID
# =============================================================================

param(
  [string]$Branch = "main",
  [int]$Limit = 5
)

$ErrorActionPreference = "Stop"

# === Load env ===
$envFile = Join-Path $PSScriptRoot ".." ".env.production"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim().Trim('"').Trim("'")
      if (-not [string]::IsNullOrWhiteSpace($env:$key)) {
        # keep existing env
      } else {
        Set-Item -Path "Env:$key" -Value $val
      }
    }
  }
}

$token = $env:CF_API_TOKEN
$accountId = $env:CF_ACCOUNT_ID
$projectName = $env:CF_PROJECT_NAME

if (-not $token) {
  Write-Host "❌ Missing CF_API_TOKEN" -ForegroundColor Red
  Write-Host "Set biến môi trường: \$env:CF_API_TOKEN = 'your-token'" -ForegroundColor Yellow
  exit 1
}
if (-not $accountId) {
  Write-Host "❌ Missing CF_ACCOUNT_ID" -ForegroundColor Red
  exit 1
}
if (-not $projectName) {
  $projectName = "inventory-pro-web"
  Write-Host "ℹ️  Using default project: $projectName" -ForegroundColor Cyan
}

Write-Host "`n=== Cloudflare Pages Build Status ===" -ForegroundColor Cyan
Write-Host "Project: $projectName"
Write-Host "Branch:  $Branch"
Write-Host ""

# === List recent deployments ===
$url = "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName/deployments?per_page=$Limit"
$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

try {
  $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
  $deployments = $response.result
} catch {
  Write-Host "❌ API call failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}

if ($deployments.Count -eq 0) {
  Write-Host "No deployments found" -ForegroundColor Yellow
  exit 0
}

# === Show each deployment ===
$deployments | ForEach-Object {
  $d = $_
  $createdAt = ([DateTime]$d.created_on).ToLocalTime()
  $statusColor = switch ($d.latest_stage.status) {
    "success" { "Green" }
    "failure" { "Red" }
    "active" { "Yellow" }
    default  { "Gray" }
  }
  $statusEmoji = switch ($d.latest_stage.status) {
    "success" { "✅" }
    "failure" { "❌" }
    "active"  { "🔄" }
    default   { "❓" }
  }

  Write-Host "$statusEmoji $($d.id)" -ForegroundColor $statusColor -NoNewline
  Write-Host "  [$($d.latest_stage.name)]" -NoNewline
  Write-Host "  $($d.latest_stage.status)" -ForegroundColor $statusColor
  Write-Host "   Branch: $($d.deployment_trigger.metadata.branch)" -ForegroundColor Gray
  Write-Host "   Commit: $($d.deployment_trigger.metadata.commit_message)" -ForegroundColor Gray
  Write-Host "   Time:   $createdAt" -ForegroundColor Gray
  Write-Host "   URL:    $($d.url)" -ForegroundColor Gray
  Write-Host ""
}

# === Show latest failure log if any ===
$latestFailure = $deployments | Where-Object { $_.latest_stage.status -eq "failure" } | Select-Object -First 1
if ($latestFailure) {
  Write-Host "=== Latest failure log ===" -ForegroundColor Red
  Write-Host "URL: https://dash.cloudflare.com/?to=/:account/pages/view/$projectName/$($latestFailure.id)" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Checking log..." -ForegroundColor Cyan

  $logUrl = "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName/deployments/$($latestFailure.id)/history"
  try {
    $logResponse = Invoke-RestMethod -Uri $logUrl -Headers $headers -Method Get
    $logResponse.result | ForEach-Object {
      if ($_.event -eq "fail" -or $_.event -eq "error") {
        Write-Host "  ❌ $($_.event): $($_.text)" -ForegroundColor Red
      } else {
        Write-Host "  $($_.event): $($_.text)" -ForegroundColor Gray
      }
    }
  } catch {
    Write-Host "Cannot fetch log: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
