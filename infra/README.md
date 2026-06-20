# `infra/` — Infrastructure & Operations

Everything that isn't application code — Docker, Kubernetes, observability, load tests, database schema.

| Folder | Holds |
|---|---|
| `docker/` | Dockerfiles per service + `docker-compose.yml` for local dev (Postgres + Redis + Redpanda). |
| `k8s/` | k3s manifests + Helm charts. Includes Redpanda (M14), Redis (M18), and per-service deployments (M15). |
| `db/migrations/` | Postgres schema, RLS policies, partitioning DDL (M5). |
| `observability/` | OpenTelemetry collector config, Prometheus rules, Tempo + Loki configs, Grafana dashboards (M16). |
| `load-tests/` | k6 scenarios + capacity-plan documents (M17). |

## Local vs production

We deploy the same Helm charts to two clusters with different values files:

- **Local (k3d):** `infra/k8s/values/local.yaml` — single-node, no replicas, small resource limits.
- **Production (Oracle Cloud Always-Free k3s):** `infra/k8s/values/prod.yaml` — single-node still (free tier ceiling), but realistic resource requests + HPA configs.

The charts themselves are the same; only the values differ. That's the platform's portability story.
