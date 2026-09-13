import type { EvaluationResponse } from "../api/types";
import type { TrustSession } from "../session";
import {
  createMediaSamplerFrom,
  extractFrameFeatures,
  isBrowser,
  type FrameSample,
  type MediaSource,
} from "../signals/media";
import { assertMediaConsent } from "../privacy";

export type CallPlatform =
  | "generic"
  | "webrtc"
  | "google-meet"
  | "zoom"
  | "teams"
  | "livekit"
  | "daily"
  | "twilio";

/**
 * Meet / Zoom / Teams do not expose remote tiles to third-party JS.
 * Attach the MediaStream you already have from a Video SDK or WebRTC app.
 */
export interface AttachCallOptions {
  session: TrustSession;
  source: MediaSource;
  participantId?: string;
  platform?: CallPlatform;
  consent: boolean;
  video?: boolean;
  audio?: boolean;
  /** How often to sample + evaluate. Default 2500ms. */
  intervalMs?: number;
  /** Mute / blur the source when recommendation is block. */
  autoRemove?: boolean;
  onDecision?: (result: EvaluationResponse) => void;
}

export interface CallWatchHandle {
  stop: () => void;
  lastResult: () => EvaluationResponse | null;
}

export function shouldRemoveParticipant(
  recommendation: EvaluationResponse["recommendation"]
): boolean {
  return recommendation === "block";
}

/**
 * Host-side enforcement on a stream or media element you control.
 * Google Meet cannot be kicked from this SDK — only your own room / SDK can.
 */
export function enforceCallDecision(
  source: MediaSource,
  recommendation: EvaluationResponse["recommendation"]
): "kept" | "removed" {
  if (!shouldRemoveParticipant(recommendation)) return "kept";

  if (typeof MediaStream !== "undefined" && source instanceof MediaStream) {
    for (const track of source.getTracks()) {
      track.enabled = false;
    }
    return "removed";
  }

  if (isBrowser() && "pause" in source) {
    const el = source as HTMLMediaElement;
    el.pause();
    if (typeof MediaStream !== "undefined" && el.srcObject instanceof MediaStream) {
      for (const track of el.srcObject.getTracks()) {
        track.enabled = false;
      }
    }
    el.dataset.trustlayerRemoved = "1";
    el.style.filter = "grayscale(1) blur(16px)";
    el.style.pointerEvents = "none";
  }
  return "removed";
}

/**
 * Continuously sample a live call tile or recording and re-evaluate.
 * Use this from Zoom Video SDK, Daily, LiveKit, or the Meet sidecar demo.
 */
export async function attachToCall(
  options: AttachCallOptions
): Promise<CallWatchHandle> {
  assertMediaConsent(options.consent);
  if (!isBrowser()) {
    throw new Error("attach_to_call requires a browser");
  }

  const video = options.video !== false;
  const audio = options.audio !== false;
  const intervalMs = options.intervalMs ?? 2500;

  const sampler = await createMediaSamplerFrom(options.source);
  await sampler.start({ video, audio });

  let stopped = false;
  let last: EvaluationResponse | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prev: FrameSample | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      if (video) {
        const frame = await sampler.sampleFrame();
        if (frame) {
          const features = extractFrameFeatures(frame, prev);
          const jpeg = sampler.sampleJpeg();
          await options.session.trackEvent("face_frame", {
            ml_features: features,
            image_b64: jpeg ?? undefined,
            participant_id: options.participantId,
            platform: options.platform ?? "generic",
            consent: true,
          });
          prev = frame;
        }
      }
      if (audio) {
        const feats = await sampler.sampleAudio(500);
        if (feats) {
          await options.session.trackEvent("voice_liveness", {
            ml_features: feats,
            participant_id: options.participantId,
            platform: options.platform ?? "generic",
            consent: true,
          });
          await options.session.trackEvent("voice_clone_risk", {
            ml_features: feats,
            participant_id: options.participantId,
            consent: true,
          });
        }
      }

      const result = await options.session.evaluate(["interview", "deepfake", "bot"]);
      last = result;
      options.onDecision?.(result);
      if (options.autoRemove && shouldRemoveParticipant(result.recommendation)) {
        enforceCallDecision(options.source, result.recommendation);
        stopped = true;
        sampler.stop();
        return;
      }
    } catch {
      // keep watching; next tick retries
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  void tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      sampler.stop();
    },
    lastResult: () => last,
  };
}
