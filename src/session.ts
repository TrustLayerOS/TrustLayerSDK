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

export interface CreateSessionOptions {
  type: SessionType;
  userId?: string;
  modules?: TrustModule[];
  riskThreshold?: number;
  metadata?: Record<string, unknown>;
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

  async evaluate(): Promise<EvaluationResponse> {
    await this.emitter.flush();
    return this.apiClient.evaluate(this.sessionId);
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
