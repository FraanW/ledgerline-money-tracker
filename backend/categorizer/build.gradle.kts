// :categorizer — M11: the rules-based transaction categoriser + the bridge
// that wires the M1 → M11 → M12 pipeline together.
//
// Two concerns live here:
//
//   1. CategorizerService — evaluates per-tenant rules (ordered by priority,
//      gated by `enabled`) against (rawDescription, merchant) and returns the
//      matching category id (or empty). v0 is purely deterministic; the v1
//      LLM fallback will live behind the same interface as a second matcher.
//
//   2. CategorizeAndPostPublisher — the IngestionEventPublisher bean that
//      replaces M1's v0 no-op. On each ingested debit it:
//         - matches a rule (if any)
//         - persists transactions.category_id
//         - resolves the target envelope (category + period → user envelope,
//           else Unallocated pseudo)
//         - calls LedgerService.postSpend (idempotent on transactionId via V5)
//         - on WouldGoNegative, retries against Unallocated
//
// This is a LIBRARY module (the publisher bean registers via :app's component
// scan). It depends on :contracts (Transaction shape), :platform-db
// (TenantContext / RLS), :envelope-ledger (LedgerService + EnvelopeKind +
// PseudoAccountResolver path via LedgerService.ensurePseudoEnvelope), and
// :ingestion (the IngestionEventPublisher interface it implements).
//
// See:
//   * context/deep-dives/money-tracker/02-system-architecture.md  (M11)
//   * context/deep-dives/money-tracker/01a-user-journey.md        (step 3)
//   * README.md inside this module

plugins {
    `java-library`
    id("io.spring.dependency-management")
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.boot:spring-boot-dependencies:3.4.1")
    }
}

dependencies {
    api(project(":contracts"))
    api(project(":platform-db"))
    api(project(":envelope-ledger"))
    api(project(":ingestion"))

    // JdbcTemplate for rule reads + the transactions.category_id update.
    api("org.springframework.boot:spring-boot-starter-jdbc")

    // --- test: dual-mode Postgres (Testcontainers OR external alt-port) ---
    testImplementation(platform("org.testcontainers:testcontainers-bom:1.20.4"))
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.flywaydb:flyway-core")
    testImplementation("org.flywaydb:flyway-database-postgresql")
    testRuntimeOnly("org.postgresql:postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
