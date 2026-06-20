# @ledgerline/money-tracker

Money Tracker — the built surface of the [Ledgerline](../../README.md) platform. A multi-tenant personal-finance app on a never-negative double-entry ledger. Next.js 14 (App Router) + TypeScript + Tailwind, talking to the Java/Spring backend.

## What's here

- **Real authentication.** Supabase sign-in via `supabase-js`; the browser holds a JWT that the backend verifies against the project's public JWKS (ES256). A keyless dev-login fallback kicks in when `NEXT_PUBLIC_SUPABASE_*` is unset, so the app runs locally without a Supabase project.
- **Statement ingestion.** Upload a bank statement — **CSV or a password-protected PDF** (the password unlocks the PDF in-memory on the backend; it is never logged or stored). Each upload flows through the **M1 → M3 → M11 → M12** pipeline: dedup → merchant canonicalization → rules categorization → never-negative envelope posting.
- **Budget on a double-entry ledger.** The envelopes view: add income (lands in Unallocated), allocate across envelopes, watch per-envelope balances. Draining a user envelope below zero is refused — a real correctness floor, not a UI warning.
- **The surfaces.** Marketing landing · login · dashboard · budget (envelopes / income / allocate) · transactions (search + upload) · settings · household members (the RBAC UI) · investments · net worth · tag workshop · a 26-lens **"Tracking Philosophies"** gallery.
- **Three persona themes.** Gen Z / Millennial / Senior — the active theme restyles every screen via design tokens and persists per user (stored in user settings on the backend).

## Run it

The app expects the backend on `:8090` and (optionally) Supabase configured. Secrets live in a gitignored `apps/money-tracker/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_LEDGERLINE_API`.

```bash
npx next dev -p 3000        # http://localhost:3000
# real sign-in (with the demo seed): anaya@demo.ledgerline / LedgerDemo!2026 -> "Sharma Household"
```

Full stack startup (Postgres + sidecar + backend + app) and the demo seed are in the [API & Services Reference → §7 Runbook](../../docs/api-and-services.md). Every endpoint this app calls — shapes, RBAC gates, and the uniform error contract — is documented there too.

## Notes

- All money is integer paise (`amountMinor` / `Money{minor,currency}`); the UI never does floating-point math on balances.
- The frontend is intentionally thin. The correctness floor (tenancy, never-negative ledger, RBAC) lives in the backend, where RLS enforces it.
