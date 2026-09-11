"""InterviewShield — interview integrity evaluation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal, Optional

from ..models import EvaluationResponse, RiskScoreResponse, TrustScoreResponse

if TYPE_CHECKING:
    from ..session import TrustSession


@dataclass
class IntegrityResult:
    integrity_score: float
    ai_assistance_probability: float
    identity_consistency: float
    risk_factors: list[str]
    recommendation: Literal["pass", "review", "flag"]


class InterviewShield:
    """
    Monitors interview sessions for AI assistance, identity fraud,
    and behavioral anomalies.

    Usage::

        session = client.create_session(type="interview")
        shield = InterviewShield(session)

        # During interview...
        shield.report_window_switch()
        shield.report_external_application("ChatGPT")

        result = shield.get_integrity_score()
        print(result.recommendation)  # "review"
    """

    def __init__(self, session: "TrustSession") -> None:
        self._session = session
        self._window_switches = 0

    def report_window_switch(self) -> None:
        """Report that the candidate switched windows or tabs."""
        self._window_switches += 1
        self._session.track_event(
            "window_switch",
            {"count": self._window_switches},
        )

    def report_external_application(self, app_name: str) -> None:
        """Report that an external application was detected."""
        self._session.track_event(
            "suspicious_activity",
            {"application": app_name},
        )

    def report_ai_assistance(self, probability: float) -> None:
        """
        Report an AI assistance signal directly (e.g. from your own detection).

        :param probability: 0.0–1.0 probability that AI assistance is occurring.
        """
        self._session.track_event(
            "ai_assistance_signal",
            {"probability": probability},
        )

    def report_face_match(self, confidence: float, verified: bool = True) -> None:
        """Report the result of a face match check."""
        self._session.track_event(
            "face_match_completed",
            {"confidence": confidence, "verified": verified},
        )

    def get_integrity_score(self) -> IntegrityResult:
        """
        Compute the current interview integrity score from /v1/evaluate.
        """
        evaluation: EvaluationResponse = self._session.evaluate(
            modules=["interview", "deepfake", "bot"]
        )
        iv = (evaluation.modules.interview if evaluation.modules else None) or {}
        if iv:
            rec = iv.get("recommendation", "review")
            if rec not in ("pass", "review", "flag"):
                rec = "review"
            rec_lit: Literal["pass", "review", "flag"] = rec  # type: ignore[assignment]
            return IntegrityResult(
                integrity_score=float(iv.get("integrity_score", evaluation.integrity_score)),
                ai_assistance_probability=float(iv.get("ai_assistance_probability", 0)),
                identity_consistency=float(iv.get("identity_consistency", 0)),
                risk_factors=list(iv.get("risk_factors") or evaluation.reasons),
                recommendation=rec_lit,
            )

        trust: TrustScoreResponse = self._session.get_trust_score()
        risk: RiskScoreResponse = self._session.get_risk_score()

        integrity_score = round(trust.trust_score * 0.6 + (100 - risk.risk_score) * 0.4)

        # Derive AI assistance probability from risk factors
        factors = risk.factors
        if "ai_assistance_signal" in factors or "content_risk" in factors:
            ai_prob = 0.70
        elif "behavior_anomaly" in factors:
            ai_prob = 0.40
        else:
            ai_prob = 0.10

        identity_consistency = (
            trust.components.identity_score if trust.components else 80.0
        )

        if integrity_score < 40 or ai_prob > 0.70:
            recommendation: Literal["pass", "review", "flag"] = "flag"
        elif integrity_score < 65 or ai_prob > 0.40 or self._window_switches > 5:
            recommendation = "review"
        else:
            recommendation = "pass"

        return IntegrityResult(
            integrity_score=integrity_score,
            ai_assistance_probability=round(ai_prob, 3),
            identity_consistency=identity_consistency,
            risk_factors=factors,
            recommendation=recommendation,
        )
