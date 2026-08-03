import { TrustSession } from "../session";
import { RiskScoreResponse } from "../api/types";

export interface BotAnalysisResult {
  botProbability: number;
  humanProbability: number;
  isBot: boolean;
  confidence: number;
  signals: string[];
}

/**
 * BotShield — detects automated/bot behavior in a session.
 */
export class BotShield {
  constructor(private readonly session: TrustSession) {}

  /**
   * Analyzes the session for bot signals and returns a probability assessment.
   */
  async analyze(): Promise<BotAnalysisResult> {
    const risk: RiskScoreResponse = await this.session.getRiskScore();

    // Derive bot probability from behavior risk dimension
    const behaviorRisk = risk.dimensions?.behavior_risk ?? risk.risk_score;
    const botProbability = Math.min(1.0, behaviorRisk / 100);
    const humanProbability = 1.0 - botProbability;
    const isBot = botProbability >= 0.6;

    // Extract relevant bot signals from risk factors
    const signals = risk.factors.filter((f) =>
      [
        "behavior_anomaly",
        "automation_framework_detected",
        "no_mouse_activity",
        "robotic_mouse_movement",
        "automated_typing_pattern",
        "perfect_typing_cadence",
        "uniform_mouse_velocity",
        "superhuman_typing_speed",
      ].includes(f)
    );

    const confidence = risk.confidence;

    return {
      botProbability: Math.round(botProbability * 1000) / 1000,
      humanProbability: Math.round(humanProbability * 1000) / 1000,
      isBot,
      confidence,
      signals,
    };
  }
}
