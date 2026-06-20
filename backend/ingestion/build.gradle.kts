// :ingestion — M1: statement-upload ingestion (parse → normalise → dedup).
//
// The v0 "front door" of the Money Tracker pipeline. Takes a CSV bank statement
// from the user, parses it into raw rows, normalises each row into a domain
// Transaction, computes a stable dedup_hash, and inserts via
// `INSERT ... ON CONFLICT (tenant_id, dedup_hash) DO NOTHING RETURNING id` so
// the DB is the serialisation point — re-uploading the same file is safe.
//
// This is a LIBRARY module (the controller is registered via component scan
// from :app). It depends on :contracts (for Transaction/Money/IngestionSource)
// and :platform-db (for TenantContext / RLS). The parser strategy seam
// (StatementParser) is what lets the v1 Account Aggregator adapter slot in
// without rewriting downstream — see ADR-0003.
//
// Why Apache Commons CSV: the lightweight, dependency-light, well-known CSV
// parser with header-name access. Zero transitive web/json/etc. — perfect for
// a parser library. ~70KB jar, MIT-style Apache 2.0, no surprises.
//
// See:
//   * context/deep-dives/money-tracker/02-system-architecture.md (M1)
//   * context/deep-dives/money-tracker/01a-user-journey.md (step 2 — v0 upload)
//   * context/decisions/ADR-0003-statement-upload-precursor.md

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
    // RbacService for the controller's X-User-Id → statement:write gate.
    api(project(":identity"))

    // JdbcTemplate for the INSERT ... ON CONFLICT path (mirror of envelope-ledger).
    api("org.springframework.boot:spring-boot-starter-jdbc")
    // Spring Web for the thin HTTP controller (multipart upload + JSON response).
    // `api` so :app picks up @RestController + Multipart auto-config transitively.
    api("org.springframework.boot:spring-boot-starter-web")

    // Apache Commons CSV — the strategy-pattern parser's implementation library.
    // Stable, dependency-light (no transitive deps), Apache 2.0.
    api("org.apache.commons:commons-csv:1.12.0")

    // Apache PDFBox — password-protected PDF bank statements (Indian banks
    // mail these; the user supplies the password and we unlock ON THE FLY,
    // in memory only). Decrypt + text extraction; table parsing is ours.
    api("org.apache.pdfbox:pdfbox:3.0.3")

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
