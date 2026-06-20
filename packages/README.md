# `packages/` — Shared Code

Internal packages imported by apps and services via `workspace:*`.

| Package | Purpose |
|---|---|
| `eslint-config/` | Shared ESLint flat-config. |
| `tsconfig/` | Shared `tsconfig.*.json` presets — `base`, `service`, `nextjs`. |
| `types/` | Shared TypeScript types — event schemas (Kafka payloads), domain entities, error envelopes. |
| `db-client/` | Postgres client wrapper. Sets tenant context on every connection so RLS policies fire correctly. |
| `kafka-client/` | Redpanda producer/consumer wrappers with idempotency keys, outbox helpers, consumer-group conventions. |
| `redis-client/` | Redis primitives — `cache.get/set`, `rateLimit(key, capacity, refill)`, `lock.acquire(key, ttl)`, `idempotency.checkAndSet(key, ttl)`. |

Rule of thumb: code goes into `packages/` only when at least two services import it. Otherwise it lives in the consuming service.
