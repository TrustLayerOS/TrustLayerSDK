import { TrustLayerConfig, SessionType, TrustModule } from "./config";
import { ApiClient } from "./api/client";
import {
  CreateSessionResponse,
  TrustScoreResponse,
  RiskScoreResponse,
  EvaluationResponse,
} from "./api/types";
import { EventEmitter } from "./events/emitter";
import { EventType } from "./events/types";
import { BehaviorCollector } from "./signals/behavior";
import { collectDeviceSignals } from "./signals/device";
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
  /** Must be true (or confirmed via onConsent) before camera/mic. */
  consent?: boolean;
  onConsent?: () => boolean | Promise<boolean>;
  onPrompt?: (prompt: LivenessPrompt) => void;
  /**
   * Existing Meet / Zoom / WebRTC / file stream. When set, the SDK does not
   * call getUserMedia and liveness defaults to off (remote tiles cannot look left).
   */
  source?: MediaSource;
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

    // Emit session started event
    this.emitter.emit("session_started", { type: data.type });
  }

  /**
   * Tracks a trust event for this session.
   */
  async trackEvent(
    type: EventType,
    data?: Record<string, unknown>
  ): Promise<void> {
    this.emitter.emit(type, data);
  }

  /**
   * Starts automatic signal collection (device, behavior, network).
   */
  startSignalCollection(): void {
    if (this.collectingSignals) return;
    this.collectingSignals = true;

    const sigConfig = this.config.signalCollection ?? {};

    if (sigConfig.behavior !== false) {
      this.behaviorCollector.start();
    }

    // Collect static signals once and send as an event
    void this.sendInitialSignals(sigConfig);

    this.logger.debug("signal collection started");
  }

  /**
   * Stops automatic signal collection and flushes behavioral signals.
   */
  stopSignalCollection(): void {
    if (!this.collectingSignals) return;
    this.collectingSignals = false;

    const signals = this.behaviorCollector.getSignals();
    this.behaviorCollector.stop();

    // Send final behavioral snapshot
    this.emitter.emit("mouse_activity", {
      mouse_movements: signals.mouseMovements,
      velocity_variance: 0.5,
    });

    if (signals.keystrokes > 0) {
      this.emitter.emit("typing_pattern", {
        keystrokes: signals.keystrokes,
        avg_typing_speed: signals.avgTypingSpeed,
        cadence_variance: signals.cadenceVariance,
        automated: signals.cadenceVariance < 0.05,
      });
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
   * Capture live camera/mic (browser), run a liveness challenge, send
   * forensic features, then return POST /v1/evaluate.
   */
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
    });
  }

  async verifyHuman(options: VerifyHumanOptions = {}): Promise<EvaluationResponse> {
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
      await runLivenessChallenge(this, { onPrompt: options.onPrompt });
    }

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
              });
              prev = frame;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        if (audio) {
          const feats = await sampler.sampleAudio(700);
          if (feats) {
            const voice = { ml_features: feats, consent: true };
            await this.trackEvent("voice_liveness", voice);
            await this.trackEvent("voice_clone_risk", voice);
          }
        }
      } catch (err) {
        await this.trackEvent("liveness_challenge_failed", {
          reason: "no_camera",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        sampler?.stop();
      }
    } else if ((video || audio) && !isBrowser()) {
      await this.trackEvent("custom", {
        signal_type: "verify_human",
        note: "media capture requires a browser; send face_frame / voice_liveness events from your app",
      });
    }

    return this.evaluate(["interview", "deepfake", "bot"]);
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
