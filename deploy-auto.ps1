# =============================================================================
# AUTO DEPLOY SCRIPT - Quản lý Kho vật tư Pro
# =============================================================================
# Chạy: powershell -ExecutionPolicy Bypass -File deploy-auto.ps1
#
# Script này tự động:
# 1. Tạo GitHub repo mới (cần GH_TOKEN)
# 2. Push code lên GitHub
# 3. Tạo Supabase project + apply migrations (cần SUPABASE_TOKEN)
# 4. Deploy backend lên Render (cần RENDER_API_KEY)
# 5. Deploy frontend lên Vercel (cần VERCEL_TOKEN)
# 6. Verify smoke test trên URLs production
# =============================================================================

param(
  [string]$GitHubToken = $env:GH_TOKEN,
  [string]$GitHubUser = $env:GH_USER,
  [string]$RepoName = "inventory-pro",
  [string]$SupabaseToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$SupabaseOrg = $env:SUPABASE_ORG,
  [string]$SupabaseDbPassword = $env:SUPABASE_DB_PASSWORD,
  [string]$RenderApiKey = $env:RENDER_API_KEY,
  [string]$VercelToken = $env:VERCEL_TOKEN,
  [switch]$SkipSupabase = $false,
  [switch]$SkipRender = $false,
  [switch]$SkipVercel = $false,
  [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# Color helpers
function Write-Section($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)    { Write-Host "[ERR] $msg" -ForegroundColor Red }
function Write-Info($msg)   { Write-Host "[i] $msg" -ForegroundColor Gray }

# =============================================================================
# PRE-CHECK
# =============================================================================
Write-Section "Pre-check"

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err "git not found. Install Git for Windows first."
  exit 1
}
Write-Ok "git found"

# Check pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Err "pnpm not found. Install: npm install -g pnpm"
  exit 1
}
Write-Ok "pnpm found"

# Check node
$nodeVersion = (node --version)
Write-Ok "node $nodeVersion"

# Check curl
if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
  Write-Err "curl not found"
  exit 1
}
Write-Ok "curl found"

# Check working dir
if (-not (Test-Path "$ProjectRoot\package.json")) {
  Write-Err "package.json not found. Run from project root."
  exit 1
}
Write-Ok "Working dir: $ProjectRoot"

# Check tokens
$missing = @()
if (-not $GitHubToken) { $missing += "GH_TOKEN" }
if (-not $GitHubUser) { $missing += "GH_USER" }
if (-not $SkipSupabase) {
  if (-not $SupabaseToken) { $missing += "SUPABASE_ACCESS_TOKEN" }
  if (-not $SupabaseOrg) { $missing += "SUPABASE_ORG" }
  if (-not $SupabaseDbPassword) { $missing += "SUPABASE_DB_PASSWORD" }
}
if (-not $SkipRender -and -not $RenderApiKey) { $missing += "RENDER_API_KEY" }
if (-not $SkipVercel -and -not $VercelToken) { $missing += "VERCEL_TOKEN" }

if ($missing.Count -gt 0) {
  Write-Warn "Missing env vars: $($missing -join ', ')"
  Write-Info "Set them via: `$env:VAR_NAME = 'value' before running this script"
  Write-Info "Or pass as parameter: -GitHubToken xxx -VercelToken yyy ..."
  Write-Info ""
  Write-Info "TIPS:"
  Write-Info "- GH_TOKEN: https://github.com/settings/tokens (scope: repo)"
  Write-Info "- SUPABASE_ACCESS_TOKEN: https://supabase.com/dashboard/account/tokens"
  Write-Info "- SUPABASE_ORG: your org slug from https://supabase.com/dashboard/organizations"
  Write-Info "- RENDER_API_KEY: https://dashboard.render.com/u/account#api-keys"
  Write-Info "- VERCEL_TOKEN: https://vercel.com/account/tokens"
  exit 1
}

Write-Ok "All required tokens present"

# =============================================================================
# STEP 1: GITHUB - Create repo + push
# =============================================================================
Write-Section "Step 1/5: Push to GitHub"

$repoUrl = "https://$GitHubToken@github.com/$GitHubUser/$RepoName.git"

# Check if repo exists
$repoCheck = curl -s -o $null -w "%{http_code}" `
  -H "Authorization: token $GitHubToken" `
  "https://api.github.com/repos/$GitHubUser/$RepoName"

if ($repoCheck -eq "404") {
  Write-Info "Repo $RepoName does not exist. Creating..."

  if ($DryRun) {
    Write-Warn "[DRY-RUN] Would create repo $RepoName"
  } else {
    $createBody = @{
      name = $RepoName
      description = "Quản lý kho vật tư Pro - hospital inventory management"
      private = $false
      auto_init = $false
    } | ConvertTo-Json

    $createResp = curl -s -X POST `
      -H "Authorization: token $GitHubToken" `
      -H "Content-Type: application/json" `
      -d $createBody `
      "https://api.github.com/user/repos"

    if ($LASTEXITCODE -ne 0) {
      Write-Err "Failed to create repo: $createResp"
      exit 1
    }
    Write-Ok "Repo created: https://github.com/$GitHubUser/$RepoName"
  }
} elseif ($repoCheck -eq "200") {
  Write-Info "Repo $RepoName already exists. Will push to it."
} else {
  Write-Err "Failed to check repo (HTTP $repoCheck). Check GH_TOKEN."
  exit 1
}

# Set remote + push
git remote remove origin 2>$null
git remote add origin $repoUrl

Write-Info "Pushing to GitHub..."
if ($DryRun) {
  Write-Warn "[DRY-RUN] Would push to $repoUrl"
} else {
  git push -u origin main --force 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to push to GitHub"
    exit 1
  }
  Write-Ok "Pushed to https://github.com/$GitHubUser/$RepoName"
}

# =============================================================================
# STEP 2: SUPABASE - Create project + apply migrations
# =============================================================================
if ($SkipSupabase) {
  Write-Section "Step 2/5: Supabase (SKIPPED)"
  Write-Warn "Use -SkipSupabase`$false and provide tokens to enable"
} else {
  Write-Section "Step 2/5: Setup Supabase"

  if ($DryRun) {
    Write-Warn "[DRY-RUN] Would create Supabase project + apply migrations"
  } else {
    # Check if supabase CLI is available
    if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
      Write-Warn "supabase CLI not found. Install: npm install -g supabase"
      Write-Warn "Skipping Supabase setup. Apply migrations manually via Dashboard."
    } else {
      supabase login --token $SupabaseToken 2>&1 | Out-Host

      # Create project
      $projectName = "inventory-pro-$(Get-Random -Maximum 9999)"
      Write-Info "Creating Supabase project: $projectName"

      $projectResp = supabase projects create $projectName `
        --org-id $SupabaseOrg `
        --db-password $SupabaseDbPassword `
        --region ap-southeast-1 2>&1

      # Get project ref
      $projectRef = ($projectResp | Select-String "Project created at https://supabase.com/dashboard/project/(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
      if (-not $projectRef) {
        Write-Warn "Could not parse project ref. Please check Supabase dashboard manually."
      } else {
        Write-Ok "Project created: $projectRef"

        # Wait for project to be ready
        Write-Info "Waiting for project to be ready (60s)..."
        Start-Sleep -Seconds 60

        # Link project
        supabase link --project-ref $projectRef 2>&1 | Out-Host

        # Apply migrations
        $migrationsDir = "$ProjectRoot\infrastructure\supabase\migrations"
        $migrations = Get-ChildItem "$migrationsDir\*.sql" | Sort-Object Name

        Write-Info "Applying $($migrations.Count) migrations..."
        foreach ($mig in $migrations) {
          Write-Info "  -> $($mig.Name)"
          $sql = Get-Content $mig.FullName -Raw
          supabase db execute --file $mig.FullName 2>&1 | Out-Host
        }
        Write-Ok "All migrations applied"

        # Get connection details
        $supabaseUrl = "https://$projectRef.supabase.co"
        Write-Ok "Supabase URL: $supabaseUrl"
        Write-Info "Get anon key + service_role key from:"
        Write-Info "  https://supabase.com/dashboard/project/$projectRef/settings/api"
      }
    }
  }
}

# =============================================================================
# STEP 3: RENDER - Deploy backend
# =============================================================================
if ($SkipRender) {
  Write-Section "Step 3/5: Render (SKIPPED)"
} else {
  Write-Section "Step 3/5: Deploy backend to Render"

  if ($DryRun) {
    Write-Warn "[DRY-RUN] Would create Render web service"
  } else {
    # Use render.yaml blueprint
    $renderYaml = @"
services:
  - type: web
    name: inventory-pro-api
    runtime: docker
    rootDir: apps/api/src/InventoryPro.API
    dockerfilePath: ./Dockerfile
    plan: free
    envVars:
      - key: ASPNETCORE_ENVIRONMENT
        value: Production
      - key: ASPNETCORE_URLS
        value: http://+:10000
      - key: Supabase__Url
        sync: false
      - key: Supabase__JwtSecret
        sync: false
      - key: Supabase__ServiceRoleKey
        sync: false
      - key: ConnectionStrings__Supabase
        sync: false
      - key: Cors__AllowedOrigins__0
        sync: false
      - key: Replenishment__Enabled
        value: "true"
"@
    $renderYamlPath = "$ProjectRoot\render.yaml"
    Set-Content -Path $renderYamlPath -Value $renderYaml -Encoding UTF8

    # Deploy via API
    $ownerId = curl -s -H "Authorization: Bearer $RenderApiKey" "https://api.render.com/v1/owners" | ConvertFrom-Json | Select-Object -First 1 -ExpandProperty id
    $deployBody = @{
      type = "web_service"
      name = "inventory-pro-api"
      ownerId = $ownerId
      repo = "https://github.com/$GitHubUser/$RepoName"
      branch = "main"
      rootDir = "apps/api/src/InventoryPro.API"
      dockerfilePath = "./Dockerfile"
      plan = "free"
      envVars = @(
        @{ key = "ASPNETCORE_ENVIRONMENT"; value = "Production" },
        @{ key = "ASPNETCORE_URLS"; value = "http://+:10000" },
        @{ key = "Replenishment__Enabled"; value = "true" }
      )
    } | ConvertTo-Json -Depth 10

    $deployResp = curl -s -X POST `
      -H "Authorization: Bearer $RenderApiKey" `
      -H "Content-Type: application/json" `
      -d $deployBody `
      "https://api.render.com/v1/services"

    if ($LASTEXITCODE -ne 0) {
      Write-Err "Failed to create Render service: $deployResp"
      exit 1
    }

    $serviceObj = $deployResp | ConvertFrom-Json
    $serviceId = $serviceObj.service.id
    Write-Ok "Render service created: $serviceId"

    # Get URL (will be assigned after deploy)
    $serviceUrl = $serviceObj.service.serviceDetails.url
    Write-Info "Service URL: $serviceUrl"
  }
}

# =============================================================================
# STEP 4: VERCEL - Deploy frontend
# =============================================================================
if ($SkipVercel) {
  Write-Section "Step 4/5: Vercel (SKIPPED)"
} else {
  Write-Section "Step 4/5: Deploy frontend to Vercel"

  if ($DryRun) {
    Write-Warn "[DRY-RUN] Would deploy to Vercel"
  } else {
    # Login to vercel
    $env:VERCEL_TOKEN = $VercelToken

    # Deploy
    $vercelOutput = vercel --token $VercelToken --yes --confirm `
      --name "$RepoName-web" `
      --build-env NEXT_PUBLIC_API_BASE_URL="https://inventory-pro-api.onrender.com" `
      --build-env NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co" `
      --build-env NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY" `
      --root apps/web 2>&1

    $vercelOutput | Out-Host
    Write-Ok "Vercel deploy initiated"
    Write-Info "Set Supabase env vars at: https://vercel.com/dashboard"
  }
}

# =============================================================================
# STEP 5: VERIFY
# =============================================================================
Write-Section "Step 5/5: Verify deployments"

if (-not $DryRun) {
  $frontendUrl = "https://$RepoName-web.vercel.app"
  $backendUrl = "https://inventory-pro-api.onrender.com"

  Write-Info "Testing backend health..."
  $healthCheck = curl -s -o $null -w "%{http_code}" "$backendUrl/health" --max-time 30
  if ($healthCheck -eq "200") {
    Write-Ok "Backend health: 200 OK"
  } else {
    Write-Warn "Backend health: $healthCheck (may still be deploying, retry in 2-3 min)"
  }

  Write-Info "Testing frontend..."
  $frontendCheck = curl -s -o $null -w "%{http_code}" "$frontendUrl" --max-time 30
  if ($frontendCheck -eq "200" -or $frontendCheck -eq "307") {
    Write-Ok "Frontend: $frontendCheck (deployed)"
  } else {
    Write-Warn "Frontend: $frontendCheck (may still be deploying)"
  }
}

Write-Section "DEPLOY COMPLETE!"
Write-Host ""
Write-Host "GitHub:    https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
Write-Host "Backend:   https://inventory-pro-api.onrender.com" -ForegroundColor Green
Write-Host "Frontend:  https://$RepoName-web.vercel.app" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Go to Supabase Dashboard -> Settings -> API"
Write-Host "2. Copy anon key + service_role key + JWT secret"
Write-Host "3. Set them in Render dashboard (Environment)"
Write-Host "4. Set NEXT_PUBLIC_SUPABASE_* in Vercel dashboard"
Write-Host "5. Update CORS in Render: Cors__AllowedOrigins__0 = https://$RepoName-web.vercel.app"
Write-Host "6. Wait 2-3 min for backend to redeploy"
Write-Host "7. Run: pnpm smoke:prod https://$RepoName-web.vercel.app"
Write-Host ""
