import { TrustLayerConfig, SessionType, TrustModule } from "./config";
import { ApiClient } from "./api/client";
import {
  CreateSessionResponse,
  TrustScoreResponse,
  RiskScoreResponse,
  EvaluationResponse,
  TrustLayerError,
} from "./api/types";
import { EventEmitter } from "./events/emitter";
import { EventType } from "./events/types";
import { BehaviorCollector } from "./signals/behavior";
import { collectAutomationFlags, collectDeviceSignals } from "./signals/device";
import { installHoneypot } from "./signals/honeypot";
import { runBotChallenge } from "./modules/botChallenge";
import { collectNetworkSignals } from "./signals/network";
import { collectIdentitySignals } from "./signals/identity";
import { Logger } from "./utils/logger";
import {
  createMediaSampler,
  createMediaSamplerFrom,
  extractFrameFeatures,
  isBrowser,
  type FrameSample,
  type MediaSource,
} from "./signals/media";
import { runLivenessChallenge, type LivenessPrompt } from "./modules/liveness";
import { assertMediaConsent } from "./privacy";

export interface CreateSessionOptions {
  type: SessionType;
  userId?: string;
  modules?: TrustModule[];
  riskThreshold?: number;
  metadata?: Record<string, unknown>;
}

export interface VerifyHumanOptions {
  liveness?: boolean;
  video?: boolean;
  audio?: boolean;
  /** Consented reference portrait. The server compares it to the liveness crop. */
  referenceImageB64?: string;
  /** Must be true (or confirmed via onConsent) before camera/mic. */
  consent?: boolean;
  onConsent?: () => boolean | Promise<boolean>;
  onPrompt?: (prompt: LivenessPrompt) => void;
  /**
   * Existing Meet / Zoom / WebRTC / file stream. When set, the SDK does not
   * call getUserMedia and liveness defaults to off (remote tiles cannot look left).
   */
  source?: MediaSource;
  /** Override evaluate modules. Default interview + deepfake + bot. */
  modules?: string[];
}

/**
 * Manages trust session lifecycle.
 */
export class SessionManager {
  constructor(
    private readonly config: TrustLayerConfig,
    private readonly apiClient: ApiClient,
    private readonly logger: Logger
  ) {}

  async create(options: CreateSessionOptions): Promise<TrustSession> {
    const response = await this.apiClient.createSession({
      type: options.type,
      user_id: options.userId,
      modules: options.modules ?? this.config.modules,
      risk_threshold: options.riskThreshold,
      metadata: options.metadata,
    });

    this.logger.info(`session created: ${response.id}`, { type: options.type });

    return new TrustSession(
      response,
      this.config,
      this.apiClient,
      this.logger
    );
  }

  async get(sessionId: string): Promise<TrustSession> {
    const response = await this.apiClient.getSession(sessionId);
    return new TrustSession(response, this.config, this.apiClient, this.logger);
  }
}

/**
 * Represents an active trust evaluation session.
 * Handles event emission, signal collection, and score retrieval.
 */
export class TrustSession {
  readonly sessionId: string;
  readonly type: SessionType;

  private readonly emitter: EventEmitter;
  private readonly behaviorCollector: BehaviorCollector;
  private readonly logger: Logger;
  private readonly apiClient: ApiClient;
  private readonly config: TrustLayerConfig;
  private collectingSignals = false;
  private honeypotFilled: () => boolean = () => false;

  constructor(
    data: CreateSessionResponse,
    config: TrustLayerConfig,
    apiClient: ApiClient,
    logger: Logger
  ) {
    this.sessionId = data.id;
    this.type = data.type;
    this.config = config;
    this.apiClient = apiClient;
    this.logger = logger;
    this.emitter = new EventEmitter(apiClient, data.id, logger);
    this.behaviorCollector = new BehaviorCollector();

    this.emitter.emit("session_started", { type: data.type });
  }

  async trackEvent(
    type: EventType,
    data?: Record<string, unknown>
  ): Promise<void> {
    this.emitter.emit(type, data);
  }

  async issueLivenessChallenge(count = 3) {
    return this.apiClient.issueLivenessChallenge(this.sessionId, count);
  }

  async issuePasskeyChallenge() {
    return this.apiClient.issuePasskeyChallenge(this.sessionId);
  }

  async issueBotChallenge() {
    return this.apiClient.issueBotChallenge(this.sessionId);
  }

  /** Click-the-shape. No camera. Skipped outside a browser. */
  runBotChallenge(): Promise<"passed" | "failed" | "skipped"> {
    return runBotChallenge(this);
  }

  async flushEvents(): Promise<void> {
    await this.emitter.flush();
  }

  /**
   * WebAuthn presence signal. Credits the session only after the server
   * consumes a one-time challenge. Cancelled or unsupported authenticators
   * return a status and do not throw.
   */
  async verifyPasskey(): Promise<"verified" | "unavailable" | "cancelled"> {
    if (!isBrowser() || typeof PublicKeyCredential === "undefined") {
      return "unavailable";
    }
    let issued: { challenge_id: string; challenge: string };
    try {
      issued = await this.apiClient.issuePasskeyChallenge(this.sessionId);
    } catch {
      return "unavailable";
    }
    const challenge = copyBuffer(hexToBytes(issued.challenge));
    const userId = copyBuffer(crypto.getRandomValues(new Uint8Array(16)));
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "TrustLayer", id: location.hostname },
          user: { id: userId, name: this.sessionId, displayName: "TrustLayer session" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          timeout: 60_000,
          authenticatorSelection: { userVerification: "preferred", residentKey: "discouraged" },
          attestation: "none",
        },
      });
      if (!cred || !(cred instanceof PublicKeyCredential)) return "cancelled";
      const raw = new Uint8Array(cred.rawId);
      let binary = "";
      raw.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      await this.trackEvent("passkey_verified", {
        challenge_id: issued.challenge_id,
        credential_id: btoa(binary).slice(0, 88),
      });
      await this.emitter.flush();
      return "verified";
    } catch {
      return "cancelled";
    }
  }

  startSignalCollection(): void {
    if (this.collectingSignals) return;
    this.collectingSignals = true;

    const sigConfig = this.config.signalCollection ?? {};

    if (sigConfig.behavior !== false) {
      this.behaviorCollector.start();
      this.honeypotFilled = installHoneypot();
    }

    void this.sendInitialSignals(sigConfig);
    this.logger.debug("signal collection started");
  }

  stopSignalCollection(): void {
    if (!this.collectingSignals) return;
    this.collectingSignals = false;

    const signals = this.behaviorCollector.getSignals();
    this.behaviorCollector.stop();

    this.emitter.emit("mouse_activity", {
      mouse_movements: signals.mouseMovements,
      velocity_variance: signals.velocityVariance,
      straight_line_ratio: signals.straightLineRatio,
      curvature: signals.curvature,
      teleport_gaps: signals.teleportGaps,
      robotic: signals.straightLineRatio >= 0.9 && signals.mouseMovements > 8,
      mouse_dx: signals.mouseDx,
      mouse_dy: signals.mouseDy,
    });

    if (signals.keystrokes > 0 || signals.pasteBursts > 0) {
      this.emitter.emit("typing_pattern", {
        keystrokes: signals.keystrokes,
        avg_typing_speed: signals.avgTypingSpeed,
        cadence_variance: signals.cadenceVariance,
        automated: signals.cadenceVariance < 0.05,
        paste_burst: signals.pasteBursts > 0,
        no_corrections: signals.pasteBursts > 0 && signals.corrections === 0,
        corrections: signals.corrections,
        key_delays: signals.keyDelays,
      });
    }

    if (this.honeypotFilled()) {
      this.emitter.emit("suspicious_activity", { honeypot: true });
    }

    if (signals.windowSwitches > 0) {
      for (let i = 0; i < signals.windowSwitches; i++) {
        this.emitter.emit("window_switch", {
          count: signals.windowSwitches,
        });
      }
    }
  }

  async getTrustScore(): Promise<TrustScoreResponse> {
    await this.emitter.flush();
    return this.apiClient.getTrustScore(this.sessionId);
  }

  async getRiskScore(): Promise<RiskScoreResponse> {
    await this.emitter.flush();
    return this.apiClient.getRiskScore(this.sessionId);
  }

  async evaluate(modules?: string[]): Promise<EvaluationResponse> {
    await this.emitter.flush();
    return this.apiClient.evaluate(this.sessionId, modules);
  }

  /**
   * Voice-only: sample mic or an existing audio track (Meet / Zoom / file).
   * Sends `voice_liveness` + `voice_clone_risk`, then evaluate.
   */
  async verifyVoice(
    options: Omit<VerifyHumanOptions, "video" | "liveness"> = {}
  ): Promise<EvaluationResponse> {
    return this.verifyHuman({
      ...options,
      video: false,
      liveness: false,
      audio: true,
      modules: options.modules ?? ["deepfake", "bot"],
    });
  }

  /** Store a reference portrait. Match score is set only after the ML service compares crops. */
  async enrollReference(imageB64: string): Promise<void> {
    await this.trackEvent("face_reference", {
      image_b64: imageB64,
      consent: true,
    });
    await this.emitter.flush();
  }

  async verifyHuman(options: VerifyHumanOptions = {}): Promise<EvaluationResponse> {
    if (options.referenceImageB64) {
      await this.enrollReference(options.referenceImageB64);
    }
    const attached = Boolean(options.source);
    const liveness = attached ? options.liveness === true : options.liveness !== false;
    const video = options.video !== false;
    const audio = options.audio !== false;

    let consented = options.consent === true;
    if (!consented && options.onConsent) {
      consented = !!(await options.onConsent());
    }
    if (!consented && isBrowser() && (liveness || video || audio)) {
      consented = window.confirm(
        "TrustLayer will use your camera and microphone to check you are a live human. Features are scored; raw video is not stored."
      );
    }
    if (liveness || video || audio) {
      assertMediaConsent(consented);
    }

    if (liveness) {
      const live = await runLivenessChallenge(this, { onPrompt: options.onPrompt });
      if (!live.passed) {
        await this.emitter.flush();
        throw new TrustLayerError(
          `liveness_failed:${live.reason ?? "challenge"}`,
          403,
          "liveness_failed"
        );
      }
    }

    let capturedMedia = false;
    if ((video || audio) && isBrowser()) {
      let sampler;
      try {
        sampler = options.source
          ? await createMediaSamplerFrom(options.source)
          : await createMediaSampler();
        await sampler.start({ video, audio });
        if (video) {
          let prev: FrameSample | null = null;
          for (let i = 0; i < 3; i++) {
            const frame = await sampler.sampleFrame();
            if (frame) {
              const features = extractFrameFeatures(frame, prev);
              await this.trackEvent("face_frame", {
                ml_features: features,
                image_b64: sampler.sampleJpeg() ?? undefined,
                sample_index: i,
                consent: true,
                virtual_camera: sampler.virtualCamera(),
                capture_label: sampler.virtualCamera() ? "virtual" : "",
              });
              prev = frame;
              capturedMedia = true;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        if (audio) {
          const feats = await sampler.sampleAudio(1200);
          if (feats) {
            const voice = { ml_features: feats, consent: true };
            await this.trackEvent("voice_liveness", voice);
            await this.trackEvent("voice_clone_risk", voice);
            capturedMedia = true;
          }
        }
      } catch (err) {
        await this.trackEvent("liveness_challenge_failed", {
          reason: "no_camera",
          error: err instanceof Error ? err.message : String(err),
        });
        await this.emitter.flush();
        throw new TrustLayerError(
          err instanceof Error ? err.message : "media_capture_failed",
          403,
          "media_capture_failed"
        );
      } finally {
        sampler?.stop();
      }

      if ((video || audio) && !capturedMedia) {
        throw new TrustLayerError(
          "required media samples were not captured",
          403,
          "insufficient_media"
        );
      }
    } else if ((video || audio) && !isBrowser()) {
      await this.trackEvent("custom", {
        signal_type: "verify_human",
        note: "media capture requires a browser; send face_frame / voice_liveness events from your app",
      });
    }

    return this.evaluate(options.modules ?? ["interview", "deepfake", "bot"]);
  }

  async complete(): Promise<EvaluationResponse> {
    this.stopSignalCollection();
    this.emitter.emit("session_ended", {});
    await this.emitter.destroy();
    return this.apiClient.completeSession(this.sessionId);
  }

  private async sendInitialSignals(
    sigConfig: NonNullable<TrustLayerConfig["signalCollection"]>
  ): Promise<void> {
    if (sigConfig.device !== false) {
      try {
        const deviceSignals = await collectDeviceSignals();
        this.emitter.emit("device_change", {
          ...deviceSignals,
          is_initial: true,
        });
        const automation = collectAutomationFlags();
        if (automation.automation_framework) {
          this.emitter.emit("suspicious_activity", { ...automation });
        }
      } catch (err) {
        this.logger.warn("failed to collect device signals", err);
      }
    }

    if (sigConfig.network !== false) {
      try {
        const networkSignals = await collectNetworkSignals();
        this.emitter.emit("custom", {
          signal_type: "network",
          ...networkSignals,
        });
      } catch (err) {
        this.logger.warn("failed to collect network signals", err);
      }
    }

    if (sigConfig.identity !== false) {
      try {
        const identitySignals = collectIdentitySignals();
        this.emitter.emit("custom", {
          signal_type: "identity",
          ...identitySignals,
        });
      } catch (err) {
        this.logger.warn("failed to collect identity signals", err);
      }
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
