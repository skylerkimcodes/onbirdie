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
# Watch only `app/` so .venv, __pycache__, and random file churn do not constantly reload (or destabilize) the server on Windows.
& $venvPython -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
