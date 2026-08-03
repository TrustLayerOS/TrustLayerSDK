"""
Pydantic models for all TrustLayer API request and response objects.
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


# ─── Session ──────────────────────────────────────────────────────────────────

SessionType = Literal[
    "user_verification",
    "interview",
    "transaction",
    "authentication",
    "agent",
]

TrustModule = Literal[
    "fraud",
    "bot_detection",
    "interview",
    "deepfake",
    "anomaly",
]


class CreateSessionRequest(BaseModel):
    type: SessionType
    user_id: Optional[str] = None
    modules: Optional[list[str]] = None
    risk_threshold: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class CreateSessionResponse(BaseModel):
    id: str
    organization_id: str
    user_id: Optional[str] = None
    type: str
    status: str
    modules: list[str] = Field(default_factory=list)
    risk_threshold: int = 70
    expires_at: str
    created_at: str


# ─── Events ───────────────────────────────────────────────────────────────────

class SendEventRequest(BaseModel):
    session_id: str
    type: str
    timestamp: Optional[str] = None
    data: Optional[dict[str, Any]] = None


class SendEventResponse(BaseModel):
    event_id: str
    accepted: bool


class SendEventBatchResponse(BaseModel):
    accepted_count: int
    event_ids: list[str]


# ─── Trust & Risk ─────────────────────────────────────────────────────────────

class TrustComponents(BaseModel):
    identity_score: float = 0
    device_score: float = 0
    behavior_score: float = 0
    network_score: float = 0
    reputation_score: float = 0
    risk_penalty: float = 0


class TrustScoreResponse(BaseModel):
    trust_score: float
    confidence: float
    status: Literal["very_trusted", "trusted", "suspicious", "high_risk"]
    reasons: list[str] = Field(default_factory=list)
    components: Optional[TrustComponents] = None


class RiskDimensions(BaseModel):
    identity_risk: float = 0
    device_risk: float = 0
    behavior_risk: float = 0
    network_risk: float = 0
    reputation_risk: float = 0
    content_risk: float = 0


class RiskScoreResponse(BaseModel):
    risk_score: float
    level: Literal["low", "moderate", "high", "critical"]
    factors: list[str] = Field(default_factory=list)
    confidence: float
    primary_factors: list[str] = Field(default_factory=list)
    dimensions: Optional[RiskDimensions] = None


class EvaluationResponse(BaseModel):
    session_id: str
    trust_score: TrustScoreResponse
    risk_score: RiskScoreResponse
    recommendation: Literal["allow", "monitor", "verify", "review", "block"]
    explanation: list[str] = Field(default_factory=list)
    policy_actions: Optional[list[str]] = None


# ─── Auth ─────────────────────────────────────────────────────────────────────

class GenerateKeysResponse(BaseModel):
    public_key: str
    secret_key: str
    project_id: str
    name: str
    warning: str
    created_at: str


class IssueTokenResponse(BaseModel):
    token: str
    token_type: str
    expires_in: int
    user_id: str
    org_id: str


# ─── Webhooks ─────────────────────────────────────────────────────────────────

class WebhookEndpoint(BaseModel):
    id: str
    organization_id: str
    url: str
    events: list[str] = Field(default_factory=list)
    active: bool
    created_at: str
