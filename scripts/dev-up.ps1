# Bring up the local Ledgerline development stack.
#
# Starts Postgres, Redis, and Redpanda in Docker via docker-compose, runs
# migrations, and prints connection strings. Doesn't start application
# services - use `pnpm dev` for those.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "=== Ledgerline local dev stack ===" -ForegroundColor Cyan

# 1. Verify Docker is running
try {
  docker version --format '{{.Server.Version}}' | Out-Null
} catch {
  Write-Host "Docker is not running. Start Docker Desktop and re-run this script." -ForegroundColor Red
  exit 1
}

# 2. Verify .env.local exists
if (-not (Test-Path '.env.local')) {
  Write-Host ".env.local missing. Copying from .env.example - fill in keys before running services." -ForegroundColor Yellow
  Copy-Item '.env.example' '.env.local'
}

# 3. Bring up infrastructure
Write-Host "Starting Postgres, Redis, Redpanda..." -ForegroundColor Cyan
$composeFile = 'infra/docker/docker-compose.yml'
if (-not (Test-Path $composeFile)) {
  Write-Host "docker-compose.yml not yet authored at $composeFile. Skipping infrastructure boot." -ForegroundColor Yellow
} else {
  docker compose -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose failed." -ForegroundColor Red
    exit 1
  }
}

# 4. Show what's running and their ports
Write-Host ""
Write-Host "=== Local connection strings ===" -ForegroundColor Cyan
Write-Host "  Postgres:  postgres://ledgerline:ledgerline@localhost:5432/ledgerline"
Write-Host "  Redis:     redis://localhost:6379"
Write-Host "  Redpanda:  localhost:19092   (external port - 9092 is internal docker network only)"
Write-Host "  Redpanda Console UI:  http://localhost:8088"
Write-Host ""
Write-Host "Next: pnpm dev   (starts application services)" -ForegroundColor Green
