// :app — the bootable Spring Boot application.
//
// Thin entrypoint: wires :platform-db (DataSource + Flyway + RLS context),
// applies migrations on boot, and exposes an Actuator health endpoint
// (foundation for M16 observability). Business logic lands in later modules.

plugins {
    java
    id("org.springframework.boot")
    id("io.spring.dependency-management")
}

dependencies {
    implementation(project(":platform-db"))
    // :identity registers IdentityService/RbacService/IdentityController +
    // the global 403 advice via component scan.
    implementation(project(":identity"))
    // :api registers the Money Tracker read/app endpoints + CORS config.
    implementation(project(":api"))
    implementation(project(":ingestion"))
    // :categorizer pulls :envelope-ledger transitively. Its presence on the
    // classpath registers the CategorizeAndPostPublisher bean (annotated
    // @Primary), so the v0 NoOpIngestionEventPublisher's
    // @ConditionalOnMissingBean steps aside automatically.
    implementation(project(":categorizer"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation(platform("org.testcontainers:testcontainers-bom:1.20.4"))
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
