"""FraudShield — server-side fraud evaluation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from ..models import EvaluationResponse

if TYPE_CHECKING:
    from ..session import TrustSession


class FraudShield:
    """
    Evaluates fraud risk for a session.

    Usage::

        session = client.create_session(type="transaction")
        fraud = FraudShield(session)
        result = fraud.evaluate(transaction_amount=2500.0)
    """

    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def evaluate(
        self,
        *,
        transaction_amount: Optional[float] = None,
        transaction_currency: str = "USD",
        transaction_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> EvaluationResponse:
        """
        Evaluate fraud risk, optionally enriched with transaction context.
        """
        if transaction_amount is not None:
            self._session.track_event(
                "custom",
                {
                    "signal_type": "transaction",
                    "amount": transaction_amount,
                    "currency": transaction_currency,
                    "transaction_id": transaction_id,
                    "user_id": user_id,
                },
            )
        return self._session.evaluate(modules=["fraud"])

    def monitor_transaction(self, transaction_id: str) -> None:
        """Tag a transaction ID to this session for tracking."""
        self._session.track_event(
            "custom",
            {"signal_type": "transaction_monitor", "transaction_id": transaction_id},
        )
