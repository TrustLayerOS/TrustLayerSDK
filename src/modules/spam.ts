import { TrustSession } from "../session";
import { EvaluationResponse } from "../api/types";

export interface SpamShieldResult {
  spamProbability: number;
  isSpam: boolean;
  signals: string[];
  recommendation: EvaluationResponse["recommendation"];
}

/**
 * SpamShield posts the text, then asks evaluate for the spam module.
 */
export class SpamShield {
  constructor(private readonly session: TrustSession) {}

  async evaluate(text: string): Promise<SpamShieldResult> {
    await this.session.trackEvent("custom", {
      signal_type: "message",
      message_content: text,
    });
    const evaluation = await this.session.evaluate(["spam", "bot"]);
    const spam = evaluation.modules?.spam;
    return {
      spamProbability: spam?.spam_probability ?? 0,
      isSpam: Boolean(spam?.is_spam),
      signals: spam?.signals ?? [],
      recommendation: evaluation.recommendation,
    };
  }
}
