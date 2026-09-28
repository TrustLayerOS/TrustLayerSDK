import type { EvaluationResponse } from "../api/types";
import type { EventType } from "../events/types";
import type { TrustSession } from "../session";
import {
  createMediaSamplerFrom,
  extractAudioFeatures,
  extractFrameFeatures,
  flowEnergy,
  frameDigest,
  isBrowser,
  mouthBandEnergy,
  screenEdgeEnergy,
  type FrameSample,
  type MediaSampler,
  type MediaSource,
  type VoicePcmWindow,
  type VoiceSampleRate,
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
 * Attach a MediaStream your app is allowed to hold.
 *
 * Works when you join with the user's permission:
 * Zoom Video SDK, Daily, LiveKit, Twilio Video, generic WebRTC.
 *
 * meet.google.com and the Zoom desktop app do not expose remote tiles.
 * Use examples/meeting-sidecar.html, or a bot that captures an authorized stream.
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
  /** 8000 for phone audio, 16000 for a computer mic. Default 16000. */
  sampleRate?: VoiceSampleRate;
  /** Mute / blur the source when recommendation is block. */
  autoRemove?: boolean;
  onDecision?: (result: EvaluationResponse) => void;
}

/** What one tick of a sidecar watch can see. Tests drive this without a browser. */
export interface CallLoopSampler {
  sampleFrame(): Promise<FrameSample | null>;
  sampleJpeg(): string | null;
  virtualCamera(): boolean;
  sampleVoiceWindow(): Promise<VoicePcmWindow | null>;
  stop(): void;
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
/**
 * Ask the user to share a Meet or Zoom window. Those apps do not hand tiles
 * to a third-party page. The score is on the pixels the user shares.
 */
export async function captureMeetingWindow(): Promise<MediaStream> {
  if (!isBrowser() || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("display_capture_unavailable");
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
}

function loopSampler(sampler: MediaSampler, sampleRate: VoiceSampleRate, intervalMs: number): CallLoopSampler {
  const windowMs = Math.min(1200, Math.max(400, intervalMs));
  return {
    sampleFrame: () => sampler.sampleFrame(),
    sampleJpeg: () => sampler.sampleJpeg(),
    virtualCamera: () => sampler.virtualCamera(),
    sampleVoiceWindow: () => sampler.samplePcmWindow(windowMs, sampleRate),
    stop: () => sampler.stop(),
  };
}

/**
 * Keep posting a short PCM window until stop(). The sidecar and attachToCall
 * share this loop. Each voice event carries audio_pcm, sample_rate, and audio_energy.
 */
export interface CallWatchSession {
  readonly sessionId: string;
  trackEvent(type: EventType, data?: Record<string, unknown>): Promise<void>;
  evaluate(modules?: string[]): Promise<EvaluationResponse>;
}

export function startAttachLoop(options: {
  session: CallWatchSession;
  sampler: CallLoopSampler;
  video: boolean;
  audio: boolean;
  intervalMs: number;
  participantId?: string;
  platform?: CallPlatform;
  autoRemove?: boolean;
  source?: MediaSource;
  onDecision?: (result: EvaluationResponse) => void;
}): CallWatchHandle {
  let stopped = false;
  let last: EvaluationResponse | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prev: FrameSample | null = null;
  let consecutiveFailures = 0;

  const voicePayload = (window: VoicePcmWindow) => ({
    audio_pcm: window.audio_pcm,
    sample_rate: window.sample_rate,
    audio_energy: window.audio_energy,
    ml_features: extractAudioFeatures(window.audio_pcm),
    participant_id: options.participantId,
    platform: options.platform ?? "generic",
    consent: true,
  });

  const tick = async () => {
    if (stopped) return;
    try {
      if (options.video) {
        const frame = await options.sampler.sampleFrame();
        if (stopped) return;
        if (frame) {
          const features = extractFrameFeatures(frame, prev);
          const jpeg = options.sampler.sampleJpeg();
          const hash = frameDigest(frame.data, frame.width, frame.height);
          const prevHash = prev ? frameDigest(prev.data, prev.width, prev.height) : "";
          await options.session.trackEvent("face_frame", {
            ml_features: features,
            image_b64: jpeg ?? undefined,
            participant_id: options.participantId,
            platform: options.platform ?? "generic",
            consent: true,
            frame_hash: hash,
            repeated_frame: hash !== "" && hash === prevHash,
            screen_edge: screenEdgeEnergy(frame.data, frame.width, frame.height),
            flow_energy: prev ? flowEnergy(prev, frame) : undefined,
            mouth_energy: prev ? mouthBandEnergy(prev, frame) : undefined,
            virtual_camera: options.sampler.virtualCamera(),
          });
          prev = frame;
        }
      }
      if (options.audio) {
        const voice = await options.sampler.sampleVoiceWindow();
        if (stopped) return;
        if (voice && (voice.sample_rate === 8000 || voice.sample_rate === 16000)) {
          const payload = voicePayload(voice);
          await options.session.trackEvent("voice_liveness", payload);
          if (stopped) return;
          await options.session.trackEvent("voice_clone_risk", payload);
        }
      }
      if (stopped) return;

      const result = await options.session.evaluate(["interview", "deepfake", "bot"]);
      if (stopped) return;
      consecutiveFailures = 0;
      last = result;
      options.onDecision?.(result);
      if (options.autoRemove && options.source && shouldRemoveParticipant(result.recommendation)) {
        enforceCallDecision(options.source, result.recommendation);
        stopped = true;
        options.sampler.stop();
        return;
      }
    } catch (err) {
      if (stopped) return;
      consecutiveFailures += 1;
      options.onDecision?.({
        session_id: options.session.sessionId,
        human_probability: 0,
        deepfake_risk: 1,
        integrity_score: 0,
        recommendation: "block",
        reasons: ["watcher_error", err instanceof Error ? err.message : "unknown"],
        confidence: 0,
        trust_score: { trust_score: 0, confidence: 0, status: "high_risk", reasons: [] },
        risk_score: { risk_score: 100, level: "critical", factors: [], confidence: 0, primary_factors: [] },
        explanation: [],
      });
      if (consecutiveFailures >= 3) {
        stopped = true;
        options.sampler.stop();
        return;
      }
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, options.intervalMs);
    }
  };

  void tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      options.sampler.stop();
    },
    lastResult: () => last,
  };
}

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
  const sampleRate = options.sampleRate ?? 16000;

  const sampler = await createMediaSamplerFrom(options.source);
  await sampler.start({ video, audio });

  return startAttachLoop({
    session: options.session,
    sampler: loopSampler(sampler, sampleRate, intervalMs),
    video,
    audio,
    intervalMs,
    participantId: options.participantId,
    platform: options.platform,
    autoRemove: options.autoRemove,
    source: options.source,
    onDecision: options.onDecision,
  });
}
