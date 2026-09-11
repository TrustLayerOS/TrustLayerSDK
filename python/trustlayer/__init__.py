"""
TrustLayer Python SDK

Trust infrastructure for the AI-native internet.

Usage:
    from trustlayer import TrustLayer

    client = TrustLayer(api_key="tl_secret_xxx")

    session = client.create_session(type="transaction", user_id="user_123")
    session.track_event("device_change", {"is_new": True})

    result = client.evaluate(session.session_id)
    print(result.trust_score)    # 88.0
    print(result.recommendation) # "allow"
"""

from .client import TrustLayer
from .session import TrustSession
from .models import (
    TrustScoreResponse,
    RiskScoreResponse,
    EvaluationResponse,
    CreateSessionResponse,
    SendEventResponse,
)
from .exceptions import TrustLayerError, TrustLayerAuthError, TrustLayerRateLimitError
from .webhooks import verify_webhook_signature
from .modules import (
    FraudShield,
    InterviewShield,
    IntegrityResult,
    BotShield,
    BotResult,
    AnomalyShield,
    AnomalyResult,
    DeepfakeShield,
    DeepfakeVideoResult,
    DeepfakeAudioResult,
)

__all__ = [
    "TrustLayer",
    "TrustSession",
    "TrustScoreResponse",
    "RiskScoreResponse",
    "EvaluationResponse",
    "CreateSessionResponse",
    "SendEventResponse",
    "TrustLayerError",
    "TrustLayerAuthError",
    "TrustLayerRateLimitError",
    "verify_webhook_signature",
    "FraudShield",
    "InterviewShield",
    "IntegrityResult",
    "BotShield",
    "BotResult",
    "AnomalyShield",
    "AnomalyResult",
    "DeepfakeShield",
    "DeepfakeVideoResult",
    "DeepfakeAudioResult",
]

__version__ = "0.1.0"
