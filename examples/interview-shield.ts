/**
 * Interview Shield Example
 *
 * Shows how a hiring platform would integrate TrustLayer to detect:
 * - AI assistance during an interview
 * - Identity inconsistency
 * - Behavioral anomalies (window switching, suspicious apps)
 *
 * Usage:
 *   npx ts-node examples/interview-shield.ts
 */

import { TrustLayer } from "../src";

async function runInterviewSession() {
  // ── 1. Initialize SDK ──────────────────────────────────────────────────────
  const tl = TrustLayer.initialize({
    apiKey: process.env["TRUSTLAYER_API_KEY"] ?? "tl_public_example",
    apiUrl: process.env["TRUSTLAYER_API_URL"] ?? "http://localhost:8080",
    debug: true,
  });

  // ── 2. Create interview session ────────────────────────────────────────────
  console.log("Creating interview session...");
  const session = await tl.createSession({
    type: "interview",
    userId: "candidate_12345",
    modules: ["interview", "deepfake", "anomaly"],
    metadata: {
      position: "Senior Software Engineer",
      company: "Acme Corp",
      interview_round: 2,
    },
  });

  console.log(`Session created: ${session.sessionId}`);

  // ── 3. Start monitoring ────────────────────────────────────────────────────
  const shield = tl.interview(session);
  shield.startMonitoring();
  console.log("Interview monitoring started...");

  // ── 4. Simulate interview events ───────────────────────────────────────────

  // Identity verification completed
  await session.trackEvent("face_match_completed", {
    confidence: 0.94,
    verified: true,
  });
  console.log("✓ Face match completed (94% confidence)");

  await session.trackEvent("voice_verified", {
    confidence: 0.91,
    verified: true,
  });
  console.log("✓ Voice verified (91% confidence)");

  // Simulate normal typing during interview
  await session.trackEvent("typing_pattern", {
    keystrokes: 312,
    avg_typing_speed: 3.2,
    cadence_variance: 0.42,
    automated: false,
  });

  // Simulate a window switch (candidate opened another app)
  shield.reportWindowSwitch();
  console.log("⚠ Window switch detected");

  await new Promise((r) => setTimeout(r, 500));

  // Simulate suspicious AI assistance signal
  await session.trackEvent("ai_assistance_signal", {
    probability: 0.72,
    indicator: "response_generation_pattern",
  });
  console.log("⚠ AI assistance signal detected (72% probability)");

  shield.reportExternalApplication("ChatGPT Desktop");
  console.log("⚠ External application reported: ChatGPT Desktop");

  // ── 5. Get integrity score ─────────────────────────────────────────────────
  console.log("\nCalculating interview integrity score...");
  const result = await shield.getIntegrityScore();

  console.log("\n─── Interview Integrity Report ───────────────────────────");
  console.log(`Integrity Score:      ${result.integrityScore}/100`);
  console.log(`AI Assistance Prob:   ${(result.aiAssistanceProbability * 100).toFixed(1)}%`);
  console.log(`Identity Consistency: ${result.identityConsistency.toFixed(0)}/100`);
  console.log(`Recommendation:       ${result.recommendation.toUpperCase()}`);
  if (result.riskFactors.length > 0) {
    console.log("\nRisk Factors:");
    result.riskFactors.forEach((f) => console.log(`  • ${f}`));
  }
  console.log("──────────────────────────────────────────────────────────");

  // ── 6. Complete session ────────────────────────────────────────────────────
  shield.stopMonitoring();
  const final = await session.complete();

  console.log(`\nFinal Evaluation:`);
  console.log(`  Trust Score:    ${final.trust_score.trust_score}`);
  console.log(`  Risk Score:     ${final.risk_score.risk_score}`);
  console.log(`  Recommendation: ${final.recommendation}`);
}

runInterviewSession().catch(console.error);
