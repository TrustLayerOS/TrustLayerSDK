# trustlayer (Python SDK)

Official Python SDK for [TrustLayer](https://trustlayer.dev) — trust infrastructure for the AI-native internet.

---

## Requirements

- Python 3.9+
- `httpx >= 0.27`
- `pydantic >= 2.6`

---

## Installation

```bash
pip install trustlayer
```

Or install from source:

```bash
cd TrustLayerSDK/python
pip install -e .
```

---

## Quick Start

```python
from trustlayer import TrustLayer

client = TrustLayer(api_key="tl_secret_xxx")

# Create a session
session = client.create_session(type="transaction", user_id="user_123")

# Send signals
session.track_event("device_change", {"is_new": True})

# Evaluate
result = client.evaluate(session.session_id)
print(result.trust_score.trust_score)   # 88.0
print(result.risk_score.risk_score)     # 12.0
print(result.recommendation)           # "allow"

# Complete
session.complete()
```

Use as a context manager to auto-close the HTTP client:

```python
with TrustLayer(api_key="tl_secret_xxx") as client:
    session = client.create_session(type="authentication")
    result = session.evaluate()
```

---

## Session Types

| Type | Use Case |
|---|---|
| `user_verification` | General user trust check |
| `interview` | Remote hiring integrity |
| `transaction` | Payment / financial risk |
| `authentication` | Login / account access |
| `agent` | AI agent verification |

---

## Shield Modules

### Fraud Shield

```python
session = client.create_session(type="transaction", user_id="u_123")

fraud = client.fraud(session)
result = fraud.evaluate(transaction_amount=2500.0, transaction_currency="USD")

print(result.recommendation)           # "allow"
print(result.risk_score.risk_score)    # 14.0
print(result.risk_score.factors)       # ["no_significant_risk"]
```

### Interview Shield

```python
session = client.create_session(
    type="interview",
    user_id="candidate_abc",
    modules=["interview", "deepfake"],
)

shield = client.interview(session)

# Report signals during the interview
shield.report_face_match(confidence=0.94)
shield.report_window_switch()
shield.report_ai_assistance(probability=0.72)
shield.report_external_application("ChatGPT")

result = shield.get_integrity_score()
print(result.integrity_score)            # 0–100
print(result.ai_assistance_probability) # 0.72
print(result.recommendation)            # "review"

session.complete()
```

### Bot Shield

```python
session = client.create_session(type="user_verification")

# Send behavioral signals
session.track_event("mouse_activity", {"mouse_movements": 0, "robotic": True})
session.track_event("typing_pattern", {"cadence_variance": 0.001, "automated": True})

bot = client.bot(session)
result = bot.analyze()

print(result.is_bot)            # True
print(result.bot_probability)   # 0.85
```

### Anomaly Shield

```python
session = client.create_session(type="authentication", user_id="u_456")
session.track_event("device_change", {"is_new": True})
session.track_event("suspicious_activity", {"reason": "location_change"})

anomaly = client.anomaly(session)
result = anomaly.detect()

print(result.anomaly_score)  # 0–100
print(result.is_anomaly)     # True
print(result.deviations)     # ["device_anomaly", "network_risk"]
```

---

## Tracking Events

```python
# Identity
session.track_event("identity_verified", {"method": "email"})
session.track_event("face_match_completed", {"confidence": 0.94, "verified": True})
session.track_event("voice_verified", {"confidence": 0.91})

# Device
session.track_event("device_change", {"is_new": True, "device_id": "d_xyz"})

# Behavior
session.track_event("mouse_activity", {"mouse_movements": 312, "robotic": False})
session.track_event("typing_pattern", {"keystrokes": 89, "cadence_variance": 0.42})
session.track_event("window_switch", {"count": 2})

# Security
session.track_event("login_attempt", {"success": True})
session.track_event("suspicious_activity", {"reason": "vpn_detected", "vpn_detected": True})

# AI signals
session.track_event("ai_assistance_signal", {"probability": 0.72})
session.track_event("deepfake_detected", {"probability": 0.08})

# Custom
session.track_event("custom", {"signal_type": "transaction", "amount": 500.0})
```

---

## Webhook Verification

```python
from trustlayer.webhooks import verify_webhook_signature

# In your web framework's route handler:
raw_body = request.body          # raw bytes
signature = request.headers["X-TrustLayer-Signature"]
secret = os.environ["WEBHOOK_SECRET"]

if not verify_webhook_signature(raw_body, signature, secret):
    return 401

event = request.json
match event["type"]:
    case "risk.detected":
        # handle high risk...
    case "session.completed":
        # store final result...
```

---

## Error Handling

```python
from trustlayer import TrustLayer, TrustLayerError, TrustLayerAuthError, TrustLayerRateLimitError

try:
    result = client.evaluate("sess_abc")
except TrustLayerAuthError:
    print("Invalid API key")
except TrustLayerRateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after:.0f}s")
except TrustLayerError as e:
    print(f"Error {e.status_code}: {e}")
```

---

## Configuration

```python
client = TrustLayer(
    api_key="tl_secret_xxx",
    api_url="http://localhost:8080",  # for local dev / self-hosted
    timeout=10.0,                     # request timeout in seconds
)
```

---

## Key Management

```python
# Generate a new key pair (requires secret key authentication)
keys = client.generate_keys(name="Production Keys")
print(keys.public_key)   # tl_public_xxx
print(keys.secret_key)   # tl_secret_xxx  ← store securely, shown once

# Issue a short-lived JWT
token = client.issue_token(user_id="user_123", role="developer", ttl_minutes=30)
print(token.token)
```

---

## License

MIT
