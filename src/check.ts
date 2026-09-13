import type { SessionType, TrustModule } from "./config";

/** What the integrator is trying to stop. Maps to evaluate modules. */
export type Threat =
  | "human"
  | "voice"
  | "video"
  | "deepfake"
  | "bot"
  | "spam"
  | "agent"
  | "fraud"
  | "anomaly"
  | "ai";

export function modulesForThreats(threats: Threat[]): TrustModule[] {
  const set = new Set<TrustModule>();
  const list = threats.length > 0 ? threats : (["human"] as Threat[]);
  for (const t of list) {
    switch (t) {
      case "human":
        set.add("interview");
        set.add("deepfake");
        set.add("bot");
        break;
      case "voice":
      case "video":
      case "deepfake":
        set.add("deepfake");
        set.add("bot");
        break;
      case "bot":
        set.add("bot");
        break;
      case "spam":
        set.add("spam");
        break;
      case "agent":
        set.add("agent");
        set.add("bot");
        break;
      case "fraud":
        set.add("fraud");
        set.add("anomaly");
        break;
      case "anomaly":
        set.add("anomaly");
        break;
      case "ai":
        set.add("interview");
        set.add("spam");
        set.add("bot");
        break;
    }
  }
  return [...set];
}

export function sessionTypeForThreats(threats: Threat[]): SessionType {
  if (threats.includes("agent")) return "agent";
  if (threats.includes("fraud")) return "transaction";
  if (threats.includes("spam") && !threats.includes("human") && !threats.includes("deepfake")) {
    return "user_verification";
  }
  return "interview";
}

export function needsMedia(threats: Threat[]): boolean {
  return threats.some((t) =>
    t === "human" || t === "voice" || t === "video" || t === "deepfake"
  );
}
