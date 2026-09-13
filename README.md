# @trustlayer/sdk

The official JavaScript/TypeScript SDK for TrustLayer.

> TrustLayer is the API apps call to know if the other side is a real human — not a deepfake, bot, or synthetic identity — without forcing users to give up privacy.

**Built:** `TrustLayer.verifyHuman()` (JS + Python) → `human_probability` + `recommendation`. React `useVerifyHuman()`, Express / Next `requireHuman()`, webhook HMAC that matches OS (`timestamp + "." + body`). Browser IIFE in `dist/trustlayer.iife.global.js`.

**Partial:** browser camera liveness + frame/audio features (requires TrustLayerOS). Fraud / bot / anomaly helpers send events; they are not trained models.

**Publish:** package is `0.1.0`. Run `npm publish` / `twine upload` when you have registry tokens — this repo does not publish from CI.

---

## Laptop media demo

The live camera / mic detectors are served by TrustLayerOS, not this package.

```powershell
# in TrustLayerOS
powershell -ExecutionPolicy Bypass -File ml\run_demo.ps1
```

Open **http://127.0.0.1:8001/demo**. `examples/verify-human.html` is a shortcut to that page.

---

## Installation

```bash
npm install @trustlayer/sdk
# or
yarn add @trustlayer/sdk
# or
pnpm add @trustlayer/sdk
```

---

## Quick Start

```typescript
import TrustLayer from "@trustlayer/sdk"

const tl = TrustLayer.initialize({
  apiKey: "tl_public_your_key_here",
  apiUrl: "http://127.0.0.1:8080",
})

const result = await tl.verifyHuman({
  type: "interview",
  consent: true,
})

console.log(result.human_probability)
console.log(result.recommendation) // "allow" | "verify" | "review" | "block"
```

React:

```tsx
import { useVerifyHuman } from "@trustlayer/sdk/react"

const { verify, status, result } = useVerifyHuman({ apiKey, apiUrl })
await verify({ consent: true })
```

Protect a route (Express):

```ts
import { requireHuman } from "@trustlayer/sdk/middleware"

app.post("/payout", requireHuman({ apiKey: process.env.TRUSTLAYER_SECRET_KEY!, apiUrl }), (req, res) => {
  res.json({ ok: true, recommendation: req.trustlayer?.recommendation })
})
```

The client must send `X-TrustLayer-Session: sess_...` from a recent `verifyHuman()` / `createSession()` call.

---

## Session Lifecycle

```
TrustLayer.initialize({ apiKey })
         ↓
  createSession({ type })
         ↓
  startSignalCollection()     ← browser signals collected automatically
         ↓
  trackEvent(type, data)      ← your app sends relevant signals
         ↓
  evaluate()                  ← get trust + risk scores
         ↓
  session.complete()          ← final score, reputation updated
```

---

## Session Types

| Type | Use Case |
|---|---|
| `user_verification` | General user trust check |
| `interview` | Remote hiring, candidate integrity |
| `transaction` | Payment, financial risk evaluation |
| `authentication` | Login, account access |
| `agent` | AI agent verification |

---

## Shield Modules

### Fraud Shield

Detect account takeover, payment fraud, and synthetic identities.

```typescript
const session = await tl.createSession({
  type: "transaction",
  modules: ["fraud"],
})

const fraud = tl.fraud(session)
const result = await fraud.evaluate({
  transactionAmount: 2500,
  transactionCurrency: "USD",
})

console.log(result.fraudProbability) // 0.08
console.log(result.recommendation)   // "allow"
```

### Interview Shield

Protect hiring processes from AI assistance and identity fraud.

```typescript
const session = await tl.createSession({
  type: "interview",
  modules: ["interview", "deepfake"],
})

const shield = tl.interview(session)
shield.startMonitoring()

// During interview...
shield.reportWindowSwitch()
shield.reportExternalApplication("ChatGPT")

const result = await shield.getIntegrityScore()
console.log(result.integrityScore)          // 0–100
console.log(result.aiAssistanceProbability) // 0.0–1.0
console.log(result.recommendation)         // "pass" | "review" | "flag"

await session.complete()
```

### Bot Shield

Detect automated accounts and bots.

```typescript
const session = await tl.createSession({
  type: "user_verification",
  modules: ["bot_detection"],
})

session.startSignalCollection() // collects mouse, keyboard patterns

const bot = tl.bot(session)
const result = await bot.analyze()

console.log(result.isBot)           // false
console.log(result.botProbability)  // 0.03
console.log(result.humanProbability)// 0.97
```

### Deepfake Shield

Detect synthetic video and cloned audio.

```typescript
const deepfake = tl.deepfake(session)

// Analyze a video frame
const frameResult = await deepfake.analyzeVideoFrame(imageData)
console.log(frameResult.status)              // "likely_real"
console.log(frameResult.deepfakeProbability) // 0.04

// Analyze audio features
const audioResult = await deepfake.analyzeAudio(audioFeatureVector)
console.log(audioResult.syntheticProbability) // 0.02
```

### Anomaly Shield

Detect behavior that deviates from established patterns.

```typescript
const anomaly = tl.anomaly(session)
const result = await anomaly.detect()

console.log(result.anomalyScore) // 0–100
console.log(result.isAnomaly)    // false
console.log(result.deviations)   // ["unusual_login_time", ...]
```

---

## API Reference

### `TrustLayer.initialize(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | required | Your API key (`tl_public_xxx` or `tl_secret_xxx`) |
| `apiUrl` | `string` | `https://api.trustlayer.dev` | TrustLayerOS endpoint |
| `modules` | `TrustModule[]` | `[]` | Modules to enable globally |
| `debug` | `boolean` | `false` | Enable verbose logging |
| `timeout` | `number` | `5000` | Request timeout (ms) |
| `signalCollection` | `object` | all enabled | Control which signals are collected |

### `session.trackEvent(type, data?)`

Manually send a trust signal. Use this for signals your application has explicit knowledge of.

```typescript
await session.trackEvent("face_match_completed", {
  confidence: 0.94,
  verified: true,
})

await session.trackEvent("suspicious_activity", {
  reason: "multiple_failed_logins",
  count: 5,
})
```

### Available Event Types

| Event | Triggered When |
|---|---|
| `device_change` | User's device changes |
| `identity_verified` | Identity check passes |
| `face_match_completed` | Face comparison done |
| `voice_verified` | Voice match completed |
| `mouse_activity` | Mouse behavioral data |
| `typing_pattern` | Keyboard timing data |
| `window_switch` | User switches windows/tabs |
| `login_attempt` | Login succeeds or fails |
| `suspicious_activity` | Any suspicious signal |
| `deepfake_detected` | Deepfake indicator found |
| `ai_assistance_signal` | AI usage indicator |
| `browser_changed` | Browser fingerprint change |
| `custom` | Any custom signal |

---

## Webhook Verification

Verify incoming TrustLayerOS webhooks in your backend:

```typescript
import { verifyWebhookSignature } from "@trustlayer/sdk"

// In your webhook handler (Express example):
app.post("/webhook/trustlayer", async (req, res) => {
  const signature = req.headers["x-trustlayer-signature"]
  const timestamp = req.headers["x-trustlayer-timestamp"]
  const isValid = await verifyWebhookSignature(
    req.rawBody,
    String(signature ?? ""),
    process.env.WEBHOOK_SECRET!,
    String(timestamp ?? "")
  )

  if (!isValid) {
    return res.status(401).send("Invalid signature")
  }

  const event = req.body
  switch (event.type) {
    case "risk.detected":
      // Handle high risk...
      break
    case "session.completed":
      // Store final evaluation...
      break
  }

  res.json({ received: true })
})
```

---

## Platform Support

| Platform | Support |
|---|---|
| Browser (Chrome, Firefox, Safari, Edge) | ✅ Full |
| Node.js 18+ | ✅ Full (no DOM signals) |
| React / Next.js | ✅ |
| Vue / Nuxt | ✅ |
| TypeScript | ✅ Full types |

---

## License

MIT
