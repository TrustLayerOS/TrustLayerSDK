"""AnomalyShield — behavioral anomaly detection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..session import TrustSession


@dataclass
class AnomalyResult:
    anomaly_score: float
    is_anomaly: bool
    deviations: list[str]


class AnomalyShield:
    """
    Detects behavior that deviates significantly from established patterns.

    Usage::

        session = client.create_session(type="authentication")
        anomaly = AnomalyShield(session)
        result = anomaly.detect()
        print(result.anomaly_score)  # 0–100
    """

    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def detect(self) -> AnomalyResult:
        """Detect behavioral anomalies in the current session."""
        risk = self._session.get_risk_score()

        behavior_risk = risk.dimensions.behavior_risk if risk.dimensions else 0.0
        network_risk = risk.dimensions.network_risk if risk.dimensions else 0.0
        anomaly_score = round(behavior_risk * 0.6 + network_risk * 0.4)

        anomaly_signal_keys = {
            "behavior_anomaly",
            "device_anomaly",
            "network_risk",
            "suspicious_activity",
            "geographic_anomaly",
            "unusual_login_time",
            "transaction_volume_spike",
        }
        deviations = [f for f in risk.factors if f in anomaly_signal_keys]

        return AnomalyResult(
            anomaly_score=anomaly_score,
            is_anomaly=anomaly_score >= 40,
            deviations=deviations,
        )
