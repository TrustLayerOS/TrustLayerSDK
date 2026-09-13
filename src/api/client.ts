import { TrustLayerConfig, DEFAULT_API_URL, DEFAULT_TIMEOUT } from "../config";
import {
  CreateSessionRequest,
  CreateSessionResponse,
  SendEventRequest,
  SendEventResponse,
  TrustScoreResponse,
  RiskScoreResponse,
  EvaluationResponse,
  ApiError,
  TrustLayerError,
  GenerateKeysResponse,
  IssueTokenResponse,
  WebhookEndpoint,
} from "./types";
import { Logger } from "../utils/logger";
import { retry } from "../utils/retry";

export class ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger: Logger;

  constructor(config: TrustLayerConfig, logger: Logger) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.logger = logger;
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
    return this.request<CreateSessionResponse>("POST", "/v1/sessions", req);
  }

  async getSession(sessionId: string): Promise<CreateSessionResponse> {
    return this.request<CreateSessionResponse>("GET", `/v1/sessions/${sessionId}`);
  }

  async completeSession(sessionId: string): Promise<EvaluationResponse> {
    return this.request<EvaluationResponse>("POST", `/v1/sessions/${sessionId}/complete`);
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  async sendEvent(req: SendEventRequest): Promise<SendEventResponse> {
    return this.request<SendEventResponse>("POST", "/v1/events", req);
  }

  async sendEventBatch(events: SendEventRequest[]): Promise<{ accepted_count: number; event_ids: string[] }> {
    return this.request("POST", "/v1/events/batch", { events });
  }

  // ─── Trust Intelligence ────────────────────────────────────────────────────

  async getTrustScore(sessionId: string): Promise<TrustScoreResponse> {
    return this.request<TrustScoreResponse>("GET", `/v1/trust/${sessionId}`);
  }

  async getRiskScore(sessionId: string): Promise<RiskScoreResponse> {
    return this.request<RiskScoreResponse>("GET", `/v1/risk/${sessionId}`);
  }

  async evaluate(sessionId: string, modules?: string[]): Promise<EvaluationResponse> {
    return this.request<EvaluationResponse>("POST", "/v1/evaluate", {
      session_id: sessionId,
      modules,
    });
  }

  // ─── Auth / keys (secret key or JWT) ───────────────────────────────────────

  async generateKeys(name: string, projectId?: string): Promise<GenerateKeysResponse> {
    return this.request<GenerateKeysResponse>("POST", "/v1/auth/keys", {
      name,
      project_id: projectId,
    });
  }

  async issueToken(
    userId: string,
    role = "developer",
    ttlMinutes = 60
  ): Promise<IssueTokenResponse> {
    return this.request<IssueTokenResponse>("POST", "/v1/auth/token", {
      user_id: userId,
      role,
      ttl_minutes: ttlMinutes,
    });
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  async registerWebhook(url: string, events?: string[]): Promise<WebhookEndpoint> {
    return this.request<WebhookEndpoint>("POST", "/v1/webhooks", {
      url,
      events: events ?? [],
    });
  }

  async listWebhooks(): Promise<{ webhooks: WebhookEndpoint[]; count: number }> {
    return this.request("GET", "/v1/webhooks");
  }

  async deleteWebhook(webhookId: string): Promise<{ deleted: boolean; id: string }> {
    return this.request("DELETE", `/v1/webhooks/${webhookId}`);
  }

  // ─── Core HTTP ─────────────────────────────────────────────────────────────

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    this.logger.debug(`${method} ${path}`, body ?? "");

    return retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
              "X-TrustLayer-SDK": "js/0.1.0",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!res.ok) {
            let errorData: ApiError = {
              error: "request_failed",
              message: `HTTP ${res.status}`,
              code: res.status,
            };
            try {
              errorData = (await res.json()) as ApiError;
            } catch {
              // Use default error data
            }

            // Only retry on 5xx, not 4xx
            if (res.status >= 500) {
              throw new TrustLayerError(
                errorData.message,
                res.status,
                errorData.error
              );
            }

            // 4xx — throw immediately without retry
            throw Object.assign(
              new TrustLayerError(errorData.message, res.status, errorData.error),
              { noRetry: true }
            );
          }

          const data = (await res.json()) as T;
          this.logger.debug(`${method} ${path} → 200`, data);
          return data;
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      },
      2,   // 2 retries for 5xx
      500  // 500ms base delay
    );
  }
}
