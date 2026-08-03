"""BotShield — bot detection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..session import TrustSession


@dataclass
class BotResult:
    bot_probability: float
    human_probability: float
    is_bot: bool
    confidence: float
    signals: list[str]


class BotShield:
    """
    Detects automated / bot behavior in a session.

    Usage::

        session = client.create_session(type="user_verification")
        bot = BotShield(session)
        result = bot.analyze()
        print(result.is_bot)  # False
    """

    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def analyze(self) -> BotResult:
        """Analyze the session for bot signals."""
        risk = self._session.get_risk_score()

        behavior_risk = (
            risk.dimensions.behavior_risk if risk.dimensions else risk.risk_score
        )
        bot_probability = min(1.0, behavior_risk / 100.0)
        human_probability = 1.0 - bot_probability

        bot_signals = [
            "behavior_anomaly",
            "automation_framework_detected",
            "no_mouse_activity",
            "robotic_mouse_movement",
            "automated_typing_pattern",
            "perfect_typing_cadence",
            "uniform_mouse_velocity",
            "superhuman_typing_speed",
        ]
        signals = [f for f in risk.factors if f in bot_signals]

        return BotResult(
            bot_probability=round(bot_probability, 4),
            human_probability=round(human_probability, 4),
            is_bot=bot_probability >= 0.60,
            confidence=risk.confidence,
            signals=signals,
        )
