"""Pydantic request/response models for the bridge API.

The SSE *payloads* are plain dicts (built in ``runner.py``) so they serialize
straight to JSON on the wire; only the HTTP request/response bodies are typed
here.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AssetType = Literal["stock", "crypto"]


class RunRequest(BaseModel):
    ticker: str = Field(..., min_length=1, description="e.g. 'NVDA' or 'BTC-USD'")
    trade_date: str = Field(..., description="Trade date, 'YYYY-MM-DD'")
    asset_type: AssetType = Field("stock", description="'stock' or 'crypto' pipeline")
    # Optional per-run overrides. When None, the backend falls back to the
    # .env / DEFAULT_CONFIG value so the request stays backward-compatible.
    provider: str | None = Field(None, description="LLM provider id, e.g. 'deepseek'")
    deep_think_llm: str | None = Field(None, description="Deep/thinking model id")
    quick_think_llm: str | None = Field(None, description="Quick/fast model id")
    output_language: str | None = Field(None, description="Report language, e.g. 'Chinese'")


class RunResponse(BaseModel):
    run_id: str
    events_url: str
