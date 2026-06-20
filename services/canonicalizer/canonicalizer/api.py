"""FastAPI surface for the canonicalizer. The Java backend (ingestion/categorizer)
calls these over HTTP; the pipeline is otherwise framework-free."""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .config import get_settings
from .recurring import RecurringDetector, Txn
from .service import build_canonicalizer, build_categorizer, make_resolver


class CanonRequest(BaseModel):
    raw: str = Field(..., description="Raw bank/UPI/card transaction description")
    merchant_hint: str | None = Field(default=None, description="Bank-parsed merchant, if any")


class BatchRequest(BaseModel):
    items: list[CanonRequest]


class CategorizeRequest(BaseModel):
    raw: str
    merchant_hint: str | None = None
    amount: float | None = None


class TxnIn(BaseModel):
    id: str
    date: str
    amount: float
    raw: str | None = None
    merchant_hint: str | None = None
    method: str | None = None
    merchant: str | None = None
    category: str | None = None


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Ledgerline Enrichment — M3 canonicalize + M11 categorize + recurring", version="0.3.0")
    app.state.categorizer = build_categorizer(settings)
    app.state.canon = app.state.categorizer._canon  # reuse the same pipeline instance
    app.state.recurring = RecurringDetector(make_resolver(app.state.canon))

    @app.get("/healthz")
    def healthz() -> dict:
        return {
            "status": "ok",
            "embedder": "minilm" if settings.use_real_model else "hashing",
            "llm_enabled": settings.llm_enabled,
            "accept_threshold": settings.accept_threshold,
        }

    @app.post("/canonicalize")
    def canonicalize(req: CanonRequest) -> dict:
        return app.state.canon.canonicalize(req.raw, req.merchant_hint).to_dict()

    @app.post("/canonicalize/batch")
    def canonicalize_batch(req: BatchRequest) -> dict:
        return {
            "results": [app.state.canon.canonicalize(i.raw, i.merchant_hint).to_dict() for i in req.items]
        }

    @app.post("/categorize")
    def categorize(req: CategorizeRequest) -> dict:
        return app.state.categorizer.categorize(req.raw, req.merchant_hint, req.amount).to_dict()

    @app.post("/categorize/batch")
    def categorize_batch(reqs: list[CategorizeRequest]) -> dict:
        return {
            "results": [
                app.state.categorizer.categorize(r.raw, r.merchant_hint, r.amount).to_dict() for r in reqs
            ]
        }

    @app.post("/recurring")
    def recurring(txns: list[TxnIn]) -> dict:
        items = [
            Txn(id=t.id, date=t.date, amount=t.amount, raw=t.raw or "",
                merchant_hint=t.merchant_hint, method=t.method, merchant=t.merchant, category=t.category)
            for t in txns
        ]
        return app.state.recurring.detect(items).to_dict()

    @app.post("/admin/reindex")
    def reindex() -> dict:
        app.state.categorizer = build_categorizer(settings)
        app.state.canon = app.state.categorizer._canon
        app.state.recurring = RecurringDetector(make_resolver(app.state.canon))
        return {"status": "reindexed", "merchants": len(app.state.canon._records)}

    return app


app = create_app()
