"""
TrustLayer — main Python SDK client.
"""

from __future__ import annotations

from typing import Any, Optional

from .exceptions import TrustLayerError
from .http import HttpClient, DEFAULT_API_URL, DEFAULT_TIMEOUT
from .models import (
    CreateSessionRequest,
    CreateSessionResponse,
    EvaluationResponse,
    GenerateKeysResponse,
    IssueTokenResponse,
    RiskScoreResponse,
    TrustScoreResponse,
    WebhookEndpoint,
)
from .session import TrustSession
from .modules.fraud import FraudShield
from .modules.interview import InterviewShield
from .modules.bot import BotShield
from .modules.anomaly import AnomalyShield
from .modules.deepfake import DeepfakeShield


class TrustLayer:
    """
    TrustLayer Python SDK client.

    Provides access to all TrustLayer capabilities:
    session management, trust scoring, risk scoring, and shield modules.

    Usage::

        from trustlayer import TrustLayer

        client = TrustLayer(api_key="tl_secret_xxx")

        # Create a session and evaluate
        session = client.create_session(type="transaction", user_id="u_123")
        session.track_event("device_change", {"is_new": True})
        result = session.evaluate()
        print(result.recommendation)  # "allow"

        result = client.verify_human(
            type="interview",
            consent=True,
            liveness_passed=True,
            image_b64=jpeg_b64,
        )

    Use as a context manager to ensure the HTTP client is closed::

        with TrustLayer(api_key="tl_secret_xxx") as client:
            session = client.create_session(type="authentication")
            ...
    """

    def __init__(
        self,
        api_key: str,
        *,
        api_url: str = DEFAULT_API_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        """
        :param api_key: Your TrustLayer API key.
            Use ``tl_public_xxx`` for client-context calls,
            ``tl_secret_xxx`` for server-side operations.
        :param api_url: Override the TrustLayerOS endpoint
            (useful for self-hosted or staging environments).
        :param timeout: HTTP request timeout in seconds (default 10).
        """
        self._http = HttpClient(api_key=api_key, api_url=api_url, timeout=timeout)

    # ── Session lifecycle ─────────────────────────────────────────────────────

    def create_session(
        self,
        type: str,  # noqa: A002
        *,
        user_id: Optional[str] = None,
        modules: Optional[list[str]] = None,
        risk_threshold: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> TrustSession:
        """
        Create a new trust evaluation session.

        :param type: Session type — one of ``user_verification``, ``interview``,
            ``transaction``, ``authentication``, ``agent``.
        :param user_id: The ID of the user being evaluated (optional).
        :param modules: Override which shield modules run for this session.
        :param risk_threshold: Custom risk threshold (0–100). Default 70.
        :param metadata: Arbitrary key-value context stored with the session.

        Example::

            session = client.create_session(
                type="interview",
                user_id="candidate_abc",
                modules=["interview", "deepfake"],
                metadata={"position": "Staff Engineer"},
            )
        """
        req = CreateSessionRequest(
            type=type,  # type: ignore[arg-type]
            user_id=user_id,
            modules=modules,
            risk_threshold=risk_threshold,
            metadata=metadata,
        )
        data = self._http.post(
            "/v1/sessions",
            body=req.model_dump(exclude_none=True),
            response_model=CreateSessionResponse,
        )
        return TrustSession(data, self._http)

    def get_session(self, session_id: str) -> TrustSession:
        """Resume an existing session by ID."""
        data = self._http.get(
            f"/v1/sessions/{session_id}",
            response_model=CreateSessionResponse,
        )
        return TrustSession(data, self._http)

    def verify_human(
        self,
        type: str = "interview",  # noqa: A002
        *,
        user_id: Optional[str] = None,
        consent: bool = False,
        liveness_passed: Optional[bool] = None,
        video_features: Optional[list[float]] = None,
        audio_features: Optional[list[float]] = None,
        image_b64: Optional[str] = None,
        audio_b64: Optional[str] = None,
        audio_pcm: Optional[list[float]] = None,
        sample_rate: int = 16000,
        challenge: str = "external",
        motion: Optional[dict[str, Any]] = None,
        modules: Optional[list[str]] = None,
    ) -> EvaluationResponse:
        """
        One-shot: create a session, send optional biometric events, evaluate.

        Same contract as JS ``TrustLayer.verifyHuman()``. Python cannot open a
        webcam — pass captured JPEG / PCM / features.
        """
        session = self.create_session(
            type=type,
            user_id=user_id,
            modules=modules or ["interview", "deepfake", "bot"],
        )
        return session.verify_human(
            consent=consent,
            liveness_passed=liveness_passed,
            video_features=video_features,
            audio_features=audio_features,
            image_b64=image_b64,
            audio_b64=audio_b64,
            audio_pcm=audio_pcm,
            sample_rate=sample_rate,
            challenge=challenge,
            motion=motion,
            modules=modules,
        )

    def check(
        self,
        *,
        threats: Optional[list[str]] = None,
        preset: Optional[str] = None,
        type: Optional[str] = None,  # noqa: A002
        user_id: Optional[str] = None,
        consent: bool = False,
        text: Optional[str] = None,
        agent_id: Optional[str] = None,
        owner_org: Optional[str] = None,
        image_b64: Optional[str] = None,
        audio_b64: Optional[str] = None,
        audio_pcm: Optional[list[float]] = None,
        modules: Optional[list[str]] = None,
    ) -> EvaluationResponse:
        """
        One call for signup, login, call, payment, review, or raw threats.

        ``preset`` is ``signup``, ``login``, ``call``, ``payment``, or ``review``.
        ``threats`` examples: ``["human"]``, ``["voice"]``, ``["spam"]``, ``["bot"]``.
        Bot-only checks do not open a camera. The click-the-shape challenge is the JS client.
        """
        plan = _PRESETS.get(preset or "")
        if preset and plan is None:
            raise TrustLayerError(f"unknown preset: {preset}")
        wanted = threats or (plan["threats"] if plan else ["human"])
        mods = modules or _modules_for_threats(wanted)
        session_type = type or (plan["type"] if plan else _session_type_for_threats(wanted))
        session = self.create_session(
            type=session_type,
            user_id=user_id,
            modules=mods,
        )
        if text:
            session.track_event("custom", {"signal_type": "message", "message_content": text})
        if agent_id:
            session.track_event("custom", {"agent_id": agent_id, "owner_org": owner_org})
        if plan is not None and not threats and not image_b64 and not audio_b64 and not audio_pcm:
            needs_media = bool(plan["media"])
        else:
            needs_media = any(t in wanted for t in ("human", "voice", "video", "deepfake"))
        if needs_media or image_b64 or audio_b64 or audio_pcm:
            return session.verify_human(
                consent=consent,
                image_b64=image_b64,
                audio_b64=audio_b64,
                audio_pcm=audio_pcm,
                modules=mods,
            )
        return session.evaluate(mods)

    def verify_voice(
        self,
        type: str = "interview",  # noqa: A002
        *,
        user_id: Optional[str] = None,
        consent: bool = False,
        audio_features: Optional[list[float]] = None,
        audio_b64: Optional[str] = None,
        audio_pcm: Optional[list[float]] = None,
        sample_rate: int = 16000,
        modules: Optional[list[str]] = None,
    ) -> EvaluationResponse:
        """One-shot voice clone / replay check."""
        session = self.create_session(
            type=type,
            user_id=user_id,
            modules=modules or ["deepfake", "bot"],
        )
        return session.verify_voice(
            consent=consent,
            audio_features=audio_features,
            audio_b64=audio_b64,
            audio_pcm=audio_pcm,
            sample_rate=sample_rate,
            modules=modules,
        )

    # ── Shorthand score methods ────────────────────────────────────────────────

    def trust_score(self, session_id: str) -> TrustScoreResponse:
        """Get the current trust score for a session."""
        return self._http.get(
            f"/v1/trust/{session_id}",
            response_model=TrustScoreResponse,
        )

    def risk_score(self, session_id: str) -> RiskScoreResponse:
        """Get the current risk score for a session."""
        return self._http.get(
            f"/v1/risk/{session_id}",
            response_model=RiskScoreResponse,
        )

    def evaluate(
        self,
        session_id: str,
        *,
        modules: Optional[list[str]] = None,
    ) -> EvaluationResponse:
        """
        Run a full trust + risk evaluation for a session.

        :param session_id: The session to evaluate.
        :param modules: Optional list of modules to include.

        Example::

            result = client.evaluate("sess_abc123")
            print(result.trust_score.trust_score)   # 88.0
            print(result.risk_score.risk_score)      # 14.0
            print(result.recommendation)             # "allow"
        """
        return self._http.post(
            "/v1/evaluate",
            body={"session_id": session_id, "modules": modules},
            response_model=EvaluationResponse,
        )

    # ── Shield module accessors ────────────────────────────────────────────────

    def fraud(self, session: TrustSession) -> FraudShield:
        """Return a FraudShield bound to the given session."""
        return FraudShield(session)

    def interview(self, session: TrustSession) -> InterviewShield:
        """Return an InterviewShield bound to the given session."""
        return InterviewShield(session)

    def bot(self, session: TrustSession) -> BotShield:
        """Return a BotShield bound to the given session."""
        return BotShield(session)

    def deepfake(self, session: TrustSession) -> DeepfakeShield:
        """Return a DeepfakeShield bound to the given session."""
        return DeepfakeShield(session)

    def anomaly(self, session: TrustSession) -> AnomalyShield:
        """Return an AnomalyShield bound to the given session."""
        return AnomalyShield(session)

    # ── Auth / key management ─────────────────────────────────────────────────

    def generate_keys(self, name: str, project_id: Optional[str] = None) -> GenerateKeysResponse:
        """
        Generate a new public + secret API key pair.
        Requires a secret key to authenticate this call.

        :param name: Human-readable label for the key pair.
        :param project_id: Associate with an existing project (optional).
        """
        body: dict[str, Any] = {"name": name}
        if project_id:
            body["project_id"] = project_id
        return self._http.post(
            "/v1/auth/keys",
            body=body,
            response_model=GenerateKeysResponse,
        )

    def issue_token(
        self,
        user_id: str,
        *,
        role: str = "developer",
        ttl_minutes: int = 60,
    ) -> IssueTokenResponse:
        """
        Issue a short-lived JWT for a user.
        Requires a secret key to authenticate this call.
        """
        return self._http.post(
            "/v1/auth/token",
            body={"user_id": user_id, "role": role, "ttl_minutes": ttl_minutes},
            response_model=IssueTokenResponse,
        )

    # ── Webhooks ──────────────────────────────────────────────────────────────

    def register_webhook(self, url: str, events: Optional[list[str]] = None) -> WebhookEndpoint:
        """
        Register a webhook endpoint to receive TrustLayer events.

        :param url: Your HTTPS endpoint.
        :param events: List of event types to subscribe to, e.g.
            ``["risk.detected", "session.completed"]``.
            Pass ``None`` or ``["*"]`` to receive all events.
        """
        return self._http.post(
            "/v1/webhooks",
            body={"url": url, "events": events or []},
            response_model=WebhookEndpoint,
        )

    def list_webhooks(self) -> list[WebhookEndpoint]:
        """List all registered webhook endpoints for this organisation."""
        raw = self._http._request_raw("GET", "/v1/webhooks", body=None)
        return [WebhookEndpoint.model_validate(w) for w in raw.get("webhooks", [])]

    def delete_webhook(self, webhook_id: str) -> None:
        """Delete a webhook endpoint by ID."""
        self._http.delete(f"/v1/webhooks/{webhook_id}")

    # ── Context manager ───────────────────────────────────────────────────────

    def close(self) -> None:
        """Close the underlying HTTP client and release connections."""
        self._http.close()

    def __enter__(self) -> "TrustLayer":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"TrustLayer(api_url={self._http._base_url!r})"


_PRESETS: dict[str, dict[str, Any]] = {
    "signup": {"threats": ["bot", "fraud"], "type": "user_verification", "media": False},
    "login": {"threats": ["bot", "fraud"], "type": "authentication", "media": False},
    "call": {"threats": ["human"], "type": "interview", "media": True},
    "payment": {"threats": ["fraud", "bot", "anomaly"], "type": "transaction", "media": False},
    "review": {"threats": ["spam", "bot"], "type": "user_verification", "media": False},
}


def _modules_for_threats(threats: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(*names: str) -> None:
        for n in names:
            if n not in seen:
                seen.add(n)
                out.append(n)

    for t in threats or ["human"]:
        if t == "human":
            add("interview", "deepfake", "bot")
        elif t in ("voice", "video", "deepfake"):
            add("deepfake", "bot")
        elif t == "bot":
            add("bot")
        elif t == "spam":
            add("spam")
        elif t == "agent":
            add("agent", "bot")
        elif t == "fraud":
            add("fraud", "anomaly")
        elif t == "anomaly":
            add("anomaly")
        elif t == "ai":
            add("interview", "spam", "bot")
    return out or ["interview", "deepfake", "bot"]


def _session_type_for_threats(threats: list[str]) -> str:
    if "agent" in threats:
        return "agent"
    if "fraud" in threats:
        return "transaction"
    if "spam" in threats and not any(t in threats for t in ("human", "deepfake", "voice", "video")):
        return "user_verification"
    return "interview"
