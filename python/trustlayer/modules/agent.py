"""AgentShield — post an agent id and evaluate. The id is not authorization."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..session import TrustSession


class AgentShield:
    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def evaluate(self, agent_id: str, owner_org: Optional[str] = None) -> Any:
        self._session.track_event(
            "custom",
            {"agent_id": agent_id, "owner_org": owner_org},
        )
        return self._session.evaluate(modules=["agent", "bot", "spam"])
