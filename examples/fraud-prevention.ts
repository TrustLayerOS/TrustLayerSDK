/**
 * Fraud Prevention Example
 *
 * Shows how a fintech/e-commerce platform evaluates transaction risk
 * using TrustLayer's Fraud Shield from a Node.js backend.
 *
 * Usage:
 *   npx ts-node examples/fraud-prevention.ts
 */

import { TrustLayer } from "../src";

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  deviceId?: string;
  ipAddress?: string;
  isNewDevice?: boolean;
  locationChanged?: boolean;
}

async function evaluateTransaction(tx: Transaction): Promise<void> {
  const tl = TrustLayer.initialize({
    apiKey: process.env["TRUSTLAYER_SECRET_KEY"] ?? "tl_secret_example",
    apiUrl: process.env["TRUSTLAYER_API_URL"] ?? "http://localhost:8080",
    debug: false,
  });

  console.log(`\nEvaluating transaction ${tx.id}...`);
  console.log(`  User:    ${tx.userId}`);
  console.log(`  Amount:  ${tx.currency} ${tx.amount.toLocaleString()}`);

  // ── 1. Create a transaction session ───────────────────────────────────────
  const session = await tl.createSession({
    type: "transaction",
    userId: tx.userId,
    modules: ["fraud", "anomaly"],
    metadata: { transaction_id: tx.id },
  });

  // ── 2. Send contextual signals ────────────────────────────────────────────
  if (tx.isNewDevice) {
    await session.trackEvent("device_change", {
      device_id: tx.deviceId,
      is_new: true,
    });
  }

  if (tx.locationChanged) {
    await session.trackEvent("suspicious_activity", {
      reason: "location_change",
      vpn_detected: true,
    });
  }

  if (tx.amount > 5000) {
    await session.trackEvent("custom", {
      signal_type: "transaction",
      amount: tx.amount,
      currency: tx.currency,
      high_value: true,
    });
  }

  // ── 3. Evaluate fraud risk ─────────────────────────────────────────────────
  const fraudShield = tl.fraud(session);
  const result = await fraudShield.evaluate({
    transactionAmount: tx.amount,
    transactionCurrency: tx.currency,
    userId: tx.userId,
    transactionId: tx.id,
  });

  // ── 4. Make decision ───────────────────────────────────────────────────────
  console.log("\n─── Fraud Assessment ─────────────────────────────────────");
  console.log(`  Fraud Probability: ${(result.fraudProbability * 100).toFixed(1)}%`);
  console.log(`  Risk Score:        ${result.riskScore}/100`);
  console.log(`  Recommendation:    ${result.recommendation.toUpperCase()}`);

  if (result.factors.length > 0) {
    console.log(`  Risk Factors:`);
    result.factors.forEach((f) => console.log(`    • ${f}`));
  }

  // Application-level decision
  switch (result.recommendation) {
    case "allow":
      console.log("\n  ✓ TRANSACTION APPROVED");
      break;
    case "review":
      console.log("\n  ⚠ TRANSACTION FLAGGED FOR REVIEW — Require step-up auth");
      break;
    case "block":
      console.log("\n  ✗ TRANSACTION BLOCKED");
      break;
  }
  console.log("──────────────────────────────────────────────────────────");

  // ── 5. Complete session ────────────────────────────────────────────────────
  await session.complete();
}

// ── Example transactions ───────────────────────────────────────────────────────

async function main() {
  // Low-risk transaction
  await evaluateTransaction({
    id: "txn_001",
    userId: "user_established_123",
    amount: 49.99,
    currency: "USD",
    isNewDevice: false,
    locationChanged: false,
  });

  // High-risk transaction
  await evaluateTransaction({
    id: "txn_002",
    userId: "user_new_456",
    amount: 8500,
    currency: "USD",
    deviceId: "new-device-xyz",
    isNewDevice: true,
    locationChanged: true,
  });
}

main().catch(console.error);
