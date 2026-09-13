/** Throws if biometric capture was not consented. */
export function assertMediaConsent(consent: boolean): void {
  if (!consent) {
    throw new Error("consent_required");
  }
}
