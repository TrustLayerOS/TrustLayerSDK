/**
 * Node.js Server-Side Integration Example
 *
 * Shows how a backend service uses TrustLayer for:
 * - Server-side session creation on user login
 * - Evaluating trust before processing a request
 * - Verifying incoming webhooks from TrustLayerOS
 *
 * This is a standalone demo — not a full Express app.
 * Usage:
 *   npx ts-node examples/nodejs-server.ts
 */

import { TrustLayer, verifyWebhookSignature } from "../src";

// ─── Server-side TrustLayer client ───────────────────────────────────────────
// Use the SECRET key on the server — never expose it to the client.
const tl = TrustLayer.initialize({
  apiKey: process.env["TRUSTLAYER_SECRET_KEY"] ?? "tl_secret_example",
  apiUrl: process.env["TRUSTLAYER_API_URL"] ?? "http://localhost:8080",
  debug: true,
  signalCollection: {
    // Server-side: disable browser-specific collectors
    device:   false,
    behavior: false,
    network:  false,
    identity: false,
  },
});

// ─── Example: Evaluate user at login ─────────────────────────────────────────
async function evaluateUserLogin(userId: string, metadata: Record<string, unknown>) {
  console.log(`\nEvaluating login for user: ${userId}`);

  const session = await tl.createSession({
    type: "authentication",
    userId,
    modules: ["fraud", "bot_detection", "anomaly"],
    metadata,
  });

  // The client-side SDK would normally send signals.
  // From the server, we inject known signals directly via trackEvent.
  await session.trackEvent("login_attempt", {
    success: true,
    ip_address: metadata["ip_address"],
    user_agent: metadata["user_agent"],
  });

  if (metadata["new_device"]) {
    await session.trackEvent("device_change", {
      is_new: true,
      device_id: metadata["device_id"],
    });
  }

  const evaluation = await session.evaluate();

  console.log("\n─── Login Risk Evaluation ────────────────────────────────");
  console.log(`  Trust Score:    ${evaluation.trust_score.trust_score}`);
  console.log(`  Risk Score:     ${evaluation.risk_score.risk_score}`);
  console.log(`  Recommendation: ${evaluation.recommendation.toUpperCase()}`);
  if (evaluation.explanation.length > 0) {
    console.log("  Explanation:");
    evaluation.explanation.slice(0, 4).forEach((e) => console.log(`    • ${e}`));
  }
  console.log("──────────────────────────────────────────────────────────");

  await session.complete();

  // Return the recommendation so the server can act on it
  return evaluation.recommendation;
}

// ─── Example: Webhook handler ─────────────────────────────────────────────────
async function handleIncomingWebhook(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<void> {
  // Verify the webhook signature before processing
  const isValid = await verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);

  if (!isValid) {
    console.error("✗ Webhook signature verification failed — rejecting");
    return;
  }

  const payload = JSON.parse(rawBody) as {
    type: string;
    data: Record<string, unknown>;
  };

  console.log(`\nWebhook received: ${payload.type}`);

  switch (payload.type) {
    case "risk.detected":
      console.log(
        `  High risk detected! Score: ${payload.data["risk_score"]}`
      );
      // → Trigger MFA, lock session, alert team, etc.
      break;

    case "session.completed":
      console.log(
        `  Session completed. Trust: ${payload.data["trust_score"]}`
      );
      // → Store result, update user risk profile, etc.
      break;

    case "policy.action":
      console.log(`  Policy triggered action: ${payload.data["action"]}`);
      // → Execute the policy action in your system
      break;

    default:
      console.log(`  Unhandled webhook type: ${payload.type}`);
  }
}

// ─── Run examples ─────────────────────────────────────────────────────────────
async function main() {
  // Example 1: Normal login — trusted device, known user
  await evaluateUserLogin("user_alice_789", {
    ip_address: "192.168.1.100",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    new_device: false,
    device_id: "device_known_abc",
  });

  // Example 2: Suspicious login — new device, new location
  await evaluateUserLogin("user_bob_321", {
    ip_address: "185.220.101.47", // known Tor exit node pattern
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    new_device: true,
    device_id: "device_unknown_xyz",
    location_changed: true,
  });

  // Example 3: Webhook signature verification
  const webhookSecret = "my-webhook-secret";
  const payload = JSON.stringify({
    type: "risk.detected",
    data: { risk_score: 87, session_id: "sess_abc123", reason: "device_anomaly" },
  });

  // In a real app: the signature comes from the X-TrustLayer-Signature header
  // Here we simulate a correct signature using our signing utility
  const { signRequest } = await import("../src/crypto/signing");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = await signRequest(timestamp + "." + payload, webhookSecret);
  const header = `sha256=${sig}`;

  await handleIncomingWebhook(payload, header, webhookSecret);
}

main().catch(console.error);
