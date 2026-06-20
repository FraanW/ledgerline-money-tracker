// :envelope-ledger — M12: the never-negative double-entry envelope ledger.
//
// The correctness floor the product rests on. Implements LedgerService —
// allocate, postSpend, rollover — each one a balanced double-entry transfer
// whose entries sum to zero, with a per-envelope SELECT ... FOR UPDATE lock
// guarding the never-negative invariant under concurrency.
//
// This is a LIBRARY module (not bootable). It depends on :platform-db for
// TenantContext (the RLS+transaction primitive) and uses JdbcTemplate
// explicitly — the locking IS the design, so we own every SQL statement.
//
// See:
//   * context/deep-dives/money-tracker/03-the-ledger-explained.md
//   * context/deep-dives/money-tracker/04-data-model.md
//   * context/decisions/ADR-0005-envelope-rollover.md
//   * context/learning/spring-boot/05-data-and-transactions.md (proxy footgun)

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

    // JdbcTemplate + @Transactional + @Component. starter-jdbc gives us the
    // explicit-SQL path (no JPA on the ledger).
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
