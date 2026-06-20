# Module Map — Ledgerline

Canonical mapping of the 18 modules (defined in [`../README.md`](../README.md)) to their physical home in the repo. **One module, one folder.** When you open a module's folder, you should find its source, its tests, its README, and nothing else.

## Apps (`apps/`)

Thin Next.js shells, one per product surface.

| Module(s) it surfaces | Folder | Owner |
|---|---|---|
| Surface 1 (M7, M13) | `apps/subscription-killer/` | Fraan-1 |
| Surface 2 (M8, M9) | `apps/invoice-hub/` | Fraan-2 |
| Surface 3 (M10, M11, M12) | `apps/money-tracker/` | Fraan-1 |

## JVM backend (`backend/`)

> **2026-05-26 — backend language switch ([ADR-0004](../context/decisions/ADR-0004-backend-spring-boot.md)).**
> The Ledgerline backend runs on **Java 21 + Spring Boot** in a dedicated Gradle
> multi-module root at `backend/` (outside the pnpm workspace). The backend
> modules originally slated as TypeScript `services/*` are (re)homed here as the
> engine is rebuilt in Java. The **foundation is built and proven** (Flyway
> applies V1-V3, `RlsIsolationTest` passes, the app boots, `/actuator/health` is
> `UP`):
>
> | Concern | Home | Language | Status |
> |---|---|---|---|
> | Domain + event contracts (mirror of `packages/types`) | `backend/contracts/` | Java | built |
> | M5 — DataSource + transaction-scoped RLS tenant-context + Flyway migrations | `backend/platform-db/` | Java + SQL | built & proven |
> | Bootable app + Flyway-on-boot + Actuator health | `backend/app/` | Java | built & proven |
>
> The `services/*` table below is retained for modules still planned in
> **TypeScript** (Node) plus the **Python** `embedder` sidecar; those are
> unaffected by the switch. Java-bound modules migrate into `backend/` as they are
> built. The TS `packages/db-client` and the old `infra/db/migrations/` copy were
> **deleted** — superseded by `backend/platform-db` (the M5 SQL ported verbatim
> into Flyway `V1/V2/V3`). See `backend/README.md`.

## Backend services (`services/`)

One folder per module that's a long-running process, worker, or HTTP service.

| Module | Folder | Owner | Language |
|---|---|---|---|
| M1 — Multi-source ingestion pipeline | `services/ingestion/` | Fraan-1 | TypeScript (Node) |
| M2 — Idempotent dedup | `services/dedup/` | Fraan-1 | TypeScript (Node) |
| M3 — Vendor canonicalization (regex + embedding) | `services/canonicalizer/` | Fraan-1 | TypeScript (Node) |
| M3 — embedding sidecar (local MiniLM) | `services/embedder/` | Fraan-1 | **Python 3.11** (venv) |
| M4 — Kafka outbox + CDC | `services/outbox-cdc/` | Fraan-2 | TypeScript (Node) |
| M5 — Multi-tenant Postgres + RLS | **`backend/platform-db/` (Flyway `V1/V2/V3` + `TenantContext`)** | Fraan-2 | Java + SQL |
| M6 — Hash-chained ledger + CQRS read | `services/ledger/` | Fraan-2 | TypeScript (Node) |
| M7 — Recurring-charge detector | `services/recurring-detector/` | Fraan-1 | TypeScript (Node) |
| M8 — Bank-credit ↔ invoice matcher | `services/credit-matcher/` | Fraan-2 | TypeScript (Node) |
| M9 — GST-compliant reminder engine | `services/reminder-engine/` | Fraan-2 | TypeScript (Node) |
| M10 — AA consent + fetch orchestrator | `services/aa-orchestrator/` | Fraan-1 | TypeScript (Node) |
| M11 — Categorization engine | `services/categorizer/` | Fraan-1 | TypeScript (Node) calls `services/embedder/` |
| M12 — Budget envelope ledger | `services/envelope-ledger/` | Fraan-1 | TypeScript (Node) |
| M13 — Cancel-flow automation | `services/cancel-flow/` | Fraan-1 | TypeScript (Node) |

## Shared packages (`packages/`)

Code shared across services. Imported via `workspace:*`.

| Package | Purpose |
|---|---|
| `packages/eslint-config/` | Shared ESLint flat-config |
| `packages/tsconfig/` | Shared `tsconfig.*.json` presets (`base`, `service`, `nextjs`) |
| `packages/types/` | Shared **TypeScript** types (event schemas, domain entities) — used by the Next.js frontend and TS consumers. Mirrored on the backend by `backend/contracts/` (Java). |
| `packages/kafka-client/` | Redpanda producer/consumer wrappers with idempotency helpers |
| `packages/redis-client/` | Redis client primitives — `cache`, `rateLimit`, `lock`, `idempotency` |

## Infrastructure (`infra/`)

| Folder | Module | Owner |
|---|---|---|
| `infra/docker/` | Dockerfiles per service + local `docker-compose.yml` for dev | shared |
| `infra/k8s/` | M14 (Redpanda + topics) + M15 (k3s manifests + Helm charts) + M18 (Redis manifests) | Fraan-2 |
| `infra/observability/` | M16 — OTel collector config, Prometheus/Tempo/Loki/Grafana manifests + dashboards | Fraan-2 lead, Fraan-1 pair |
| `infra/load-tests/` | M17 — k6 scenarios + capacity-plan document | Fraan-2 |

> **M5 migrations moved.** The M5 schema + RLS policies now live as Flyway
> migrations in **`backend/platform-db/src/main/resources/db/migration/`**
> (`V1/V2/V3`), applied on app boot. The old `infra/db/migrations/` working copy
> (and the TS `packages/db-client`) were **deleted** when the backend switched to
> Java + Spring Boot — see [ADR-0004](../context/decisions/ADR-0004-backend-spring-boot.md)
> and `backend/README.md`.

## Docs (`docs/`)

Technical documentation that lives with the code (separate from the recruiter-facing docs in `context/`).

| File | What it holds |
|---|---|
| `docs/MODULE-MAP.md` | This file |
| `docs/module-interfaces/` | Per-module interface specs — event schemas, HTTP routes, service contracts |
| `docs/runbooks/` | Operational runbooks (deploy, rollback, incident response) |
| `docs/development.md` | Day-to-day developer workflow — how to run the stack locally, how to add a service |

## When you add a new module

1. Add a row in this table.
2. Decide the home by language:
   - **Java backend module** → add a Gradle subproject under `backend/` (a new
     `backend/<name>/` with its own `build.gradle.kts`) and `include(":<name>")`
     it in `backend/settings.gradle.kts`. See `backend/README.md`.
   - **TypeScript service / package** → create the folder under `services/` or
     `packages/` and drop in a `package.json` naming it `@ledgerline/<folder-name>`.
   - **Python sidecar** → create the folder under `services/` with a
     `requirements.txt` and its own `.venv` (see `docs/development.md`).
3. Add an entry in `docs/module-interfaces/M<n>-<slug>.md` describing its inputs, outputs, and event schemas.
4. Update [`../README.md`](../README.md) with the new module row.
5. If the new module changes a contract, open an ADR in `context/decisions/`. Keep
   `backend/contracts/` (Java) and `packages/types/` (TS) in sync when the change
   touches a shared domain or event shape.
