package com.ledgerline.platform.db;

import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Resolves the Postgres the integration tests run against, in one of two modes:
 *
 * <ol>
 *   <li><b>External (alt-port) mode</b> — if {@code -Dledgerline.test.jdbc-url}
 *       (or env {@code TEST_DATABASE_URL}) is set, the tests connect to that
 *       already-running Postgres. This is the path used on this machine: a
 *       docker-compose / standalone Postgres on alt port 5433 (host 5432 may be
 *       squatted by a native PG17, and the Testcontainers Docker-API client did
 *       not negotiate cleanly with the local Docker Desktop 29.x daemon).</li>
 *   <li><b>Testcontainers mode</b> — otherwise, spin up an ephemeral
 *       pgvector/pgvector:pg16 container (matches docker-compose). This is the
 *       default for CI / any machine with a Testcontainers-compatible daemon.</li>
 * </ol>
 *
 * Either way the migrations, role model, and RLS proof run against a real
 * Postgres 16 with pgvector — identical behaviour to local dev.
 */
final class TestPostgres {

    static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    static final String DB = "ledgerline";
    static final String OWNER_USER = "ledgerline";
    static final String OWNER_PASSWORD = "ledgerline";
    /** The non-superuser app role migration V1 creates. */
    static final String APP_USER = "ledgerline_app";
    static final String APP_PASSWORD = "ledgerline_app";

    private TestPostgres() {}

    /** The externally-supplied JDBC URL, or {@code null} to use Testcontainers. */
    static String externalJdbcUrl() {
        String prop = System.getProperty("ledgerline.test.jdbc-url");
        if (prop != null && !prop.isBlank()) {
            return prop;
        }
        String env = System.getenv("TEST_DATABASE_URL");
        return (env != null && !env.isBlank()) ? env : null;
    }

    static boolean usingExternal() {
        return externalJdbcUrl() != null;
    }

    /** A fresh, un-started container configured to match docker-compose. */
    static PostgreSQLContainer<?> newContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse(DOCKER_IMAGE))
            .withDatabaseName(DB)
            .withUsername(OWNER_USER)
            .withPassword(OWNER_PASSWORD);
    }
}
