# `backend/` — Ledgerline JVM Backend (Java 21 + Spring Boot)

The Java/Spring Boot home for Ledgerline's backend modules. This replaces the
TypeScript backend baseline (the `services/*` TS modules and `packages/db-client`)
with a Gradle multi-module JVM build. The decision and rationale are recorded in
`context/decisions/` (Java/Spring switch for Indian-fintech-backend career signal;
architecture is a wash per Spock — done now because the services were still empty).

> **What carried over verbatim:** the M5 SQL schema + RLS policies. The three
> `infra/db/migrations/000{1,2,3}_*.sql` files are copied byte-for-byte into
> `platform-db/src/main/resources/db/migration/V{1,2,3}__*.sql` (Flyway naming).
> They are the validated keeper.

---

## Toolchain

| Thing | Choice |
|---|---|
| Language | **Java 21** (toolchain-pinned; the build will use a JDK 21 even if launched on 17) |
| Framework | **Spring Boot 3.4.x** |
| Build | **Gradle (Kotlin DSL)** + the committed wrapper (`./gradlew`, Gradle 8.12) |
| Migrations | **Flyway** (runs on app boot; also runnable standalone) |
| Ledger posting path | **`JdbcTemplate` (explicit SQL)** — NOT JPA (avoids the `@Transactional` self-invocation proxy trap and ORM flush surprises) |
| Tenant isolation | **transaction-scoped `set_config('app.current_tenant', ?, true)`** — never a `ThreadLocal` (which leaks across pooled connections) |

## Modules

```
backend/
├── settings.gradle.kts        :contracts, :platform-db, :app
├── build.gradle.kts           shared config (Java 21 toolchain, test wiring)
├── gradlew / gradlew.bat      committed wrapper
├── contracts/                 :contracts — pure-Java domain + event contracts
│   └── com.ledgerline.contracts   Money, enums, Tenant/Account/Transaction/...
│       .events                     EventEnvelope, Topics, payloads (sealed union)
├── platform-db/               :platform-db — DataSource + RLS context + migrations
│   ├── …/db/TenantContext.java     the withTenant(...) mechanism (supersedes db-client)
│   ├── …/resources/db/migration/   V1/V2/V3 (verbatim from infra/db/migrations)
│   └── …/test/…/RlsIsolationTest   the RLS isolation proof (replica of verify-rls.ts)
└── app/                       :app — bootable Spring Boot app
    ├── LedgerlineApplication.java
    ├── resources/application.yml    env-driven datasource + Actuator health
    └── …/test/…/ApplicationBootTest boots + Flyway-applies against real PG
```

- **`:contracts`** is the Java mirror of `packages/types` (TS). The duplication is
  intentional — the Next.js frontend and event consumers still use the TS types;
  these Java records are the backend mirror. A codegen step from one source of
  truth is a future option, not done here.
- **`:platform-db`** owns the runtime DataSource, the RLS tenant-context
  mechanism, and the Flyway migrations. It **supersedes `packages/db-client`** (TS).
- **`:app`** is a thin bootable shell: wires `:platform-db`, applies Flyway on
  boot, exposes Actuator health (the M16 observability foothold). Business logic
  lands in later modules.

---

## Coexistence with the pnpm workspace

The repo is a hybrid: a pnpm workspace (`apps/*`, `services/*`, `packages/*`) and
this Gradle JVM root. They are kept strictly separate:

- **`backend/` is NOT in any `pnpm-workspace.yaml` glob.** pnpm never sees it;
  Gradle never sees the pnpm tree. No `package.json` lives anywhere under
  `backend/`, so pnpm's `services/*`-style discovery cannot pick up Java modules.
- **`apps/` (Next.js) stays pnpm.** The frontend keeps using `packages/types` (TS).
- **The Python embedder (`services/embedder/`) stays a venv sidecar** — unchanged.
- The empty TS placeholders under `services/` for modules now (re)written in Java
  are retired in favour of `backend/` (see `services/README.md` and
  `docs/MODULE-MAP.md`). Pure-TS modules (e.g. the embedder) are unaffected.

This is the "dedicated JVM root" option from the brief — chosen over converting
`services/` to Gradle because it leaves the pnpm workspace and the Next.js apps
completely untouched.

---

## Database connection — env-driven (alt-port aware)

The datasource is driven **entirely from the environment**; nothing is hard-coded.
A native PG17 may squat host `5432` with non-`ledgerline` creds, so:

| Variable | Default | Meaning |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/ledgerline` | JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | `ledgerline` | owner/migration role |
| `SPRING_DATASOURCE_PASSWORD` | `ledgerline` | |
| `SERVER_PORT` | `8080` | HTTP port |

This datasource connects as the **owner/migration role** (`ledgerline`): Flyway V1
creates the `ledgerline_app` role and V3 sets `FORCE ROW LEVEL SECURITY` — both
require the owner. Runtime tenant-scoped work is still subject to RLS because every
table has `FORCE` RLS; a production deploy may instead point this at the
non-superuser `ledgerline_app` role.

**`.env.local` is never touched** — its Supabase `DATABASE_URL` is left alone.

### Alt-port override (when 5432 is taken)

Bring a Postgres up on `5433` and point the app at it:

```powershell
# a standalone Postgres on 5433 (or add a ports override to infra/docker/docker-compose.yml)
docker run -d --name ledgerline-pg-alt `
  -e POSTGRES_USER=ledgerline -e POSTGRES_PASSWORD=ledgerline -e POSTGRES_DB=ledgerline `
  -p 5433:5432 pgvector/pgvector:pg16

$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://localhost:5433/ledgerline"
./gradlew bootRun
```

---

## RLS tenant-context mechanism

`com.ledgerline.platform.db.TenantContext` is the Java successor to the TS
`db-client` `withTenant` helper:

```java
tenantContext.withTenant(tenantId, jdbc -> {
    // every query here is filtered by the M5 RLS policies for tenantId
    return jdbc.queryForList("SELECT * FROM transactions", ...);
});
```

It opens one transaction, runs `SELECT set_config('app.current_tenant', ?, true)`
(the `true` = transaction-LOCAL, the parameterisable equivalent of `SET LOCAL`,
with the tenant id bound as a parameter — never string-interpolated), then runs the
work on the **same connection** via a transaction-bound `JdbcTemplate`. On
commit/rollback the GUC is released automatically, so a pooled connection never
leaks a stale tenant.

**Why transaction-scoped, never `ThreadLocal`:** the GUC lives on the physical
connection; a `ThreadLocal` lives on the thread. With a pool the two desync
(connection reused on another thread; thread reused for another tenant). Binding
the tenant to the transaction — the unit that owns both the connection and the
`SET LOCAL` lifetime — keeps them in lockstep. No tenant state exists outside the
transaction.

---

## Build / run / test

All commands run from `backend/`. The build is toolchain-pinned to Java 21; set
`JAVA_HOME` to a JDK 21 if your default `java` is older.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'

# Compile + run all tests + assemble jars
./gradlew build

# Run the app (env-driven datasource; see table above)
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://localhost:5433/ledgerline"
./gradlew bootRun
# health: GET http://localhost:8080/actuator/health  ->  {"status":"UP"}
```

### Integration tests — two datasource modes

The RLS isolation test and the app boot test run against a real Postgres 16,
resolved at runtime:

1. **External (alt-port) mode** — pass an existing Postgres and Testcontainers is
   bypassed entirely (the Docker-API client did not negotiate cleanly with the
   local Docker Desktop 29.x daemon, so this is the path used on this machine):

   ```powershell
   $env:TEST_DATABASE_URL = "jdbc:postgresql://localhost:5433/ledgerline"
   ./gradlew build
   # or: ./gradlew build -Pledgerline.test.jdbc-url=jdbc:postgresql://localhost:5433/ledgerline
   ```

2. **Testcontainers mode** — default when neither `TEST_DATABASE_URL` nor
   `-Pledgerline.test.jdbc-url` is set; spins up an ephemeral
   `pgvector/pgvector:pg16` container (CI default, any Testcontainers-compatible
   daemon).

The `ledgerline_app` non-superuser role used by the RLS proof is created by
migration V1, so either mode exercises true RLS isolation as that role.
