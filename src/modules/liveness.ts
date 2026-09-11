import { TrustSession } from "../session";
import {
  createMediaSampler,
  extractFrameFeatures,
  isBrowser,
  motionFromFrames,
  sleep,
  type FrameSample,
  type LivenessChallenge,
  type MotionSummary,
} from "../signals/media";

export type { LivenessChallenge };

export interface LivenessPrompt {
  challenge: LivenessChallenge;
  instruction: string;
  index: number;
  total: number;
}

export interface LivenessResult {
  passed: boolean;
  challenges: LivenessChallenge[];
  failedChallenge?: LivenessChallenge;
  reason?: string;
}

const INSTRUCTIONS: Record<LivenessChallenge, string> = {
  look_left: "Look to your left",
  look_right: "Look to your right",
  blink: "Blink twice",
  speak_digits: "Speak the digits shown",
};

const DEFAULT_SEQUENCE: LivenessChallenge[] = ["look_left", "look_right", "blink"];

export interface RunLivenessOptions {
  sequence?: LivenessChallenge[];
  holdMs?: number;
  onPrompt?: (prompt: LivenessPrompt) => void;
}

/**
 * Runs a short challenge-response liveness loop and emits OS events.
 */
export async function runLivenessChallenge(
  session: TrustSession,
  opts: RunLivenessOptions = {}
): Promise<LivenessResult> {
  const sequence = opts.sequence ?? DEFAULT_SEQUENCE;
  const holdMs = opts.holdMs ?? 1800;

  await session.trackEvent("liveness_challenge_started", {
    challenges: sequence,
  });

  if (!isBrowser()) {
    await session.trackEvent("liveness_challenge_failed", {
      reason: "not_browser",
    });
    return { passed: false, challenges: sequence, reason: "not_browser" };
  }

  let sampler;
  try {
    sampler = await createMediaSampler();
    await sampler.start({ video: true, audio: false });
  } catch (err) {
    await session.trackEvent("liveness_challenge_failed", {
      reason: "no_camera",
      error: err instanceof Error ? err.message : String(err),
    });
    return { passed: false, challenges: sequence, reason: "no_camera" };
  }

  try {
    let prev: FrameSample | null = null;
    for (let i = 0; i < sequence.length; i++) {
      const challenge = sequence[i];
      opts.onPrompt?.({
        challenge,
        instruction: INSTRUCTIONS[challenge],
        index: i,
        total: sequence.length,
      });

      const before = await sampler.sampleFrame();
      await sleep(holdMs);
      const after = await sampler.sampleFrame();
      if (!before || !after) {
        await session.trackEvent("liveness_challenge_failed", {
          challenge,
          reason: "no_frame",
        });
        return {
          passed: false,
          challenges: sequence,
          failedChallenge: challenge,
          reason: "no_frame",
        };
      }

      const motion: MotionSummary = motionFromFrames(before, after);
      const features = extractFrameFeatures(after, prev ?? before);
      prev = after;

      const ok = motionAgrees(challenge, motion);
      await session.trackEvent(ok ? "liveness_challenge_passed" : "liveness_challenge_failed", {
        challenge,
        motion,
        ml_features: features,
        passed_client: ok,
      });

      if (!ok) {
        return {
          passed: false,
          challenges: sequence,
          failedChallenge: challenge,
          reason: "motion_mismatch",
        };
      }
    }
    return { passed: true, challenges: sequence };
  } finally {
    sampler.stop();
  }
}

function motionAgrees(challenge: LivenessChallenge, motion: MotionSummary): boolean {
  switch (challenge) {
    case "look_left":
      return motion.left_right_delta < -0.008;
    case "look_right":
      return motion.left_right_delta > 0.008;
    case "blink":
      return Math.abs(motion.blink_delta) > 0.004 || motion.temporal_energy > 0.01;
    case "speak_digits":
      return motion.temporal_energy > 0.008;
    default:
      return motion.temporal_energy > 0.005;
  }
}
