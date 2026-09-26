import type { SessionType } from "./config";
import type { Threat } from "./check";

/** Product surfaces that share one check() call. */
export type HumanPreset = "signup" | "login" | "call" | "payment" | "review";

export interface PresetPlan {
  preset: HumanPreset;
  threats: Threat[];
  type: SessionType;
  /** Camera and microphone. Signup, login, payment, and review stay behavior-only. */
  media: boolean;
  /** Ask for a platform passkey when the browser supports WebAuthn. */
  passkey: boolean;
  label: string;
}

export const HUMAN_PRESETS: Record<HumanPreset, PresetPlan> = {
  signup: {
    preset: "signup",
    threats: ["bot", "fraud"],
    type: "user_verification",
    media: false,
    passkey: false,
    label: "Signup",
  },
  login: {
    preset: "login",
    threats: ["bot", "fraud"],
    type: "authentication",
    media: false,
    passkey: true,
    label: "Login",
  },
  call: {
    preset: "call",
    threats: ["human"],
    type: "interview",
    media: true,
    passkey: false,
    label: "Call",
  },
  payment: {
    preset: "payment",
    threats: ["fraud", "bot", "anomaly"],
    type: "transaction",
    media: false,
    passkey: true,
    label: "Payment",
  },
  review: {
    preset: "review",
    threats: ["spam", "bot"],
    type: "user_verification",
    media: false,
    passkey: false,
    label: "Review",
  },
};

export function planForPreset(preset: HumanPreset): PresetPlan {
  const plan = HUMAN_PRESETS[preset];
  if (!plan) {
    throw new Error(`unknown preset: ${preset}`);
  }
  return plan;
}
