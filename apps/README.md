# `apps/` — Product Surfaces

Thin Next.js (App Router) shells, one per product surface. Each app consumes the platform via the shared `packages/db-client`, `packages/kafka-client`, and `packages/redis-client`. None of them own business logic; that lives in `services/`.

- `subscription-killer/` — Surface 1 — Fraan
- `invoice-hub/` — Surface 2 — SDE-3
- `money-tracker/` — Surface 3 — Fraan

See [`../docs/MODULE-MAP.md`](../docs/MODULE-MAP.md) for the module-to-folder map.
