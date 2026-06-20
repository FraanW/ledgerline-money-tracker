-- Canonicalizer (M3) durable index — Postgres + pgvector.
-- Multi-vector: one row per merchant SURFACE FORM (canonical/alias/token), all
-- carrying the merchant's canonical + category. A query takes the best form per
-- merchant. dim = 384 (all-MiniLM-L6-v2).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS merchant_index (
    id         bigserial PRIMARY KEY,
    canonical  text        NOT NULL,
    category   text        NOT NULL,
    form       text        NOT NULL,
    embedding  vector(384) NOT NULL
);

-- Approximate NN on cosine distance. Rebuilt by POST /admin/reindex.
CREATE INDEX IF NOT EXISTS merchant_index_embedding_idx
    ON merchant_index USING hnsw (embedding vector_cosine_ops);
