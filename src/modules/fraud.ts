import { TrustSession } from "../session";
import { EvaluationResponse } from "../api/types";

export interface FraudEvaluationContext {
  transactionAmount?: number;
  transactionCurrency?: string;
  userId?: string;
  transactionId?: string;
}

export interface FraudResult {
  fraudProbability: number;
  riskScore: number;
  recommendation: "allow" | "review" | "block";
  factors: string[];
}

/**
 * FraudShield — detects fraud signals in a session.
 */
export class FraudShield {
  constructor(private readonly session: TrustSession) {}

  /**
   * Evaluates fraud risk for the current session, optionally enriched
   * with transaction context.
   */
  async evaluate(context?: FraudEvaluationContext): Promise<FraudResult> {
    if (context?.transactionAmount !== undefined) {
      await this.session.trackEvent("custom", {
        signal_type: "transaction",
        amount: context.transactionAmount,
        currency: context.transactionCurrency ?? "USD",
        transaction_id: context.transactionId,
        user_id: context.userId,
      });
    }

    const evaluation: EvaluationResponse = await this.session.evaluate();

    const risk = evaluation.risk_score.risk_score;
    const factors = evaluation.risk_score.factors;

    // Compute fraud probability from risk score
    const fraudProbability = Math.round((risk / 100) * 1000) / 1000;

    let recommendation: "allow" | "review" | "block";
    if (evaluation.recommendation === "block") {
      recommendation = "block";
    } else if (
      evaluation.recommendation === "verify" ||
      evaluation.recommendation === "review"
    ) {
      recommendation = "review";
    } else {
      recommendation = "allow";
    }

    return {
      fraudProbability,
      riskScore: risk,
      recommendation,
      factors,
    };
  }

  /**
   * Tags a transaction ID to the session for tracking.
   */
  async monitorTransaction(transactionId: string): Promise<void> {
    await this.session.trackEvent("custom", {
      signal_type: "transaction_monitor",
      transaction_id: transactionId,
      monitored_at: new Date().toISOString(),
    });
  }
}
