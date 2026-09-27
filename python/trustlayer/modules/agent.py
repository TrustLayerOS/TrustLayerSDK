"""AgentShield — post an agent id and evaluate. The id is not authorization."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from ..session import TrustSession


class AgentShield:
    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def record_page(self, page: str, action: str) -> Any:
        """Attach the page and the action. The server decides. This does not allow or block."""
        return self._session.track_event("custom", {"page": page, "action": action})

    def evaluate(
        self,
        agent_id: Optional[str] = None,
        owner_org: Optional[str] = None,
        page: Optional[str] = None,
        action: Optional[str] = None,
    ) -> Any:
        if page and action:
            self.record_page(page, action)
        if agent_id:
            self._session.track_event(
                "custom",
                {"agent_id": agent_id, "owner_org": owner_org},
            )
        return self._session.evaluate(modules=["agent", "bot", "spam"])
