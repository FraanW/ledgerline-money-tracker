// :platform-db — the DataSource + RLS tenant-context mechanism + Flyway migrations.
//
// This module SUPERSEDES packages/db-client (TS): the Java TenantContext here is
// the new home of the `withTenant` behaviour and the RLS isolation proof.
//
// It uses Spring (auto-configuration for DataSource + Flyway + JdbcTemplate) but
// is NOT a bootable application — it is a library the :app module wires up. The
// RLS isolation integration test (Testcontainers) lives here, next to the
// mechanism it proves.

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

    // JdbcTemplate + DataSource auto-config (the explicit-SQL ledger path).
    api("org.springframework.boot:spring-boot-starter-jdbc")
    // Flyway core + the PG-specific module Flyway 10+ requires for Postgres.
    api("org.flywaydb:flyway-core")
    api("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // --- test: Testcontainers Postgres for the RLS isolation proof ---
    testImplementation(platform("org.testcontainers:testcontainers-bom:1.20.4"))
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
