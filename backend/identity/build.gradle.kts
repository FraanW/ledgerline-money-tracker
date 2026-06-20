// :identity — the identity + data-driven RBAC layer (migrations V7/V8/V9).
//
// Three concerns live here:
//
//   1. IdentityService — CONTROL-PLANE provisioning: upsert a user on first
//      (Supabase) sign-in, create a workspace (tenant + tenant_settings +
//      first `owner` membership), list a user's memberships. These paths run
//      on the privileged/owner connection by design — see the class javadoc
//      and ADR-0011's control-plane section.
//
//   2. RbacService — the per-request permission gate. Runs INSIDE the tenant
//      context (works under the non-superuser app role): membership →
//      role_permissions → permissions, `requirePermission` throws Forbidden.
//
//   3. IdentityController — thin v0 HTTP endpoints for the above. v0 does NOT
//      validate a JWT yet (same posture as the X-Tenant-Id header in M1);
//      Supabase JWT validation replaces the header trust in a later sweep
//      with no change to the services.
//
// LIBRARY module (beans register via :app's component scan). Depends only on
// :contracts and :platform-db — everything else may depend on it (ingestion's
// controller uses RbacService) without cycles.

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

    // JdbcTemplate + TransactionTemplate for the control-plane paths.
    api("org.springframework.boot:spring-boot-starter-jdbc")
    // Spring Web for the thin HTTP controller + the 403 advice.
    api("org.springframework.boot:spring-boot-starter-web")
    // Supabase JWT verification: JWKS fetch + ES256/RS256 signature checks.
    api("com.nimbusds:nimbus-jose-jwt:9.47")

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
