import { TrustSession } from "../session";
import {
  createMediaSampler,
  extractFrameFeatures,
  isBrowser,
  motionFromSequence,
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
  digits?: string;
  challengeId?: string;
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
  /** Prefer server-issued challenges (required for production authenticity). */
  useServerChallenges?: boolean;
}

interface ServerChallenge {
  challenge_id: string;
  action: string;
  digits?: string;
  nonce: string;
  expires_at: string;
}

/**
 * Runs a short challenge-response liveness loop and emits OS events.
 * Fetches server-issued challenges when available so the OS can bind proofs.
 */
export async function runLivenessChallenge(
  session: TrustSession,
  opts: RunLivenessOptions = {}
): Promise<LivenessResult> {
  const holdMs = opts.holdMs ?? 1800;
  const useServer = opts.useServerChallenges !== false;

  let serverChallenges: ServerChallenge[] = [];
  if (useServer) {
    try {
      const issued = await session.issueLivenessChallenge(
        opts.sequence?.length ?? 3
      );
      serverChallenges = issued.challenges ?? [];
    } catch {
      // Fall back to local sequence only when the OS challenge API is unavailable.
      serverChallenges = [];
    }
  }

  const sequence: LivenessChallenge[] =
    serverChallenges.length > 0
      ? serverChallenges.map((c) => c.action as LivenessChallenge)
      : opts.sequence ?? DEFAULT_SEQUENCE;

  await session.trackEvent("liveness_challenge_started", {
    challenges: sequence,
    server_issued: serverChallenges.length > 0,
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
      const server = serverChallenges[i];
      const digits = server?.digits;
      opts.onPrompt?.({
        challenge,
        instruction:
          challenge === "speak_digits" && digits
            ? `Speak these digits: ${digits}`
            : INSTRUCTIONS[challenge] ?? `Perform: ${challenge}`,
        index: i,
        total: sequence.length,
        digits,
        challengeId: server?.challenge_id,
      });

      const frames: FrameSample[] = [];
      const first = await sampler.sampleFrame();
      if (first) frames.push(first);
      const slices = 3;
      const step = Math.max(200, Math.floor(holdMs / slices));
      for (let s = 0; s < slices; s++) {
        await sleep(step);
        const next = await sampler.sampleFrame();
        if (next) frames.push(next);
      }
      const after = frames[frames.length - 1];
      if (!first || !after || frames.length < 2) {
        await session.trackEvent("liveness_challenge_failed", {
          challenge,
          challenge_id: server?.challenge_id,
          reason: "no_frame",
        });
        return {
          passed: false,
          challenges: sequence,
          failedChallenge: challenge,
          reason: "no_frame",
        };
      }

      const motion: MotionSummary = motionFromSequence(frames);
      const features = extractFrameFeatures(after, prev ?? first);
      prev = after;

      const ok = motionAgrees(challenge, motion);
      const payload: Record<string, unknown> = {
        challenge,
        motion,
        ml_features: features,
        passed_client: ok,
        image_b64: sampler.sampleJpeg() ?? undefined,
        consent: true,
      };
      if (server?.challenge_id) {
        payload.challenge_id = server.challenge_id;
      }
      if (digits) {
        (payload.motion as MotionSummary & { expected_digits?: string }).expected_digits =
          digits;
      }

      await session.trackEvent(
        ok ? "liveness_challenge_passed" : "liveness_challenge_failed",
        payload
      );

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
  const frames = motion.frame_count ?? 0;
  const path = motion.path_energy ?? 0;
  if (frames > 0 && frames < 3) return false;
  if (frames >= 3 && path < 0.004) return false;
  switch (challenge) {
    case "look_left":
      return motion.left_right_delta < -0.012;
    case "look_right":
      return motion.left_right_delta > 0.012;
    case "blink":
      return Math.abs(motion.blink_delta) > 0.006 || motion.temporal_energy > 0.015;
    case "speak_digits":
      return motion.temporal_energy > 0.012;
    default:
      return false;
  }
}
