import { TrustLayerError } from "./api/types";

/** Throws if biometric capture was not consented. */
export function assertMediaConsent(consent: boolean): void {
  if (!consent) {
    throw new TrustLayerError("biometric consent is required", 403, "consent_required", true);
  }
}
