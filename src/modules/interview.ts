import { TrustSession } from "../session";

export interface InterviewIntegrityResult {
  integrityScore: number;
  riskFactors: string[];
  aiAssistanceProbability: number;
  identityConsistency: number;
  recommendation: "pass" | "review" | "flag";
}

/**
 * InterviewShield — monitors interview sessions for AI assistance,
 * identity fraud, and behavioral anomalies.
 */
export class InterviewShield {
  private monitoring = false;
  private windowSwitchCount = 0;
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly session: TrustSession) {}

  /**
   * Begin continuous monitoring for the interview session.
   * Automatically tracks window switches and focus changes.
   */
  startMonitoring(): void {
    if (this.monitoring) return;
    this.monitoring = true;

    this.session.startSignalCollection();

    // Track window/tab switches via visibility API
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.windowSwitchCount++;
          void this.session.trackEvent("window_switch", {
            count: this.windowSwitchCount,
            timestamp: new Date().toISOString(),
          });
        }
      };
      document.addEventListener(
        "visibilitychange",
        this.visibilityHandler
      );
    }
  }

  /**
   * Stop monitoring and clean up event listeners.
   */
  stopMonitoring(): void {
    if (!this.monitoring) return;
    this.monitoring = false;

    this.session.stopSignalCollection();

    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.visibilityHandler
      );
      this.visibilityHandler = null;
    }
  }

  /**
   * Get the current interview integrity score.
   */
  async getIntegrityScore(): Promise<InterviewIntegrityResult> {
    const [trust, risk] = await Promise.all([
      this.session.getTrustScore(),
      this.session.getRiskScore(),
    ]);

    const integrityScore = Math.round(
      trust.trust_score * 0.6 + (100 - risk.risk_score) * 0.4
    );

    const riskFactors = risk.factors;
    const aiAssistanceProbability =
      riskFactors.includes("ai_assistance_signal") ||
      riskFactors.includes("content_risk")
        ? 0.7
        : riskFactors.includes("behavior_anomaly")
        ? 0.4
        : 0.1;

    const identityConsistency = trust.components?.identity_score ?? 80;

    let recommendation: "pass" | "review" | "flag";
    if (integrityScore < 40 || aiAssistanceProbability > 0.7) {
      recommendation = "flag";
    } else if (
      integrityScore < 65 ||
      aiAssistanceProbability > 0.4 ||
      this.windowSwitchCount > 5
    ) {
      recommendation = "review";
    } else {
      recommendation = "pass";
    }

    return {
      integrityScore,
      riskFactors,
      aiAssistanceProbability:
        Math.round(aiAssistanceProbability * 1000) / 1000,
      identityConsistency,
      recommendation,
    };
  }

  /**
   * Manually report a window switch (for cases where the SDK
   * doesn't automatically detect it).
   */
  reportWindowSwitch(): void {
    this.windowSwitchCount++;
    void this.session.trackEvent("window_switch", {
      count: this.windowSwitchCount,
      manually_reported: true,
    });
  }

  /**
   * Report an external application was detected running alongside the interview.
   */
  reportExternalApplication(appName: string): void {
    void this.session.trackEvent("suspicious_activity", {
      application: appName,
      reported_at: new Date().toISOString(),
    });
  }
}
