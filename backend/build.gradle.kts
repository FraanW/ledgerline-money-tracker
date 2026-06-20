// =============================================================================
// Root build script — shared config applied to every subproject.
// =============================================================================
// Plugin versions are declared here with `apply false` so subprojects can opt
// in without re-declaring versions. Java toolchain is pinned to 21 (the brief
// default); Gradle's toolchain support will download/locate a JDK 21 even if
// the launching JVM is 17, so the build is reproducible across machines.

plugins {
    java
    id("org.springframework.boot") version "3.4.1" apply false
    id("io.spring.dependency-management") version "1.1.7" apply false
}

allprojects {
    group = "com.ledgerline"
    version = "0.0.1"

    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "java")

    extensions.configure<JavaPluginExtension> {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()

        // Integration-test datasource selection (see TestPostgres / dual-mode tests):
        //   * If -Pledgerline.test.jdbc-url=... is passed to Gradle (or env
        //     TEST_DATABASE_URL is set), forward it so the tests run against an
        //     external (alt-port) Postgres instead of spinning up Testcontainers.
        //   * Otherwise the tests fall back to Testcontainers automatically.
        (project.findProperty("ledgerline.test.jdbc-url") as String?)?.let {
            systemProperty("ledgerline.test.jdbc-url", it)
        }
        System.getenv("TEST_DATABASE_URL")?.let {
            systemProperty("ledgerline.test.jdbc-url", it)
        }
    }

    tasks.withType<JavaCompile>().configureEach {
        options.encoding = "UTF-8"
        // -parameters keeps constructor parameter names for Spring/Jackson
        // binding and clearer reflection on our records.
        options.compilerArgs.add("-parameters")
    }
}
