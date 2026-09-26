import { TrustSession } from "../session";
import { EvaluationResponse } from "../api/types";

export interface AgentShieldResult {
  trustScore: number;
  behaviorRisk: number;
  signals: string[];
  recommendation: EvaluationResponse["recommendation"];
}

/**
 * AgentShield posts an agent id and evaluates the agent module.
 * A self-declared id is not authorization.
 */
export class AgentShield {
  constructor(private readonly session: TrustSession) {}

  async evaluate(agentId: string, ownerOrg?: string): Promise<AgentShieldResult> {
    await this.session.trackEvent("custom", {
      agent_id: agentId,
      owner_org: ownerOrg,
    });
    const evaluation = await this.session.evaluate(["agent", "bot", "spam"]);
    const agent = evaluation.modules?.agent;
    return {
      trustScore: agent?.trust_score ?? 0,
      behaviorRisk: agent?.behavior_risk ?? 0,
      signals: agent?.signals ?? [],
      recommendation: evaluation.recommendation,
    };
  }
}
