"""SpamShield — post text and evaluate the spam module."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..session import TrustSession


class SpamShield:
    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def evaluate(self, text: str) -> Any:
        self._session.track_event(
            "custom",
            {"signal_type": "message", "message_content": text},
        )
        return self._session.evaluate(modules=["spam", "bot"])
