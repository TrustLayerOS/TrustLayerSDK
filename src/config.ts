export type TrustModule =
  | "fraud"
  | "bot_detection"
  | "bot"
  | "interview"
  | "deepfake"
  | "anomaly"
  | "spam"
  | "agent";

export type SessionType =
  | "user_verification"
  | "interview"
  | "transaction"
  | "authentication"
  | "agent";

export interface SignalCollectionConfig {
  /** Collect device fingerprint signals (default: true) */
  device?: boolean;
  /** Collect behavioral signals — mouse, keyboard (default: true) */
  behavior?: boolean;
  /** Collect network signals (default: true) */
  network?: boolean;
  /** Collect identity signals (default: true) */
  identity?: boolean;
}

export interface TrustLayerConfig {
  /** API key — use tl_public_xxx for client-side, tl_secret_xxx for server-side */
  apiKey: string;
  /** TrustLayerOS API base URL. Defaults to https://api.trustlayer.dev */
  apiUrl?: string;
  /** Modules to enable globally on this SDK instance */
  modules?: TrustModule[];
  /** Enable verbose debug logging */
  debug?: boolean;
  /** Signal collection configuration */
  signalCollection?: SignalCollectionConfig;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}

export const DEFAULT_API_URL = "https://api.trustlayer.dev";
export const DEFAULT_TIMEOUT = 20000;
