// ─── Main Client ──────────────────────────────────────────────────────────────
export { TrustLayer } from "./client";

// ─── Session ──────────────────────────────────────────────────────────────────
export { TrustSession, SessionManager } from "./session";
export type { CreateSessionOptions, VerifyHumanOptions } from "./session";
export { assertMediaConsent } from "./privacy";

// ─── Config ───────────────────────────────────────────────────────────────────
export type {
  TrustLayerConfig,
  TrustModule,
  SessionType,
  SignalCollectionConfig,
} from "./config";

// ─── Modules ──────────────────────────────────────────────────────────────────
export { FraudShield }     from "./modules/fraud";
export { BotShield }       from "./modules/bot";
export { InterviewShield } from "./modules/interview";
export { DeepfakeShield }  from "./modules/deepfake";
export { AnomalyShield }   from "./modules/anomaly";
export { runLivenessChallenge } from "./modules/liveness";

export type { FraudResult, FraudEvaluationContext }        from "./modules/fraud";
export type { BotAnalysisResult }                          from "./modules/bot";
export type { InterviewIntegrityResult }                   from "./modules/interview";
export type { DeepfakeVideoResult, DeepfakeAudioResult }   from "./modules/deepfake";
export type { AnomalyResult }                              from "./modules/anomaly";
export type { LivenessPrompt, LivenessResult, LivenessChallenge } from "./modules/liveness";

// ─── Events ───────────────────────────────────────────────────────────────────
export { EventEmitter } from "./events/emitter";
export type { TrustEvent, EventType } from "./events/types";

// ─── Signals ──────────────────────────────────────────────────────────────────
export { BehaviorCollector, collectAllSignals } from "./signals/index";
export {
  collectDeviceSignals,
  collectNetworkSignals,
  collectIdentitySignals,
  extractFrameFeatures,
  extractAudioFeatures,
  createMediaSampler,
} from "./signals/index";
export type {
  DeviceSignals,
  BehaviorSignals,
  NetworkSignals,
  IdentitySignals,
  AllSignals,
} from "./signals/index";

// ─── API Types ────────────────────────────────────────────────────────────────
export type {
  TrustScoreResponse,
  RiskScoreResponse,
  EvaluationResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  EvaluationModules,
} from "./api/types";
export { TrustLayerError } from "./api/types";

// ─── Crypto ───────────────────────────────────────────────────────────────────
export { signRequest, verifyWebhookSignature } from "./crypto/signing";

// ─── Default export ───────────────────────────────────────────────────────────
export { TrustLayer as default } from "./client";
