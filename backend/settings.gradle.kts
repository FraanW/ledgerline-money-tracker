// =============================================================================
// Ledgerline JVM backend — Gradle multi-module root.
// =============================================================================
// This `backend/` tree is the Java/Spring Boot home for Ledgerline's backend
// modules. It lives OUTSIDE the pnpm workspace globs (apps/*, services/*,
// packages/*) on purpose: pnpm never sees it, Gradle never sees the pnpm tree,
// so the two toolchains coexist without stepping on each other.
//
// Modules:
//   :contracts        — pure-Java domain + event contracts (mirror of packages/types)
//   :platform-db      — DataSource + transaction-scoped RLS context + Flyway migrations
//   :identity         — V7+: users + memberships + the data-driven RBAC gate
//   :api              — the v0 HTTP read/app surface for the Money Tracker app
//   :envelope-ledger  — M12: the never-negative double-entry envelope ledger
//   :ingestion        — M1: statement-upload ingestion (parse → normalise → dedup)
//   :categorizer      — M11: rules-based categoriser + M1→M11→M12 bridge publisher
//   :app              — Spring Boot bootstrap, Flyway runner, Actuator health
// =============================================================================

rootProject.name = "ledgerline-backend"

include(":contracts")
include(":platform-db")
include(":identity")
include(":api")
include(":envelope-ledger")
include(":ingestion")
include(":categorizer")
include(":app")
