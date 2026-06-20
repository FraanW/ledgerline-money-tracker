// :api — the v0 HTTP read/app surface for the Money Tracker frontend (Sweep 2).
//
// One module, one concern: every query + app-loop endpoint the Next.js app
// consumes, in one place (which is also what Sweep 5's endpoint doc indexes).
// Controllers here are THIN: parse/gate via ApiGate (headers → UUIDs → RBAC
// permission), then run tenant-scoped SQL through TenantContext, or delegate
// to LedgerService for money movements (never raw ledger SQL here — the M12
// invariants live in exactly one place).
//
// v0 identity posture matches ingestion: X-Tenant-Id + X-User-Id headers,
// RBAC-gated per resource. Supabase JWT later replaces the header source in
// ApiGate without touching any controller.
//
// LIBRARY module (registered via :app's component scan).

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
    api(project(":identity"))
    // Money movements (allocate/income/ensure-envelope) go through M12.
    api(project(":envelope-ledger"))

    api("org.springframework.boot:spring-boot-starter-jdbc")
    api("org.springframework.boot:spring-boot-starter-web")

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
