/**
 * Dossiers Onboard-shaped golden path
 *
 * Simulates: IDV already passed → video check → TrustLayer scores → Onboard risk bucket.
 * Prefer session.complete() so session.completed webhooks fire.
 *
 *   TRUSTLAYER_PUBLIC_KEY=tl_public_… \
 *   TRUSTLAYER_API_URL=http://localhost:8080 \
 *   npx ts-node examples/dossiers-onboard.ts
 *
 * Optional: TRUSTLAYER_IMAGE_B64 / TRUSTLAYER_AUDIO_PCM_JSON for real media.
 *
 * Note: omit userId (or grant stored biometric consent) — when a subject id is set,
 * TrustLayerOS requires a consent ledger grant, not only event.consent=true.
 */

import { TrustLayer } from "../src";
import type { EvaluationResponse } from "../src/api/types";

type OnboardRisk = "low" | "medium" | "high";

function mapToOnboardRisk(result: EvaluationResponse): OnboardRisk {
  switch (result.recommendation) {
    case "allow":
    case "monitor":
      return "low";
    case "verify":
    case "review":
      return "medium";
    case "restrict":
    case "block":
      return "high";
    default:
      return "medium";
  }
}

function assertDemoQuality(result: EvaluationResponse): void {
  const impl = result.modules?.deepfake?.implementation;
  if (impl === "heuristic_fallback") {
    throw new Error(
      "deepfake implementation=heuristic_fallback — ML did not score media; fix staging before partner demos"
    );
  }
  const bad = (result.field_provenance ?? []).find(
    (p) =>
      (p.field === "deepfake_risk" || p.field === "modules.deepfake") &&
      p.source === "heuristic_fallback"
  );
  if (bad) {
    throw new Error(`field_provenance marks deepfake as heuristic_fallback: ${bad.note}`);
  }
}

async function main() {
  const tl = TrustLayer.initialize({
    apiKey: process.env["TRUSTLAYER_PUBLIC_KEY"] ?? "tl_public_demodemo12DEADBEEF00000001",
    apiUrl: process.env["TRUSTLAYER_API_URL"] ?? "http://localhost:8080",
    debug: true,
    modules: ["deepfake", "interview", "bot"],
  });

  // No userId: attested consent:true on events is enough for dashboard/demo scenes.
  // Production Onboard subjects should grant biometric consent via /v1/compliance/consent first.
  const session = await tl.createSession({
    type: "user_verification",
    modules: ["deepfake", "interview", "bot"],
    metadata: {
      partner: "dossiers",
      product: "onboard",
      idv_passed: true,
      idv_provider: "dossiers",
      scene: "video_check",
    },
  });

  console.log(`session ${session.id}`);

  const issued = await session.issueLivenessChallenge(3);
  const challenge = issued.challenges?.[0];
  if (!challenge?.challenge_id) {
    throw new Error("liveness challenge API returned no challenge_id — refuse soft fallback");
  }

  const imageB64 = process.env["TRUSTLAYER_IMAGE_B64"];
  await session.trackEvent("face_frame", {
    consent: true,
    ...(imageB64 ? { image_b64: imageB64 } : { ml_features: demoFrameFeatures(0.12) }),
  });

  await session.trackEvent("liveness_challenge_passed", {
    consent: true,
    challenge_id: challenge.challenge_id,
    challenge: challenge.action,
    passed_client: true,
    ...(imageB64 ? { image_b64: imageB64 } : {}),
  });

  const pcmEnv = process.env["TRUSTLAYER_AUDIO_PCM_JSON"];
  const pcm = pcmEnv ? (JSON.parse(pcmEnv) as number[]) : tonePCM(16000, 0.25);
  await session.trackEvent("voice_liveness", {
    consent: true,
    audio_pcm: pcm,
    sample_rate: 16000,
    audio_energy: 0.12,
  });

  await session.flushEvents();

  // complete = evaluate + session.completed webhook
  const result = await session.complete();
  assertDemoQuality(result);

  const onboardRisk = mapToOnboardRisk(result);

  console.log("\n─── Dossiers Onboard video check ─────────────────────────");
  console.log(`  recommendation:     ${result.recommendation}`);
  console.log(`  onboard_risk:       ${onboardRisk}`);
  console.log(`  human_probability:  ${result.human_probability}`);
  console.log(`  deepfake_risk:      ${result.deepfake_risk}`);
  console.log(`  deepfake.impl:      ${result.modules?.deepfake?.implementation ?? "n/a"}`);
  console.log(`  voice_clone_risk:   ${result.modules?.deepfake?.voice_clone_risk ?? "n/a"}`);
  console.log(`  liveness_passed:    ${result.modules?.deepfake?.liveness_passed ?? "n/a"}`);
  console.log(`  reasons:            ${(result.reasons ?? []).slice(0, 4).join("; ") || "(none)"}`);
  console.log("──────────────────────────────────────────────────────────\n");

  console.log(
    JSON.stringify(
      {
        idv_passed: true,
        trustlayer_session_id: result.session_id,
        recommendation: result.recommendation,
        onboard_risk: onboardRisk,
        deepfake_risk: result.deepfake_risk,
        human_probability: result.human_probability,
        implementation: result.modules?.deepfake?.implementation,
      },
      null,
      2
    )
  );
}

function tonePCM(sampleRate: number, seconds: number): number[] {
  const n = Math.floor(sampleRate * seconds);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.2;
  }
  return out;
}

function demoFrameFeatures(motion: number): number[] {
  const xs = new Array<number>(32).fill(0.15);
  xs[26] = motion;
  return xs;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
