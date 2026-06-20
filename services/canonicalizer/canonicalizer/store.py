"""Vector store behind one interface.

Each merchant is indexed by MULTIPLE surface forms (canonical + aliases +
tokens) — one vector each, all pointing back to the merchant. A query aggregates
per-merchant by taking the best-matching surface form (max similarity). This
multi-vector design dramatically improves recall on noisy inputs versus a single
averaged profile vector.

- InMemoryVectorStore: numpy matrix; the default + test path.
- PgVectorStore: Postgres + pgvector (cosine via `<=>`); lazy psycopg import. The
  online production path once the dictionary lives in the DB.
"""
from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

import numpy as np

from .embeddings import Embedder
from .types import Candidate, MerchantRecord

log = logging.getLogger(__name__)


@runtime_checkable
class VectorStore(Protocol):
    def index(self, records: list[MerchantRecord], embedder: Embedder) -> None: ...

    def search(self, vector: np.ndarray, k: int) -> list[Candidate]: ...


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._matrix: np.ndarray | None = None  # (n_forms, dim), L2-normalized
        self._form_merchant: list[int] = []     # form row -> merchant index
        self._records: list[MerchantRecord] = []

    def index(self, records: list[MerchantRecord], embedder: Embedder) -> None:
        self._records = list(records)
        forms: list[str] = []
        self._form_merchant = []
        for mi, rec in enumerate(self._records):
            for form in rec.surface_forms():
                forms.append(form)
                self._form_merchant.append(mi)
        if not forms:
            self._matrix = None
            return
        self._matrix = embedder.embed(forms)

    def search(self, vector: np.ndarray, k: int) -> list[Candidate]:
        if self._matrix is None or not self._records:
            return []
        q = np.asarray(vector, dtype=np.float32).reshape(-1)
        sims = self._matrix @ q  # cosine (both sides L2-normalized)
        best: dict[int, float] = {}
        for form_row, sim in enumerate(sims):
            mi = self._form_merchant[form_row]
            s = float(sim)
            if s > best.get(mi, -1.0):
                best[mi] = s
        ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)[:k]
        out: list[Candidate] = []
        for mi, score in ranked:
            rec = self._records[mi]
            # clamp tiny float overshoot from accumulation
            out.append(Candidate(rec.canonical, rec.category, max(0.0, min(1.0, score))))
        return out


class PgVectorStore:  # pragma: no cover - exercised only against a live DB
    """pgvector-backed store. Schema in schema.sql. Cosine via the `<=>` operator
    (distance), converted back to a 0..1 similarity. Index is rebuilt by
    /admin/reindex. Kept lazy so the service runs without psycopg installed."""

    def __init__(self, dsn: str, table: str = "merchant_index") -> None:
        self._dsn = dsn
        self._table = table

    def _conn(self):
        import psycopg  # lazy

        return psycopg.connect(self._dsn)

    def index(self, records: list[MerchantRecord], embedder: Embedder) -> None:
        forms, owners = [], []
        for rec in records:
            for form in rec.surface_forms():
                forms.append(form)
                owners.append(rec)
        if not forms:
            return
        vecs = embedder.embed(forms)
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(f"TRUNCATE {self._table}")
            for rec, form, vec in zip(owners, forms, vecs):
                cur.execute(
                    f"INSERT INTO {self._table} (canonical, category, form, embedding) "
                    f"VALUES (%s, %s, %s, %s)",
                    (rec.canonical, rec.category, form, list(map(float, vec))),
                )
            conn.commit()

    def search(self, vector: np.ndarray, k: int) -> list[Candidate]:
        q = list(map(float, np.asarray(vector).reshape(-1)))
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT canonical, category, 1 - (embedding <=> %s::vector) AS sim "
                f"FROM {self._table} ORDER BY embedding <=> %s::vector LIMIT %s",
                (q, q, k * 4),
            )
            rows = cur.fetchall()
        best: dict[str, tuple[str, float]] = {}
        for canonical, category, sim in rows:
            s = float(sim)
            if canonical not in best or s > best[canonical][1]:
                best[canonical] = (category, s)
        ranked = sorted(best.items(), key=lambda kv: kv[1][1], reverse=True)[:k]
        return [Candidate(c, cat, max(0.0, min(1.0, s))) for c, (cat, s) in ranked]
