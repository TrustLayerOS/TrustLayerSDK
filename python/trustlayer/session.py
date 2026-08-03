"""
TrustSession — represents an active trust evaluation session.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from .models import (
    CreateSessionResponse,
    EvaluationResponse,
    RiskScoreResponse,
    SendEventResponse,
    TrustScoreResponse,
)

if TYPE_CHECKING:
    from .http import HttpClient


class TrustSession:
    """
    An active trust evaluation session.

    Obtained from :meth:`TrustLayer.create_session`.
    """

    def __init__(
        self,
        data: CreateSessionResponse,
        http: "HttpClient",
    ) -> None:
        self._data = data
        self._http = http

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def session_id(self) -> str:
        return self._data.id

    @property
    def type(self) -> str:
        return self._data.type

    @property
    def status(self) -> str:
        return self._data.status

    @property
    def modules(self) -> list[str]:
        return self._data.modules

    # ── Events ────────────────────────────────────────────────────────────────

    def track_event(
        self,
        event_type: str,
        data: Optional[dict[str, Any]] = None,
    ) -> SendEventResponse:
        """
        Send a trust signal event for this session.

        :param event_type: One of the standard event types or "custom".
        :param data: Arbitrary key-value metadata for the event.

        Example::

            session.track_event("device_change", {"is_new": True})
            session.track_event("face_match_completed", {"confidence": 0.94})
        """
        return self._http.post(
            "/v1/events",
            body={
                "session_id": self.session_id,
                "type": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data or {},
            },
            response_model=SendEventResponse,
        )

    # ── Scores ────────────────────────────────────────────────────────────────

    def get_trust_score(self) -> TrustScoreResponse:
        """Retrieve the current trust score for this session."""
        return self._http.get(
            f"/v1/trust/{self.session_id}",
            response_model=TrustScoreResponse,
        )

    def get_risk_score(self) -> RiskScoreResponse:
        """Retrieve the current risk score for this session."""
        return self._http.get(
            f"/v1/risk/{self.session_id}",
            response_model=RiskScoreResponse,
        )

    def evaluate(
        self, modules: Optional[list[str]] = None
    ) -> EvaluationResponse:
        """
        Run a full trust + risk evaluation and get a recommendation.

        :param modules: Optionally restrict evaluation to specific modules.
        """
        return self._http.post(
            "/v1/evaluate",
            body={"session_id": self.session_id, "modules": modules},
            response_model=EvaluationResponse,
        )

    def complete(self) -> EvaluationResponse:
        """
        Finalise the session. Computes the final evaluation, updates
        the entity's reputation, and stops monitoring.
        """
        return self._http.post(
            f"/v1/sessions/{self.session_id}/complete",
            body=None,
            response_model=EvaluationResponse,
        )

    def __repr__(self) -> str:
        return (
            f"TrustSession(session_id={self.session_id!r}, "
            f"type={self.type!r}, status={self.status!r})"
        )
