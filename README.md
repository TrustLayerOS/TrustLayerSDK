# TrustLayer SDK

**The client you call before you trust the other side.**

TrustLayer SDK captures session signals (behavior, device, network, camera, microphone), sends them to **TrustLayerOS**, and returns a decision your product can enforce: **allow · monitor · verify · review · block**.

It proves whether *this* session looks like a live human — not a deepfake, replay, or empty bot — without turning your app into a KYC vendor or a CAPTCHA.

```ts
import TrustLayer from "@trustlayer/sdk"

const tl = TrustLayer.initialize({
  apiKey: process.env.TRUSTLAYER_PUBLIC_KEY!,
  apiUrl: "http://127.0.0.1:8080",
})

const result = await tl.verifyHuman({ type: "interview", consent: true })

result.recommendation     // "allow" | "verify" | "review" | "block" | …
result.human_probability  // 0–1
result.deepfake_risk      // 0–1
```

```
Your app  →  TrustLayer SDK  →  TrustLayerOS (/v1/sessions · /v1/events · /v1/evaluate)
                                      →  allow / verify / block
```

| | |
|---|---|
| **npm** | `@trustlayer/sdk` `0.1.0` |
| **PyPI** | `trustlayer` `0.1.0` |
| **Node** | ≥ 18 |
| **Python** | ≥ 3.9 |
| **License** | MIT |
| **Surfaces** | TypeScript / ESM+CJS · React · Express/Next middleware · Browser IIFE · Python |

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [Install](#install)
3. [Initialize](#initialize)
4. [Quick starts](#quick-starts)
5. [Session lifecycle](#session-lifecycle)
6. [Modules & threats](#modules--threats)
7. [Signal collection](#signal-collection)
8. [Evaluation response](#evaluation-response)
9. [React](#react)
10. [Server middleware](#server-middleware)
11. [Meetings & continuous watch](#meetings--continuous-watch)
12. [Python](#python)
13. [Webhooks](#webhooks)
14. [Configuration reference](#configuration-reference)
15. [Package exports](#package-exports)
16. [Privacy](#privacy)
17. [Examples](#examples)
18. [Talks to TrustLayerOS](#talks-to-trustlayeros)
19. [Status & honesty](#status--honesty)

---

## Why this exists

| Existing tool | What it proves | Gap |
|---|---|---|
| CAPTCHA / Turnstile | Cheap bots at the edge | Not live video authenticity |
| Persona / Onfido | Document identity once | Not continuous during the call |
| Worldcoin-style PoP | Unique personhood | Different category — not session risk |

TrustLayer is the **session authenticity** layer: capture signals → score → decide. Use it for interviews, onboarding calls, high-risk transactions, and agent interactions.

---

## Install

```bash
npm install @trustlayer/sdk
```

```bash
pip install trustlayer
```

| Key type | Prefix | Where |
|---|---|---|
| Public | `tl_public_…` | Browser / mobile client |
| Secret | `tl_secret_…` | Server only |

Create keys in the TrustLayerOS dashboard or via `POST /v1/auth/keys`.

---

## Initialize

```ts
import TrustLayer from "@trustlayer/sdk"

const tl = TrustLayer.initialize({
  apiKey: process.env.TRUSTLAYER_PUBLIC_KEY!, // required
  apiUrl: "http://127.0.0.1:8080",           // your TrustLayerOS base URL
  timeout: 20_000,                           // optional, ms
  debug: false,
  // Optional defaults applied to new sessions:
  modules: ["interview", "deepfake", "bot"],
  signalCollection: {
    device: true,
    behavior: true,
    network: true,
    identity: true,
  },
})
```

Default cloud `apiUrl` is `https://api.trustlayer.dev`. For local OS: `http://127.0.0.1:8080`.

---

## Quick starts

### One-shot human check (browser)

```ts
const result = await tl.verifyHuman({
  type: "interview",
  consent: true, // required before camera / mic
})

if (result.recommendation === "allow") {
  // continue
} else if (result.recommendation === "block") {
  // stop the flow
} else {
  // verify | review | monitor → step-up UX
}
```

`verifyHuman()` creates a session, starts collectors, runs a liveness challenge (browser), posts feature events, and calls `POST /v1/evaluate`.

### Threat-oriented API

```ts
await tl.check({ threats: ["human"], consent: true })
await tl.check({ threats: ["voice"], source: audioEl, consent: true })
await tl.check({ threats: ["bot"] })
await tl.check({ threats: ["fraud", "anomaly"] })
```

### Server-side (no webcam)

```ts
const tl = TrustLayer.initialize({
  apiKey: process.env.TRUSTLAYER_SECRET_KEY!,
  apiUrl: process.env.TRUSTLAYER_API_URL!,
  signalCollection: {
    device: false,
    behavior: false,
    network: false,
    identity: false,
  },
})

const session = await tl.createSession({ type: "authentication", userId: "usr_123" })
await session.trackEvent("login_attempt", { success: false })
const result = await session.evaluate(["fraud", "bot"])
await session.complete()
```

---

## Session lifecycle

```
createSession  →  startSignalCollection / trackEvent  →  evaluate  →  complete
                      ↑                                         │
                      └──────── flush batched events ───────────┘
```

| Step | SDK | OS API |
|---|---|---|
| Create | `tl.createSession({ type, userId?, modules? })` | `POST /v1/sessions` |
| Emit | `session.trackEvent(type, data?)` | `POST /v1/events` · `/events/batch` |
| Liveness | `session.issueLivenessChallenge()` | `POST /v1/sessions/:id/liveness/challenge` |
| Decide | `session.evaluate(modules?)` · `tl.verifyHuman()` | `POST /v1/evaluate` |
| Finish | `session.complete()` | `POST /v1/sessions/:id/complete` |

**Session types:** `user_verification` · `interview` · `transaction` · `authentication` · `agent`

Events are **batched** (flush every ~2s or when the queue ≥ 10). Evaluate and complete flush first. There is no WebSocket evaluate stream; use `attachToCall` for polling during a live call.

---

## Modules & threats

Modules map to TrustLayerOS shield runners:

| Module ID | Intent |
|---|---|
| `interview` | Window-switch / AI-assist integrity |
| `deepfake` | Face, liveness, voice-clone risk |
| `bot` / `bot_detection` | Automation / empty session |
| `fraud` | Device / login / network fraud cues |
| `anomaly` | Session deviations |
| `spam` | Spammy patterns |
| `agent` | Agent behavior risk |

### `check({ threats })` mapping (summary)

| Threat | Modules (approx.) |
|---|---|
| `human` | interview, deepfake, bot |
| `voice` / `video` / `deepfake` | deepfake, bot |
| `bot` | bot |
| `fraud` | fraud, anomaly |
| `anomaly` | anomaly |
| `spam` | spam |
| `agent` | agent, bot |
| `ai` | interview, spam, bot |

### Shield helpers

```ts
const session = await tl.createSession({ type: "interview" })

await tl.interview(session).startMonitoring()
await tl.interview(session).reportWindowSwitch({ app: "ChatGPT" })
const integrity = await tl.interview(session).getIntegrityScore()

await tl.fraud(session).evaluate({ transactionAmount: 1200 })
await tl.bot(session).evaluate()
await tl.deepfake(session).evaluate()
await tl.anomaly(session).evaluate()
```

---

## Signal collection

Enabled via `signalCollection` (all default **on** in the browser):

| Collector | Signals / events |
|---|---|
| **device** | UA, platform, screen, canvas/WebGL cues → `device_change` |
| **behavior** | Mouse, typing cadence, clicks, visibility → `mouse_activity`, `typing_pattern`, `window_switch` |
| **network** | Connection API + locale cues → `custom` (`signal_type: network`) |
| **identity** | Tab consistency / referrer / origin → `custom` (`signal_type: identity`) |
| **media** | Short frame/audio windows + forensic features → `face_frame`, `voice_liveness`, `voice_clone_risk` |

### Liveness challenges

Challenge types: `look_left` · `look_right` · `blink` · `speak_digits`.

Prefer server-issued challenges (`issueLivenessChallenge`); the SDK falls back to a local default set. Events: `liveness_challenge_started` / `_passed` / `_failed`.

---

## Evaluation response

Act on `recommendation`. Treat probabilities as calibrated **session** scores, not personhood.

```ts
interface EvaluationResponse {
  session_id: string
  human_probability: number
  deepfake_risk: number
  integrity_score: number
  recommendation: "allow" | "monitor" | "verify" | "review" | "block"
  reasons: string[]
  confidence: number
  trust_score: { /* … */ }
  risk_score: { /* … */ }
  modules?: { interview?, deepfake?, bot?, fraud?, anomaly?, … }
  field_provenance?: { field: string; source: string; note: string }[]
}
```

| Recommendation | Typical product action |
|---|---|
| `allow` | Continue |
| `monitor` | Continue + alert |
| `verify` | Step-up (extra liveness / manual) |
| `review` | Queue for human review |
| `block` | Stop the interaction |

---

## React

```bash
npm install @trustlayer/sdk
# peer: react >= 18 (optional peerDependency)
```

```tsx
import { useVerifyHuman } from "@trustlayer/sdk/react"

export function Gate() {
  const { verify, status, result, error, reset } = useVerifyHuman({
    apiKey: process.env.NEXT_PUBLIC_TRUSTLAYER_KEY!,
    apiUrl: process.env.NEXT_PUBLIC_TRUSTLAYER_URL,
  })

  return (
    <button
      disabled={status === "running"}
      onClick={() => verify({ type: "interview", consent: true })}
    >
      {status === "running" ? "Checking…" : "Verify human"}
    </button>
  )
}
```

`status`: `idle` | `running` | `done` | `error`.

---

## Server middleware

Protect routes that require a recent successful evaluate.

```ts
import { requireHuman, SESSION_HEADER } from "@trustlayer/sdk/middleware"
// Client must send header: X-TrustLayer-Session: sess_…

app.post(
  "/start-interview",
  requireHuman({
    apiKey: process.env.TRUSTLAYER_SECRET_KEY!,
    apiUrl: process.env.TRUSTLAYER_API_URL,
  }),
  handler,
)
```

Next.js App Router:

```ts
import { nextRequireHuman } from "@trustlayer/sdk/middleware"

export async function POST(request: Request) {
  const gate = await nextRequireHuman(request, {
    apiKey: process.env.TRUSTLAYER_SECRET_KEY!,
  })
  if (gate instanceof Response) return gate
  // gate.sessionId, gate.evaluation
}
```

`assertRecentAllow` re-evaluates and requires `recommendation === "allow"`, `human_probability ≥ 0.55`, `deepfake_risk ≤ 0.45`, and session age within a configurable window (default **5 minutes**).

---

## Meetings & continuous watch

For calls where you own a `MediaStream` or media element:

```ts
import { attachToCall, enforceCallDecision } from "@trustlayer/sdk"

const session = await tl.createSession({ type: "interview" })
const watch = attachToCall({
  session,
  source: localVideo.srcObject as MediaStream,
  consent: true,
  intervalMs: 2500,
  onDecision: (result) => {
    if (enforceCallDecision(result).shouldRemove) {
      // remove participant / end call
    }
  },
})

// later
watch.stop()
```

Meet/Zoom tile pixels are **not** readable unless your app owns the stream (use a sidecar or meeting bot that captures an authorized stream).

---

## Python

```python
from trustlayer import TrustLayer

with TrustLayer(
    api_key="tl_secret_…",
    api_url="http://127.0.0.1:8080",
) as tl:
    session = tl.create_session(type="authentication", user_id="usr_123")
    session.track_event("login_attempt", {"success": False})
    result = session.evaluate(modules=["fraud", "bot"])
    print(result.recommendation, result.human_probability)
    session.complete()
```

Python does not open a webcam; pass `image_b64` / PCM / precomputed features into `verify_human` when scoring media. See `python/README.md` and `python/examples/`.

---

## Webhooks

```ts
import {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "@trustlayer/sdk"

const ok = verifyWebhookSignature({
  secret: process.env.TRUSTLAYER_WEBHOOK_SECRET!,
  rawBody,
  signatureHeader: req.header(WEBHOOK_SIGNATURE_HEADER)!,
  timestampHeader: req.header(WEBHOOK_TIMESTAMP_HEADER)!,
  maxAgeSeconds: 300,
})
```

Scheme: `HMAC-SHA256(secret, timestamp + "." + rawBody)` → header `X-TrustLayer-Signature: sha256=<hex>`.

Register endpoints with `tl.registerWebhook({ url, events })` (secret key).

---

## Configuration reference

| Option | Type | Default | Notes |
|---|---|---|---|
| `apiKey` | string | — | **Required** |
| `apiUrl` | string | `https://api.trustlayer.dev` | TrustLayerOS base URL |
| `timeout` | number | `20000` | Request timeout (ms) |
| `debug` | boolean | `false` | Verbose logs |
| `modules` | `TrustModule[]` | — | Default modules for new sessions |
| `signalCollection.device` | boolean | `true` | |
| `signalCollection.behavior` | boolean | `true` | |
| `signalCollection.network` | boolean | `true` | |
| `signalCollection.identity` | boolean | `true` | |

Headers sent automatically: `Authorization: Bearer …`, `X-TrustLayer-SDK: js/0.1.0`, `X-TrustLayer-Nonce`, and `X-TrustLayer-Biometric: 1` on biometric posts.

---

## Package exports

| Import path | Contents |
|---|---|
| `@trustlayer/sdk` | `TrustLayer`, sessions, shields, collectors, webhooks, crypto helpers |
| `@trustlayer/sdk/react` | `useVerifyHuman` |
| `@trustlayer/sdk/middleware` | `requireHuman`, `nextRequireHuman`, `assertRecentAllow`, `SESSION_HEADER` |

Browser IIFE build: `dist/trustlayer.iife.global.js` → global `TrustLayerSDK.TrustLayer.initialize(...)`.

Build: `tsup` → ESM + CJS + TypeScript declarations.

---

## Privacy

- **Consent:** media paths require `consent: true` or a successful `onConsent()`; otherwise the SDK prompts or throws `consent_required`.
- **Data minimization:** prefer forensic **features** and short sampled windows over continuous raw recording.
- **Server control:** TrustLayerOS can strip `image_b64` / `audio_b64` after scoring and enforce retention / DSAR.
- **Keys:** never ship `tl_secret_…` to the browser.

Product line shared with OS: *features and scores by default; raw media only with consent and retention limits.*

---

## Examples

| Path | Focus |
|---|---|
| `examples/verify-human.html` | Browser one-shot |
| `examples/browser-basic.html` | Minimal browser |
| `examples/four-scene.html` | Multi-scene demo UX |
| `examples/meeting-sidecar.html` | Call attach pattern |
| `examples/interview-shield.ts` | Interview monitoring |
| `examples/fraud-prevention.ts` | Transaction session |
| `examples/nodejs-server.ts` | Secret key + webhooks |
| `python/examples/` | Python clients |

```bash
npm run build
# open examples/*.html against a running TrustLayerOS
```

---

## Talks to TrustLayerOS

This package is a thin, typed client over TrustLayerOS REST:

| SDK method | HTTP |
|---|---|
| `createSession` | `POST /v1/sessions` |
| `trackEvent` / batch | `POST /v1/events` · `/events/batch` |
| `issueLivenessChallenge` | `POST /v1/sessions/:id/liveness/challenge` |
| `getTrustScore` / `getRiskScore` | `GET /v1/trust/:id` · `/risk/:id` |
| `evaluate` / `verifyHuman` | `POST /v1/evaluate` |
| keys / webhooks | `/v1/auth/*` · `/v1/webhooks` |

Run the backend locally: see the **TrustLayerOS** README (`docker compose up --build`).  
GPU webcam demo (OS, not this package): `ml/run_demo.ps1` → http://127.0.0.1:8001/demo

---

## Status & honesty

| | |
|---|---|
| **SDK surface** | Real — sessions, events, evaluate, React, middleware |
| **Scores** | Produced by TrustLayerOS (OSS ONNX media + calibrated tabular / heuristics) |
| **v0.1** | Pilot integrations — do not claim personhood ROC or bank-scale production from the client alone |

**Claim:** client SDK for continuous session authenticity.  
**Do not claim:** unique personhood, KYC replacement, or CAPTCHA replacement.

---

## License

MIT — see `LICENSE`.
