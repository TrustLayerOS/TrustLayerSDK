import hashlib
import hmac
import time

from trustlayer.webhooks import verify_webhook_signature


def _sign(secret: str, timestamp: str, payload: bytes) -> str:
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def test_webhook_accepts_timestamp_dot_body():
    secret = "whsec_test"
    payload = b'{"type":"session.completed"}'
    ts = str(int(time.time()))
    assert verify_webhook_signature(payload, _sign(secret, ts, payload), secret, ts)


def test_webhook_rejects_body_only_signature():
    secret = "whsec_test"
    payload = b'{"type":"session.completed"}'
    ts = str(int(time.time()))
    body_only = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert not verify_webhook_signature(payload, body_only, secret, ts)


def test_webhook_rejects_stale_timestamp():
    secret = "whsec_test"
    payload = b'{"type":"session.completed"}'
    ts = str(int(time.time()) - 1000)
    assert not verify_webhook_signature(payload, _sign(secret, ts, payload), secret, ts)
