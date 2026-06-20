"""Typed configuration (env-driven, 12-factor). Every knob has a safe default so
the service runs out-of-the-box with the dependency-light hashing embedder and
the LLM disabled — you opt into the heavy model / LLM explicitly."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CANON_", env_file=".env", extra="ignore")

    # ── Embeddings ────────────────────────────────────────────────────────────
    # Default OFF: the deterministic floor + hashing embedder make the service
    # fully runnable and testable with no torch / no model download. Flip
    # CANON_USE_REAL_MODEL=true in an env where sentence-transformers is installed.
    use_real_model: bool = False
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384

    # ── Confidence gate (cosine similarity, 0..1) ──────────────────────────────
    # >= accept_threshold  -> auto-accept (embedding)
    # [llm_floor, accept)  -> ambiguous: ask the LLM if enabled, else ABSTAIN
    # < llm_floor          -> ABSTAIN (unknown)
    accept_threshold: float = Field(default=0.62, ge=0.0, le=1.0)
    llm_floor: float = Field(default=0.40, ge=0.0, le=1.0)
    top_k: int = Field(default=5, ge=1, le=25)

    # ── LLM fallback (OpenRouter, OpenAI-compatible) ───────────────────────────
    llm_enabled: bool = False
    openrouter_api_key: str | None = None
    openrouter_model: str = "google/gemini-2.0-flash-001"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_timeout_s: float = 12.0
    # Hard spend gate — the LLM stops being called once cumulative spend hits the
    # cap (matches the project's $3 OpenRouter ceiling).
    llm_spend_cap_usd: float = Field(default=3.0, ge=0.0)
    llm_cost_per_call_usd: float = Field(default=0.0008, ge=0.0)

    # ── Storage ────────────────────────────────────────────────────────────────
    database_url: str | None = None  # postgres+pgvector; None -> in-memory store

    # ── Data ───────────────────────────────────────────────────────────────────
    dictionary_path: str = "data/merchants.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
