$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backend = Join-Path $root "backend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host ""
Write-Host "=== Starting OnBirdie backend ===" -ForegroundColor Cyan
Write-Host "API will run at http://127.0.0.1:8000"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

Set-Location $backend
& $venvPython -m uvicorn app.main:app --reload
