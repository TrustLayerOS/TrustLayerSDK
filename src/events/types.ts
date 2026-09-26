export type EventType =
  | "device_change"
  | "identity_verified"
  | "face_match_completed"
  | "voice_verified"
  | "mouse_activity"
  | "typing_pattern"
  | "window_switch"
  | "login_attempt"
  | "suspicious_activity"
  | "deepfake_detected"
  | "ai_assistance_signal"
  | "browser_changed"
  | "session_started"
  | "session_ended"
  | "liveness_challenge_started"
  | "liveness_challenge_passed"
  | "liveness_challenge_failed"
  | "face_frame"
  | "voice_liveness"
  | "voice_clone_risk"
  | "passkey_verified"
  | "face_reference"
  | "bot_challenge_passed"
  | "bot_challenge_failed"
  | "speaker_reference"
  | "custom";

export interface TrustEvent {
  /** Unique event ID (generated client-side) */
  id: string;
  /** Event type */
  type: EventType;
  /** Session this event belongs to */
  sessionId: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Arbitrary event metadata */
  data?: Record<string, unknown>;
}
