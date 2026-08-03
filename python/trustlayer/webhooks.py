"""
Webhook utilities — HMAC-SHA256 signature verification.
"""

from __future__ import annotations

import hashlib
import hmac


def verify_webhook_signature(
    payload: str | bytes,
    signature_header: str,
    secret: str,
) -> bool:
    """
    Verify an incoming TrustLayer webhook signature.

    TrustLayerOS signs every webhook with HMAC-SHA256 and sends the
    signature in the ``X-TrustLayer-Signature`` header as ``sha256=<hex>``.

    :param payload: Raw request body (str or bytes).
    :param signature_header: Value of the ``X-TrustLayer-Signature`` header.
    :param secret: Your webhook secret (from the dashboard or ``/v1/webhooks``).
    :returns: ``True`` if the signature is valid, ``False`` otherwise.

    Example (Flask)::

        from trustlayer.webhooks import verify_webhook_signature

        @app.post("/webhook/trustlayer")
        def trustlayer_webhook():
            sig = request.headers.get("X-TrustLayer-Signature", "")
            if not verify_webhook_signature(request.data, sig, WEBHOOK_SECRET):
                abort(401)
            event = request.json
            # handle event...
    """
    if isinstance(payload, str):
        payload = payload.encode("utf-8")

    # Strip optional "sha256=" prefix
    expected_hex = signature_header.removeprefix("sha256=")

    computed = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, expected_hex)
