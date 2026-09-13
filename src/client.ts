import { TrustLayerConfig, TrustModule, DEFAULT_API_URL, DEFAULT_TIMEOUT } from "./config";
import { ApiClient } from "./api/client";
import {
  SessionManager,
  TrustSession,
  CreateSessionOptions,
  VerifyHumanOptions,
} from "./session";
import { FraudShield } from "./modules/fraud";
import { BotShield } from "./modules/bot";
import { InterviewShield } from "./modules/interview";
import { DeepfakeShield } from "./modules/deepfake";
import { AnomalyShield } from "./modules/anomaly";
import { Logger } from "./utils/logger";
import {
  EvaluationResponse,
  GenerateKeysResponse,
  IssueTokenResponse,
  WebhookEndpoint,
} from "./api/types";

/**
 * TrustLayer — the main SDK client.
 *
 * @example
 * ```typescript
 * const tl = TrustLayer.initialize({ apiKey: "tl_public_xxx" })
 *
 * const session = await tl.createSession({ type: "interview" })
 * session.startSignalCollection()
 *
 * const shield = tl.interview(session)
 * shield.startMonitoring()
 *
 * // ... interview happens ...
 *
 * const result = await shield.getIntegrityScore()
 * await session.complete()
 * ```
 */
export class TrustLayer {
  private readonly apiClient: ApiClient;
  private readonly sessionManager: SessionManager;
  private readonly logger: Logger;
  private readonly config: TrustLayerConfig;

  constructor(config: TrustLayerConfig) {
    this.config = {
      apiUrl: DEFAULT_API_URL,
      timeout: DEFAULT_TIMEOUT,
      debug: false,
      ...config,
    };

    this.logger = new Logger(this.config.debug ?? false);
    this.apiClient = new ApiClient(this.config, this.logger);
    this.sessionManager = new SessionManager(
      this.config,
      this.apiClient,
      this.logger
    );

    this.logger.info("TrustLayer SDK initialized", {
      apiUrl: this.config.apiUrl,
      modules: this.config.modules ?? [],
    });
  }

  /**
   * Creates a new trust evaluation session.
   */
  async createSession(options: CreateSessionOptions): Promise<TrustSession> {
    return this.sessionManager.create(options);
  }

  /**
   * Resumes an existing session by ID.
   */
  async getSession(sessionId: string): Promise<TrustSession> {
    return this.sessionManager.get(sessionId);
  }

  /**
   * One-shot: create a session, run liveness / media (browser), evaluate.
   * Same JSON as POST /v1/evaluate (`human_probability`, `recommendation`).
   */
  async verifyHuman(
    options: VerifyHumanOptions & Partial<CreateSessionOptions> = {}
  ): Promise<EvaluationResponse> {
    const session = await this.createSession({
      type: options.type ?? "interview",
      userId: options.userId,
      modules: options.modules ?? (["interview", "deepfake", "bot"] as TrustModule[]),
      riskThreshold: options.riskThreshold,
      metadata: options.metadata,
    });
    session.startSignalCollection();
    return session.verifyHuman(options);
  }

  generateKeys(name: string, projectId?: string): Promise<GenerateKeysResponse> {
    return this.apiClient.generateKeys(name, projectId);
  }

  issueToken(
    userId: string,
    opts?: { role?: string; ttlMinutes?: number }
  ): Promise<IssueTokenResponse> {
    return this.apiClient.issueToken(userId, opts?.role, opts?.ttlMinutes);
  }

  registerWebhook(url: string, events?: string[]): Promise<WebhookEndpoint> {
    return this.apiClient.registerWebhook(url, events);
  }

  listWebhooks(): Promise<{ webhooks: WebhookEndpoint[]; count: number }> {
    return this.apiClient.listWebhooks();
  }

  deleteWebhook(webhookId: string): Promise<{ deleted: boolean; id: string }> {
    return this.apiClient.deleteWebhook(webhookId);
  }

  // ─── Module Access ─────────────────────────────────────────────────────────

  /** Access Fraud Shield for the given session. */
  fraud(session: TrustSession): FraudShield {
    return new FraudShield(session);
  }

  /** Access Interview Shield for the given session. */
  interview(session: TrustSession): InterviewShield {
    return new InterviewShield(session);
  }

  /** Access Bot Shield for the given session. */
  bot(session: TrustSession): BotShield {
    return new BotShield(session);
  }

  /** Access Deepfake Shield for the given session. */
  deepfake(session: TrustSession): DeepfakeShield {
    return new DeepfakeShield(session);
  }

  /** Access Anomaly Shield for the given session. */
  anomaly(session: TrustSession): AnomalyShield {
    return new AnomalyShield(session);
  }

  // ─── Static convenience ────────────────────────────────────────────────────

  /**
   * Static factory method.
   * ```typescript
   * const tl = TrustLayer.initialize({ apiKey: "tl_public_xxx" })
   * ```
   */
  static initialize(config: TrustLayerConfig): TrustLayer {
    return new TrustLayer(config);
  }
}
