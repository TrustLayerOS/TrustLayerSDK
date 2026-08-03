"""
Fraud Prevention Example (Python)

Shows how a fintech backend evaluates transaction risk using
TrustLayer's Fraud Shield.

Run:
    TRUSTLAYER_SECRET_KEY=tl_secret_xxx python examples/fraud_prevention.py
"""

import os
from trustlayer import TrustLayer

API_KEY = os.environ.get("TRUSTLAYER_SECRET_KEY", "tl_secret_example")
API_URL = os.environ.get("TRUSTLAYER_API_URL", "http://localhost:8080")


def evaluate_transaction(
    user_id: str,
    amount: float,
    currency: str = "USD",
    is_new_device: bool = False,
    location_changed: bool = False,
) -> None:
    print(f"\nEvaluating transaction for user {user_id}")
    print(f"  Amount: {currency} {amount:,.2f}")

    with TrustLayer(api_key=API_KEY, api_url=API_URL) as client:
        # 1. Create a transaction session
        session = client.create_session(
            type="transaction",
            user_id=user_id,
            modules=["fraud", "anomaly"],
            metadata={"amount": amount, "currency": currency},
        )

        # 2. Send contextual signals
        if is_new_device:
            session.track_event("device_change", {"is_new": True})

        if location_changed:
            session.track_event(
                "suspicious_activity",
                {"reason": "location_change", "vpn_detected": True},
            )

        if amount > 5000:
            session.track_event(
                "custom",
                {
                    "signal_type": "transaction",
                    "amount": amount,
                    "currency": currency,
                    "high_value": True,
                },
            )

        # 3. Use FraudShield for evaluation
        fraud = client.fraud(session)
        result = fraud.evaluate(
            transaction_amount=amount,
            transaction_currency=currency,
            user_id=user_id,
        )

        # 4. Print decision
        print("\n─── Fraud Assessment ─────────────────────────────")
        print(f"  Fraud Probability : {result.risk_score.risk_score / 100:.1%}")
        print(f"  Risk Score        : {result.risk_score.risk_score:.0f}/100")
        print(f"  Recommendation    : {result.recommendation.upper()}")
        if result.risk_score.primary_factors:
            print("  Risk Factors:")
            for f in result.risk_score.primary_factors:
                print(f"    • {f}")
        print("──────────────────────────────────────────────────")

        # 5. Complete
        session.complete()


if __name__ == "__main__":
    # Low-risk transaction
    evaluate_transaction(
        user_id="user_established_001",
        amount=49.99,
        is_new_device=False,
        location_changed=False,
    )

    # High-risk transaction
    evaluate_transaction(
        user_id="user_new_002",
        amount=8500.00,
        is_new_device=True,
        location_changed=True,
    )
