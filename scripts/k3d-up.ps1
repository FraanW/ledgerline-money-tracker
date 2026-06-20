# Spin up a local k3d cluster for testing M14 (Redpanda topology),
# M15 (Helm charts), M16 (observability), M18 (Redis cluster). Mirrors
# the production Oracle Cloud k3s shape as closely as possible.

$ErrorActionPreference = 'Stop'

$clusterName = 'ledgerline'

# Skip if already exists
$existing = k3d cluster list -o json | ConvertFrom-Json
if ($existing.name -contains $clusterName) {
  Write-Host "k3d cluster '$clusterName' already exists. Use 'k3d cluster delete $clusterName' to recreate." -ForegroundColor Yellow
} else {
  Write-Host "Creating k3d cluster '$clusterName'..." -ForegroundColor Cyan
  k3d cluster create $clusterName `
    --servers 1 `
    --agents 2 `
    --port "8080:80@loadbalancer" `
    --port "8443:443@loadbalancer" `
    --k3s-arg "--disable=traefik@server:0"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "k3d cluster create failed." -ForegroundColor Red
    exit 1
  }
}

# Point kubectl at the new cluster
kubectl config use-context "k3d-$clusterName"

Write-Host ""
Write-Host "=== Cluster ready ===" -ForegroundColor Green
kubectl get nodes
Write-Host ""
Write-Host "Next: kubectl apply -f infra/k8s/local/   (when manifests exist)" -ForegroundColor Cyan
