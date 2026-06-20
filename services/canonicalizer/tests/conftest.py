import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # service root on path

import pytest

from canonicalizer.config import Settings
from canonicalizer.embeddings import HashingEmbedder
from canonicalizer.llm import NullLLM
from canonicalizer.pipeline import Canonicalizer
from canonicalizer.store import InMemoryVectorStore
from canonicalizer.types import MerchantRecord


@pytest.fixture
def records() -> list[MerchantRecord]:
    return [
        MerchantRecord("Swiggy", "Food Delivery", ("swiggy", "bundl technologies"), ("SWIGGY", "BUNDL TECHNOLOGIES")),
        MerchantRecord("Zomato", "Food Delivery", ("zomato", "eternal"), ("ZOMATO", "ETERNAL")),
        MerchantRecord("Netflix", "OTT/Subscriptions", ("netflix",), ("NETFLIX", "NETFLIX.COM")),
        MerchantRecord("DMart", "Groceries", ("dmart", "avenue supermarts"), ("DMART", "AVENUE SUPERMARTS")),
        MerchantRecord("Zerodha Coin", "Investments/Broking", ("coin", "zerodha coin"), ("ZERODHA COIN", "COIN MF")),
        MerchantRecord("Big Bazaar", "Groceries", ("big bazaar", "bigbazaar"), ("BIGBAZAAR", "BIG BAZAAR")),
    ]


@pytest.fixture
def settings() -> Settings:
    return Settings(use_real_model=False, llm_enabled=False, accept_threshold=0.62, llm_floor=0.40, top_k=5)


@pytest.fixture
def canon(records, settings) -> Canonicalizer:
    return Canonicalizer(records, HashingEmbedder(settings.embedding_dim), InMemoryVectorStore(), settings, NullLLM())
