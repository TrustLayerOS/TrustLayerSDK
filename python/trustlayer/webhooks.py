"""
Webhook utilities — HMAC-SHA256 signature verification.

TrustLayerOS signs HMAC-SHA256(secret, timestamp + "." + raw_body) and sends:
  X-TrustLayer-Signature: sha256=<hex>
  X-TrustLayer-Timestamp: <unix seconds>
"""

from __future__ import annotations

import hashlib
import hmac
import time

DEFAULT_MAX_AGE_SECONDS = 300
SIGNATURE_HEADER = "X-TrustLayer-Signature"
TIMESTAMP_HEADER = "X-TrustLayer-Timestamp"


def verify_webhook_signature(
    payload: str | bytes,
    signature_header: str,
    secret: str,
    timestamp: str,
    *,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
) -> bool:
    """
    Verify an incoming TrustLayer webhook signature.

    :param payload: Raw request body (str or bytes).
    :param signature_header: Value of the ``X-TrustLayer-Signature`` header.
    :param secret: Webhook secret returned once at ``POST /v1/webhooks``.
    :param timestamp: Value of the ``X-TrustLayer-Timestamp`` header.
    :param max_age_seconds: Reject stamps older/newer than this (default 300).
    :returns: ``True`` if the signature is valid, ``False`` otherwise.

    Example (Flask)::

        from trustlayer.webhooks import verify_webhook_signature

        @app.post("/webhook/trustlayer")
        def trustlayer_webhook():
            sig = request.headers.get("X-TrustLayer-Signature", "")
            ts = request.headers.get("X-TrustLayer-Timestamp", "")
            if not verify_webhook_signature(request.data, sig, WEBHOOK_SECRET, ts):
                abort(401)
    """
    if not timestamp:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if max_age_seconds > 0 and abs(int(time.time()) - ts) > max_age_seconds:
        return False

    if isinstance(payload, str):
        payload_bytes = payload.encode("utf-8")
    else:
        payload_bytes = payload

    expected_hex = signature_header.removeprefix("sha256=")
    signed = timestamp.encode("utf-8") + b"." + payload_bytes
    computed = hmac.new(
        secret.encode("utf-8"),
        signed,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, expected_hex)
