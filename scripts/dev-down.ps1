# Tear down the local Ledgerline development stack.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Stopping local infrastructure..." -ForegroundColor Cyan
$composeFile = 'infra/docker/docker-compose.yml'
if (Test-Path $composeFile) {
  docker compose -f $composeFile down
}

Write-Host "Done. To reclaim Docker space: docker system prune -a" -ForegroundColor Green
