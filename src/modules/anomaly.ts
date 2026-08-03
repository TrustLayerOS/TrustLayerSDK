import { TrustSession } from "../session";

export interface AnomalyResult {
  anomalyScore: number;
  isAnomaly: boolean;
  deviations: string[];
  baseline?: Record<string, number>;
}

/**
 * AnomalyShield — detects behavioral patterns that deviate from normal baselines.
 */
export class AnomalyShield {
  constructor(private readonly session: TrustSession) {}

  /**
   * Analyzes the session for anomalous behavior.
   */
  async detect(): Promise<AnomalyResult> {
    const risk = await this.session.getRiskScore();

    // Anomaly score is a composite of behavior + network deviations
    const behaviorRisk = risk.dimensions?.behavior_risk ?? 0;
    const networkRisk = risk.dimensions?.network_risk ?? 0;
    const anomalyScore = Math.round(behaviorRisk * 0.6 + networkRisk * 0.4);

    const deviations = risk.factors.filter((f) =>
      [
        "behavior_anomaly",
        "device_anomaly",
        "network_risk",
        "suspicious_activity",
        "geographic_anomaly",
        "unusual_login_time",
        "transaction_volume_spike",
      ].includes(f)
    );

    return {
      anomalyScore,
      isAnomaly: anomalyScore >= 40,
      deviations,
    };
  }
}
