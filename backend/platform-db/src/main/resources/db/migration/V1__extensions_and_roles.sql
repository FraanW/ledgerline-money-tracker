-- =============================================================================
-- M5 — Migration 0001: Extensions and the application role model
-- =============================================================================
-- Ledgerline's multi-tenant correctness floor. This migration sets up the two
-- things every later migration depends on:
--   1. The Postgres extensions we need (pgcrypto for gen_random_uuid()).
--   2. The role model that makes Row-Level Security actually enforce.
--
-- ROLE MODEL — why this matters for RLS
-- -----------------------------------------------------------------------------
-- Postgres RLS is bypassed by:
--   * superusers, and
--   * the table OWNER — UNLESS the table has FORCE ROW LEVEL SECURITY.
-- Migrations run as the owner/admin (the `ledgerline` bootstrap role from
-- docker-compose). The *application* must NOT connect as that role, or RLS
-- could be silently bypassed.
--
-- So we create a dedicated, non-superuser application role `ledgerline_app`:
--   * It is the role the db-client connects as at runtime.
--   * It does NOT own the tables (the migration role does), so even without
--     FORCE it would still be subject to RLS — and we add FORCE anyway as a
--     belt-and-braces guarantee in migration 0003.
--   * It is granted only DML (SELECT/INSERT/UPDATE/DELETE) on the tenant tables,
--     never DDL.
--
-- The per-connection tenant context is carried in a custom GUC,
-- `app.current_tenant`, set via `SET LOCAL app.current_tenant = '<uuid>'`
-- inside a transaction by the db-client's withTenant() helper. RLS policies
-- (migration 0003) filter every row by that GUC.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto on PG13–16. (PG18 promotes it to core,
-- but pgcrypto remains the portable choice for our pg16 image.)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The runtime application role. NOLOGIN here is deliberate: in local dev the
-- db-client connects as the bootstrap `ledgerline` superuser by default, but
-- the *intended* production posture is to hand the app this non-superuser role.
-- We grant it a password-less login below so a local deploy CAN use it; flip
-- the connection string to this role to exercise true RLS isolation.
--
-- Guarded in a DO block so the migration is idempotent (CREATE ROLE has no
-- IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_app') THEN
    CREATE ROLE ledgerline_app LOGIN PASSWORD 'ledgerline_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Let the app role connect to and use the database + schema. Table-level grants
-- are issued in migration 0002 once the tables exist.
GRANT USAGE ON SCHEMA public TO ledgerline_app;
