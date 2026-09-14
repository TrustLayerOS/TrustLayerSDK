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

    def verify_human(
        self,
        *,
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
        Same contract as JS ``session.verifyHuman()``. Python cannot open a
        webcam — pass captured JPEG / PCM / features, then evaluate.

        Biometric fields require ``consent=True``. Raw frames are scored by
        the OS and not persisted.
        """
        needs_bio = any(
            x is not None
            for x in (liveness_passed, video_features, audio_features, image_b64, audio_b64, audio_pcm)
        )
        if needs_bio and not consent:
            from .exceptions import TrustLayerError

            raise TrustLayerError("consent_required")

        payload = {"consent": True, "challenge": challenge}
        if motion:
            payload["motion"] = motion
        if liveness_passed is True:
            if not motion:
                from .exceptions import TrustLayerError

                raise TrustLayerError(
                    "liveness_passed requires motion evidence; "
                    "use server-issued challenge_id + motion from a live capture"
                )
            self.track_event(
                "liveness_challenge_passed",
                {**payload, "passed_client": True},
            )
        elif liveness_passed is False:
            self.track_event(
                "liveness_challenge_failed",
                {**payload, "passed_client": False},
            )
        if video_features or image_b64:
            self.track_event(
                "face_frame",
                {**payload, "ml_features": video_features or [], "image_b64": image_b64},
            )
        if audio_features or audio_b64 or audio_pcm:
            audio_payload = {
                **payload,
                "ml_features": audio_features or [],
                "audio_b64": audio_b64,
                "audio_pcm": audio_pcm,
                "sample_rate": sample_rate,
            }
            self.track_event("voice_liveness", audio_payload)
            self.track_event("voice_clone_risk", audio_payload)
        return self.evaluate(modules or ["interview", "deepfake", "bot"])

    def verify_voice(
        self,
        *,
        consent: bool = False,
        audio_features: Optional[list[float]] = None,
        audio_b64: Optional[str] = None,
        audio_pcm: Optional[list[float]] = None,
        sample_rate: int = 16000,
        modules: Optional[list[str]] = None,
    ) -> EvaluationResponse:
        """Audio-only clone / replay check. Same evaluate JSON, no face frames."""
        return self.verify_human(
            consent=consent,
            audio_features=audio_features,
            audio_b64=audio_b64,
            audio_pcm=audio_pcm,
            sample_rate=sample_rate,
            modules=modules or ["deepfake", "bot"],
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
