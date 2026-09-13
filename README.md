# TrustLayer SDK

**The API you call before you trust the other side.**

Know whether a session is a live human — not a deepfake, replay, or empty bot — without storing raw video.

```ts
const result = await tl.verifyHuman({ type: "interview", consent: true })

result.recommendation     // "allow" | "verify" | "review" | "block"
result.human_probability  // 0–1
```

[![version](https://img.shields.io/badge/version-0.1.0-0F172A?style=flat)](#)
[![license](https://img.shields.io/badge/license-MIT-0F172A?style=flat)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat&logo=nodedotjs&logoColor=white)](#)
[![typescript](https://img.shields.io/badge/TypeScript-first-3178C6?style=flat&logo=typescript&logoColor=white)](#)
[![python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=flat&logo=python&logoColor=white)](#)

TypeScript / JavaScript · Python · React · Express / Next.js · Browser IIFE

---

## Why this exists

CAPTCHA proves a client is not a cheap bot. IDV proves a document once. Neither proves the person on *this* call is live and unassisted.

TrustLayer is the session layer in between: capture signals, score them, return a decision your app can act on.

```
your app  →  TrustLayer.verifyHuman()  →  TrustLayerOS  →  allow / verify / block
```

---

## Install

```bash
npm install @trustlayer/sdk
```

```bash
pip install trustlayer
```

Use a **public** key (`tl_public_…`) in the browser. Keep **secret** keys (`tl_secret_…`) on the server.

Point `apiUrl` at your TrustLayerOS instance. Local default: `http://127.0.0.1:8080`.

---

## Quick start

### Browser / Node

```ts
import TrustLayer from "@trustlayer/sdk"

const tl = TrustLayer.initialize({
  apiKey: process.env.TRUSTLAYER_PUBLIC_KEY!,
  apiUrl: "http://127.0.0.1:8080",
})

const result = await tl.verifyHuman({
  type: "interview",
  consent: true, // required before camera / mic
})

if (result.recommendation === "allow") {
  // continue the interview
}
```

`verifyHuman()` creates a session, runs a liveness challenge in the browser, sends features (not a raw video dump), and returns `POST /v1/evaluate`.

### One call per threat

```ts
await tl.check({ threats: ["human"], consent: true })          // live person
await tl.check({ threats: ["voice"], source: audio, consent: true })
await tl.check({ threats: ["video"], source: tile, consent: true })
await tl.check({ threats: ["bot"] })
await tl.check({ threats: ["spam"], text: messageBody })
await tl.check({ threats: ["agent"], agentId: "agt_1", ownerOrg: "acme" })
await tl.check({ threats: ["fraud"] })
await tl.check({ threats: ["ai"], text: outboundCopy })        // assisted / templated
```

Same JSON: `recommendation` + `modules.deepfake | bot | spam | agent | fraud | anomaly`.

Shields other than interview / deepfake / bot are **heuristic**. Act on `recommendation`; do not claim a trained spam or agent model.

### Meet, Zoom, and any WebRTC app

Google Meet and Zoom do not let a third-party script read their tiles. Pass the `MediaStream` you already have from a Video SDK, LiveKit, Daily, Twilio, or your own room.

```ts
import TrustLayer, { attachToCall } from "@trustlayer/sdk"

// One-shot on a Zoom / LiveKit / file stream
await tl.verifyHuman({
  source: participantStream,
  consent: true,
  liveness: false,
})

// Voice clone / replay only
await tl.verifyVoice({ source: audioStream, consent: true })

// Keep watching; on block, mute and blur the tile you control
const session = await tl.createSession({ type: "interview" })
await attachToCall({
  session,
  source: participantStream,
  platform: "zoom",
  participantId: "user_123",
  consent: true,
  autoRemove: true,
  onDecision: (r) => {
    if (r.recommendation === "block") {
      // kick via your host API — the SDK can only mute a stream it was given
    }
  },
})
```

Meet-lookalike demo (recording → deepfake tile removed → you join live): `examples/meeting-sidecar.html`. Shot list: `TrustLayerDocs/10-Roadmap/meet-zoom-demo.md`.

### React

```tsx
import { useVerifyHuman } from "@trustlayer/sdk/react"

export function VerifyButton() {
  const { verify, status, result, error } = useVerifyHuman({
    apiKey: import.meta.env.VITE_TRUSTLAYER_PUBLIC_KEY,
    apiUrl: import.meta.env.VITE_TRUSTLAYER_API_URL,
  })

  return (
    <button
      disabled={status === "running"}
      onClick={() => verify({ type: "interview", consent: true })}
    >
      {status === "running" ? "Checking…" : "Verify human"}
      {result && <span> → {result.recommendation}</span>}
    </button>
  )
}
```

### Protect a route

The client sends the session id from `verifyHuman()` as `X-TrustLayer-Session`. Middleware re-evaluates and requires `recommendation === "allow"`.

```ts
import express from "express"
import { requireHuman } from "@trustlayer/sdk/middleware"

const app = express()

app.post(
  "/payout",
  requireHuman({
    apiKey: process.env.TRUSTLAYER_SECRET_KEY!,
    apiUrl: process.env.TRUSTLAYER_API_URL,
  }),
  (req, res) => {
    res.json({ ok: true, human: req.trustlayer?.human_probability })
  }
)
```

Next.js App Router:

```ts
import { NextResponse } from "next/server"
import { nextRequireHuman } from "@trustlayer/sdk/middleware"

export async function POST(request: Request) {
  const check = await nextRequireHuman(request, {
    apiKey: process.env.TRUSTLAYER_SECRET_KEY!,
    apiUrl: process.env.TRUSTLAYER_API_URL,
  })
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status })
  }
  return NextResponse.json({ recommendation: check.evaluation.recommendation })
}
```

### Python

```python
from trustlayer import TrustLayer

with TrustLayer(api_key="tl_secret_xxx", api_url="http://127.0.0.1:8080") as tl:
    result = tl.verify_human(
        type="interview",
        consent=True,
        image_b64=jpeg_b64,   # Python cannot open a webcam
    )
    print(result.recommendation, result.human_probability)
```

---

## What you get back

```json
{
  "session_id": "sess_…",
  "human_probability": 0.91,
  "deepfake_risk": 0.08,
  "integrity_score": 82,
  "recommendation": "allow",
  "reasons": ["liveness_passed", "low_window_switch"],
  "modules": {
    "interview": {},
    "deepfake": {},
    "bot": {}
  }
}
```

| Field | Meaning |
|---|---|
| `recommendation` | Policy decision: `allow`, `verify`, `review`, `block` (also `monitor`) |
| `human_probability` | Blend of bot inverse, interview identity consistency, and `1 − deepfake` — not a trained personhood model |
| `deepfake_risk` | Server-side media score when frames / audio were sent |
| `integrity_score` | Interview-style session integrity (window switches, assistance signals) |
| `reasons` | Human-readable factors your UI can show |

Act on `recommendation`. Treat the probabilities as **uncalibrated** until you have a labeled set.

---

## Sessions

Need more control than the one-shot? Use the session API.

```ts
const session = await tl.createSession({
  type: "interview",
  userId: "candidate_123",
  modules: ["interview", "deepfake", "bot"],
})

session.startSignalCollection()
await session.trackEvent("window_switch", { count: 1 })

const result = await session.evaluate()
await session.complete()
```

```
initialize → createSession → collect / trackEvent → evaluate → complete
```

| `type` | When to use it |
|---|---|
| `interview` | Live hiring or video calls |
| `authentication` | Login / step-up |
| `user_verification` | Generic presence check |
| `transaction` | High-risk money movement |
| `agent` | Machine-to-machine later |

---

## Privacy

Media is opt-in. The SDK will not open the camera or microphone without `consent: true` (or a confirmed `onConsent` callback).

What leaves the device by default:

- Forensic **features** and short sampled JPEGs / audio windows for scoring
- Coarse device / behavior signals if you call `startSignalCollection()`

What does not leave the device by default:

- A continuous raw video recording

TrustLayerOS fails closed on biometric ingest without consent, strips raw blobs after scoring, and can encrypt stored feature vectors. Your backend should still treat secret keys and webhook secrets as production credentials.

---

## Webhooks

TrustLayerOS signs every delivery as:

```
HMAC-SHA256(secret, timestamp + "." + rawBody)
```

Headers: `X-TrustLayer-Signature` (`sha256=<hex>`), `X-TrustLayer-Timestamp` (unix seconds). Stamps older than 5 minutes are rejected.

```ts
import { verifyWebhookSignature } from "@trustlayer/sdk"

app.post("/webhooks/trustlayer", express.raw({ type: "application/json" }), async (req, res) => {
  const ok = await verifyWebhookSignature(
    req.body.toString("utf8"),
    String(req.headers["x-trustlayer-signature"] ?? ""),
    process.env.WEBHOOK_SECRET!,
    String(req.headers["x-trustlayer-timestamp"] ?? "")
  )
  if (!ok) return res.status(401).end()

  const event = JSON.parse(req.body.toString("utf8"))
  // session.completed | risk.detected | policy.action | …
  res.json({ received: true })
})
```

Register an endpoint with a **secret** key. The webhook secret is returned **once** at create time — store it.

```ts
const hook = await tl.registerWebhook("https://example.com/webhooks/trustlayer", [
  "session.completed",
  "risk.detected",
])
// hook.secret
```

---

## Configuration

```ts
TrustLayer.initialize({
  apiKey: "tl_public_…",          // required
  apiUrl: "https://api.example",  // default: https://api.trustlayer.dev
  timeout: 20_000,                // ms
  debug: false,
  modules: ["interview", "deepfake", "bot"],
  signalCollection: {
    device: true,
    behavior: true,
    network: true,
    identity: true,
  },
})
```

| Export | Import |
|---|---|
| Client, sessions, types, webhook verify | `@trustlayer/sdk` |
| `useVerifyHuman()` | `@trustlayer/sdk/react` |
| `requireHuman`, `nextRequireHuman` | `@trustlayer/sdk/middleware` |
| Browser bundle | `dist/trustlayer.iife.global.js` → `TrustLayerSDK` |

Server helpers (secret key or JWT): `generateKeys()`, `issueToken()`, `registerWebhook()`, `listWebhooks()`, `deleteWebhook()`.

---

## Local demo

The GPU webcam path lives in TrustLayerOS, not this package.

```powershell
# from TrustLayerOS
powershell -ExecutionPolicy Bypass -File ml\run_demo.ps1
```

Open [http://127.0.0.1:8001/demo](http://127.0.0.1:8001/demo).

To exercise the published client against a running API:

```bash
npm run build
# serve this repo (not file://), then open
# examples/verify-human.html
```

---

## Status

This is **v0.1** — the developer surface is real; the models behind it are not a finished research org.

| Surface | Status |
|---|---|
| `verifyHuman()` / `evaluate()` JSON | Shipping |
| Interview · deepfake · bot on evaluate | Shipping (heuristics + OSS ONNX on the OS) |
| React hook · Express / Next middleware · webhooks | Shipping |
| Fraud / anomaly helpers | Event helpers only — not trained classifiers |
| npm / PyPI `0.1.x` | Package is publish-ready |

We do not claim unique personhood (1 human ↔ 1 account), production-grade deepfake ROC, or that banks already run this at scale.

---

## Development

```bash
npm install
npm test
npm run build
```

```bash
cd python
pip install -e ".[dev]"
pytest -q
```

Node 18+ (Web Crypto). TypeScript is first-class. React is an optional peer (`>=18`).

---

## License

[MIT](./LICENSE) © TrustLayer
