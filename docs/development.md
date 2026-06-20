# Development — Ledgerline

Day-to-day developer workflow.

## Prerequisites

You should already have (from the setup phase):

- **JDK 21** (the backend Gradle build is toolchain-pinned to Java 21)
- Node 22, pnpm 11, Python 3.11
- Docker Desktop (Linux containers, WSL2 backend)
- kubectl, helm, k3d, k6 — all in `D:\Tools\bin`
- A populated `.env.local` (copy from `.env.example`; fill in keys per `context/how/cloud-accounts-checklist.md`)

> **The repo is polyglot ([ADR-0004](../context/decisions/ADR-0004-backend-spring-boot.md)).**
> The backend is **Java 21 + Spring Boot**, in a Gradle multi-module root at
> `backend/` that lives **outside** the pnpm workspace. The frontend (`apps/`) and
> the Python `embedder` sidecar stay on pnpm / venv. So you run `./gradlew` for
> backend work and `pnpm` for everything else; the two never touch.

If anything is missing, see [../README.md](../README.md) Section 3.4 and the cloud accounts checklist.

## First-time setup

From `projects/ledgerline/`:

```powershell
# Install all (frontend + TS service) workspace dependencies (shared store at D:\pnpm-store)
pnpm install

# Bring up local infrastructure (Postgres, Redis, Redpanda) via docker-compose
docker compose -f infra/docker/docker-compose.yml up -d
```

The **M5 schema + RLS are now Flyway migrations** (`V1/V2/V3`) owned by the Java
backend, applied automatically when the Spring Boot app boots. There is no
separate migration command and **no TS `db-client`** anymore (both the old
`packages/db-client` and the `infra/db/migrations/` copy were deleted — see
[ADR-0004](../context/decisions/ADR-0004-backend-spring-boot.md)). To apply
migrations and prove RLS, run the backend (next section).

> **Alt-port note.** A native PG17 may already squat host `5432` with non-ledgerline
> creds. The backend datasource is **env-driven** — bring a Postgres up on `5433`
> and point `SPRING_DATASOURCE_URL` at it. See `backend/README.md` for the full
> alt-port recipe.

## Backend (Java + Spring Boot)

All backend commands run from `backend/`. The build is toolchain-pinned to Java 21;
set `JAVA_HOME` to a JDK 21 if your default `java` is older.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'

# Compile + run all tests (incl. the RLS isolation proof) + assemble jars
./gradlew build

# Run the app: auto-configures the DataSource, applies Flyway V1/V2/V3 on boot,
# exposes Actuator health. (env-driven datasource; alt-port example below)
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://localhost:5433/ledgerline"
./gradlew bootRun
# health: GET http://localhost:8080/actuator/health  ->  {"status":"UP"}
```

### Proving multi-tenant RLS

RLS isolation is an assertion-driven integration test — `RlsIsolationTest` in
`backend/platform-db` — not a manual script. It applies the migrations, then (as
the non-superuser `ledgerline_app` role, since superusers bypass RLS) asserts a
tenant-A connection sees only A's rows, an un-scoped connection sees zero, and a
tenant-A connection cannot write a tenant-B row. It runs as part of `./gradlew build`.

The integration tests resolve a real Postgres 16 at runtime in two modes:

```powershell
# External (alt-port) mode — pass an existing Postgres; Testcontainers is bypassed
$env:TEST_DATABASE_URL = "jdbc:postgresql://localhost:5433/ledgerline"
./gradlew build

# Testcontainers mode — the default when neither TEST_DATABASE_URL nor
# -Pledgerline.test.jdbc-url is set; spins up an ephemeral pgvector/pgvector:pg16.
./gradlew build
```

To add a backend module, add a Gradle subproject under `backend/` and `include`
it in `backend/settings.gradle.kts` (see `backend/README.md` and `docs/MODULE-MAP.md`).

## Working on a TypeScript service

The backend core is Java (see the Backend section above). The remaining
TypeScript services are self-contained pnpm packages under `services/<name>/`.
From the repo root:

```powershell
# Run one service in watch mode
pnpm --filter @ledgerline/ingestion dev

# Lint + typecheck + test that service only
pnpm --filter @ledgerline/ingestion lint
pnpm --filter @ledgerline/ingestion typecheck
pnpm --filter @ledgerline/ingestion test
```

To run multiple services together, use the local-stack script:

```powershell
# Starts every service in parallel with hot-reload
pnpm dev
```

## Python services (the embedder)

Python services live in their own venv per service. From `services/embedder/`:

```powershell
# First time: create venv pinned to Python 3.11
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Day-to-day
.\.venv\Scripts\Activate.ps1
python -m embedder.serve
```

**Never** `pip install` outside a venv. Every Python service's venv lives in its own `services/<name>/.venv/` and is gitignored.

## Local Kubernetes (k3d)

For module development that touches k8s manifests (M15, M18) or for trying out the full stack:

```powershell
# Spin up a local k3s cluster in Docker
k3d cluster create ledgerline --servers 1 --agents 2 --port "8080:80@loadbalancer"

# Point kubectl at it
kubectl config use-context k3d-ledgerline

# Apply manifests
kubectl apply -f infra/k8s/local/

# Tear down when done
k3d cluster delete ledgerline
```

The k3d cluster lives entirely inside Docker — when you're done, deleting it frees all space.

## Load testing (M17)

```powershell
# Run a single scenario
k6 run infra/load-tests/scenarios/ingestion-1k-tps.js

# Run the full suite (takes ~30 min)
k6 run infra/load-tests/all.js
```

## Common gotchas

- **`pnpm install` is slow the first time** — it's downloading every dep into `D:\pnpm-store`. Subsequent installs hard-link from the store and finish in seconds.
- **`docker compose` (note the space) is the modern command** — old `docker-compose` is deprecated. The repo uses the modern form.
- **Python venvs are per-service** — don't try to share one venv across `services/embedder/` and (eventually) any other Python service. Each gets its own `.venv` and `requirements.txt`.
- **Run `docker system prune -a` every few weeks** to clear unused images. Docker images on D:\ otherwise accumulate to 10+ GB over time.
- **The OpenRouter `$3` cap is enforced on their side.** If a worker starts looping and burns through it, OpenRouter returns 402 — code should detect that and degrade gracefully, not crash.
