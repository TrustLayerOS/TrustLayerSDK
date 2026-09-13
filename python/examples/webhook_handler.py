"""
Webhook Handler Example (Python / Flask)

Shows how to receive and verify TrustLayer webhooks in a Flask backend.

Install Flask:
    pip install flask

Run:
    WEBHOOK_SECRET=your-secret flask run --port=5000
"""

import os
import json

# Flask is an optional dependency for this example only
try:
    from flask import Flask, request, jsonify, abort
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False
    print("Flask not installed. Run: pip install flask")

from trustlayer.webhooks import verify_webhook_signature

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "dev-webhook-secret")

if FLASK_AVAILABLE:
    app = Flask(__name__)

    @app.post("/webhook/trustlayer")
    def trustlayer_webhook():
        # 1. Verify the signature before processing
        signature = request.headers.get("X-TrustLayer-Signature", "")
        timestamp = request.headers.get("X-TrustLayer-Timestamp", "")
        raw_body = request.get_data()

        if not verify_webhook_signature(raw_body, signature, WEBHOOK_SECRET, timestamp):
            print("✗ Invalid webhook signature — rejecting")
            abort(401)

        payload = request.json
        event_type = payload.get("type", "unknown")
        data = payload.get("data", {})

        print(f"\n→ Webhook received: {event_type}")

        # 2. Handle each event type
        match event_type:
            case "risk.detected":
                risk_score = data.get("risk_score", 0)
                session_id = data.get("session_id", "")
                print(f"  High risk! Score={risk_score}, session={session_id}")
                # → Trigger MFA, lock account, notify security team, etc.

            case "session.completed":
                trust = data.get("trust_score", 0)
                session_id = data.get("session_id", "")
                print(f"  Session {session_id} completed. Trust={trust}")
                # → Store final evaluation, update user profile, etc.

            case "policy.action":
                action = data.get("action", "")
                print(f"  Policy triggered: {action}")
                # → Execute action in your system

            case "trust.updated":
                trust = data.get("trust_score", 0)
                print(f"  Trust updated: {trust}")

            case _:
                print(f"  Unhandled event type: {event_type}")

        return jsonify({"received": True}), 200


# ─── Standalone verification demo (no Flask needed) ──────────────────────────

def demo_signature_verification() -> None:
    """Show how verify_webhook_signature works without a web framework."""
    import hashlib
    import hmac

    import time

    secret = "my-webhook-secret"
    payload = json.dumps({
        "type": "risk.detected",
        "data": {"risk_score": 87, "session_id": "sess_abc"},
    })
    payload_bytes = payload.encode()
    timestamp = str(int(time.time()))

    signed = f"{timestamp}.".encode() + payload_bytes
    sig = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    header = f"sha256={sig}"

    is_valid = verify_webhook_signature(payload_bytes, header, secret, timestamp)
    print(f"Signature valid: {is_valid}")  # True

    tampered = payload.replace("87", "10")
    is_valid_tampered = verify_webhook_signature(tampered, header, secret, timestamp)
    print(f"Tampered valid:  {is_valid_tampered}")  # False


if __name__ == "__main__":
    demo_signature_verification()

    if FLASK_AVAILABLE:
        print("\nStarting Flask webhook receiver on :5000 ...")
        app.run(port=5000, debug=True)
