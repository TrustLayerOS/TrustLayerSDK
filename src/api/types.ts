import { TrustModule, SessionType } from "../config";

// ─── Session ──────────────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  type: SessionType;
  user_id?: string;
  modules?: TrustModule[];
  risk_threshold?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResponse {
  id: string;
  organization_id: string;
  user_id?: string;
  type: SessionType;
  status: "created" | "active" | "evaluating" | "completed" | "expired";
  modules: string[];
  risk_threshold: number;
  expires_at: string;
  created_at: string;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface SendEventRequest {
  session_id: string;
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export interface SendEventResponse {
  event_id: string;
  accepted: boolean;
}

// ─── Trust & Risk ─────────────────────────────────────────────────────────────

export interface TrustScoreResponse {
  trust_score: number;
  confidence: number;
  status: "very_trusted" | "trusted" | "suspicious" | "high_risk";
  reasons: string[];
  components?: {
    identity_score: number;
    device_score: number;
    behavior_score: number;
    network_score: number;
    reputation_score: number;
    risk_penalty: number;
  };
}

export interface RiskScoreResponse {
  risk_score: number;
  level: "low" | "moderate" | "high" | "critical";
  factors: string[];
  confidence: number;
  primary_factors: string[];
  dimensions?: {
    identity_risk: number;
    device_risk: number;
    behavior_risk: number;
    network_risk: number;
    reputation_risk: number;
    content_risk: number;
  };
}

export interface EvaluationModules {
  interview?: {
    integrity_score: number;
    ai_assistance_probability: number;
    identity_consistency: number;
    risk_factors: string[];
    recommendation: string;
  };
  deepfake?: {
    deepfake_probability: number;
    confidence: number;
    status: string;
    replay_risk?: number;
    voice_clone_risk?: number;
    liveness_passed?: boolean;
    reasons?: string[];
  };
  bot?: {
    bot_probability: number;
    human_probability: number;
    is_bot: boolean;
    confidence: number;
    signals: string[];
  };
}

export interface EvaluationResponse {
  session_id: string;
  human_probability: number;
  deepfake_risk: number;
  integrity_score: number;
  recommendation: "allow" | "monitor" | "verify" | "review" | "block";
  reasons: string[];
  confidence: number;
  trust_score: TrustScoreResponse;
  risk_score: RiskScoreResponse;
  explanation: string[];
  policy_actions?: string[];
  modules?: EvaluationModules;
  created_at?: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  code?: number;
}

export class TrustLayerError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = "TrustLayerError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
