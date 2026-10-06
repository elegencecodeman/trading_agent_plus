"""Pydantic request/response models for the bridge API.

The SSE *payloads* are plain dicts (built in ``runner.py``) so they serialize
straight to JSON on the wire; only the HTTP request/response bodies are typed
here.
"""

from __future__ import annotations

from typing import Any, Literal

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


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, description="Login handle")
    password: str = Field(..., min_length=8, max_length=128, description="Min. 8 characters")
    display_name: str | None = Field(None, max_length=120, description="Optional shown name")


class LoginRequest(BaseModel):
    """JSON login — avoids the form-encoded ``/token`` flow (and its
    ``python-multipart`` dependency) since the SPA talks JSON everywhere."""

    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(..., description="Token lifetime in seconds")
    user: UserOut


# --------------------------------------------------------------------------- #
# Persisted analyses
# --------------------------------------------------------------------------- #
class AnalysisSummary(BaseModel):
    """Row shape for the history list — deliberately without the heavy prose
    and dashboard JSON, so listing 50 runs stays cheap."""

    id: int
    run_id: str
    ticker: str
    trade_date: str
    asset_type: str
    rating: str
    side: str
    confidence: float | None = None
    status: str
    range: str | None = None
    created_at: str


class AnalysisDetail(AnalysisSummary):
    """One stored run, including the note and its dashboard snapshot."""

    strategy: str
    note: str
    provider: str | None = None
    deep_think_llm: str | None = None
    quick_think_llm: str | None = None
    output_language: str | None = None
    dashboard: dict[str, Any] | None = None


class AnalysisListResponse(BaseModel):
    total: int
    items: list[AnalysisSummary]
