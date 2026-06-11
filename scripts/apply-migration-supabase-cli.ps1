# Apply yearly_forecast migration to Supabase using Supabase CLI
# Usage: powershell -ExecutionPolicy Bypass -File scripts\apply-migration-supabase-cli.ps1
$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$credFile = Join-Path $repo ".supabase-credentials"
$migrationFile = Join-Path $repo "supabase\migrations\20260610150000_yearly_forecast.sql"

if (-not (Test-Path $credFile)) {
    Write-Error "[!] .supabase-credentials not found at $credFile"
    exit 1
}
if (-not (Test-Path $migrationFile)) {
    Write-Error "[!] Migration file not found at $migrationFile"
    exit 1
}

# Read connection string from .supabase-credentials
$cred = Get-Content $credFile -Encoding UTF8 | Where-Object { $_ -match "^SUPABASE_DB_CONNECTION=" }
if (-not $cred) {
    Write-Error "[!] SUPABASE_DB_CONNECTION not in .supabase-credentials"
    exit 1
}
$rawConn = $cred -replace "^[^=]+=", ""

# Parse: postgresql://user:pwd@host:port/db
# Note: password may contain '@' so manual split needed
if ($rawConn -notmatch '^postgresql://([^:]+):(.+)@([^:]+):(\d+)/(.+)$') {
    Write-Error "[!] Cannot parse connection string: $rawConn"
    exit 1
}
$user = $matches[1]
$rawPwd = $matches[2]
$dbHost = $matches[3]
$dbPort = $matches[4]
$dbname = $matches[5]

# URL-encode password
Add-Type -AssemblyName System.Web
$encPwd = [System.Web.HttpUtility]::UrlEncode($rawPwd)
$encodedUrl = "postgresql://${user}:${encPwd}@${dbHost}:${dbPort}/${dbname}"

Write-Host "[*] Connection string (encoded):" -ForegroundColor Cyan
Write-Host "    $encodedUrl"
Write-Host ""

# Verify supabase CLI
$cli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $cli) {
    Write-Error "[!] supabase CLI not found in PATH"
    exit 1
}
Write-Host "[*] supabase CLI: $($cli.Source) ($((& supabase --version) -join ' '))"
Write-Host ""

# Apply migration
Write-Host "[*] Applying migration: $migrationFile" -ForegroundColor Cyan
Write-Host ""

try {
    # Use --db-url to specify the database directly
    # --include-all to include the migration in history table
    # --yes to skip confirmation prompts
    $output = & supabase db push --db-url $encodedUrl --include-all --yes 2>&1
    $exitCode = $LASTEXITCODE

    Write-Host "[*] Exit code: $exitCode"
    Write-Host ""
    Write-Host "[*] Output:" -ForegroundColor Cyan
    $output | ForEach-Object { Write-Host "    $_" }
    Write-Host ""

    if ($exitCode -eq 0) {
        Write-Host "[OK] Migration applied successfully" -ForegroundColor Green
        exit 0
    } else {
        Write-Error "[!] Migration failed (exit code $exitCode)"
        exit $exitCode
    }
} catch {
    Write-Error "[!] Exception: $_"
    exit 1
}
