"""Embedding backends behind one interface.

- HashingEmbedder: dependency-light, deterministic char-trigram + token hashing.
  Captures lexical overlap (so noisy variants of the same brand land near each
  other) with NO model download. It is the default, the CI/test embedder, and a
  graceful fallback when sentence-transformers isn't installed.
- MiniLMEmbedder: real semantic embeddings via sentence-transformers
  (all-MiniLM-L6-v2, 384-d). Lazy-loaded; enabled with CANON_USE_REAL_MODEL=true.

Both return L2-normalized float32 rows, so cosine similarity == dot product.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Protocol, Sequence, runtime_checkable

import numpy as np

log = logging.getLogger(__name__)


@runtime_checkable
class Embedder(Protocol):
    dim: int

    def embed(self, texts: Sequence[str]) -> np.ndarray: ...


def _l2_normalize(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (m / norms).astype(np.float32)


def _stable_hash(s: str) -> int:
    # blake2b, not Python's salted hash() — must be deterministic across processes.
    return int.from_bytes(hashlib.blake2b(s.encode("utf-8"), digest_size=8).digest(), "big")


class HashingEmbedder:
    def __init__(self, dim: int = 384, ngram: int = 3) -> None:
        self.dim = dim
        self.ngram = ngram

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            low = (t or "").lower().strip()
            padded = f"  {low}  "
            n = self.ngram
            for j in range(len(padded) - n + 1):
                out[i, _stable_hash(padded[j : j + n]) % self.dim] += 1.0
            # whole-token signal weighted higher — exact brand tokens dominate.
            for tok in low.split():
                out[i, _stable_hash("§" + tok) % self.dim] += 3.0
        return _l2_normalize(out)


class MiniLMEmbedder:
    def __init__(self, model_name: str, dim: int) -> None:
        self.dim = dim
        self._name = model_name
        self._model = None  # lazy

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer  # heavy, lazy

            log.info("loading embedding model %s", self._name)
            self._model = SentenceTransformer(self._name)
        return self._model

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        model = self._load()
        vecs = model.encode(list(texts), normalize_embeddings=True, convert_to_numpy=True)
        return np.asarray(vecs, dtype=np.float32)


def get_embedder(settings) -> Embedder:
    """Factory: the real model when explicitly enabled AND importable, else the
    deterministic hashing embedder. Never raises — falls back instead."""
    if settings.use_real_model:
        try:
            import sentence_transformers  # noqa: F401  (probe availability)

            return MiniLMEmbedder(settings.embedding_model, settings.embedding_dim)
        except Exception as exc:  # pragma: no cover - env-dependent
            log.warning("sentence-transformers unavailable (%s); using HashingEmbedder", exc)
    return HashingEmbedder(settings.embedding_dim)
