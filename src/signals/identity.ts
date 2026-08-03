export interface IdentitySignals {
  /** Whether the session context is consistent with a previous session */
  sessionConsistency: boolean;
  referrer: string;
  origin: string;
}

/**
 * Collects non-invasive identity consistency signals.
 */
export function collectIdentitySignals(): IdentitySignals {
  const CONSISTENCY_KEY = "tl_session_seen";

  let sessionConsistency = false;
  try {
    sessionConsistency = !!sessionStorage.getItem(CONSISTENCY_KEY);
    sessionStorage.setItem(CONSISTENCY_KEY, "1");
  } catch {
    // sessionStorage not available
  }

  return {
    sessionConsistency,
    referrer:
      typeof document !== "undefined" ? document.referrer : "",
    origin: typeof window !== "undefined" ? window.location.origin : "",
  };
}
