$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backend = Join-Path $root "backend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host ""
Write-Host "=== OnBirdie Bootstrap ===" -ForegroundColor Cyan

# --- Node ---
Write-Host ""
Write-Host "[1/3] Installing Node dependencies..." -ForegroundColor Yellow
Push-Location $root
npm install --silent
Pop-Location

# --- Python venv ---
if (-not (Test-Path $venvPython)) {
    Write-Host ""
    Write-Host "[2/3] Creating Python venv..." -ForegroundColor Yellow
    python -m venv (Join-Path $backend ".venv")
} else {
    Write-Host ""
    Write-Host "[2/3] Python venv exists" -ForegroundColor Yellow
}

# --- pip ---
Write-Host ""
Write-Host "[3/3] Installing Python dependencies..." -ForegroundColor Yellow
& $venvPython -m pip install -q -r (Join-Path $backend "requirements.txt")

# --- .env ---
$envFile = Join-Path $backend ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $backend ".env.example") $envFile
    Write-Host ""
    Write-Host "Created backend\.env from .env.example -- fill in your keys." -ForegroundColor Magenta
}

Write-Host ""
Write-Host "=== Bootstrap finished ===" -ForegroundColor Green
Write-Host ""
Write-Host "  • VS Code extension: press F5 (Run Extension) — this does NOT start the API." -ForegroundColor Gray
Write-Host "  • API server: open a terminal and run:  .\scripts\dev.ps1" -ForegroundColor Cyan
Write-Host "    Leave that terminal open while you use OnBirdie." -ForegroundColor Gray
Write-Host ""
