import { modulesForThreats, sessionTypeForThreats, needsMedia } from "../src/check";
import { HUMAN_PRESETS } from "../src/presets";

describe("threat presets", () => {
  it("maps human to the live-call modules", () => {
    expect(modulesForThreats(["human"])).toEqual(["interview", "deepfake", "bot"]);
  });

  it("maps voice and video to deepfake + bot", () => {
    expect(modulesForThreats(["voice"])).toEqual(["deepfake", "bot"]);
    expect(modulesForThreats(["video"])).toEqual(["deepfake", "bot"]);
  });

  it("maps agent, spam, fraud without forcing a camera", () => {
    expect(modulesForThreats(["agent"])).toEqual(["agent", "bot"]);
    expect(modulesForThreats(["spam"])).toEqual(["spam"]);
    expect(modulesForThreats(["fraud"])).toEqual(["fraud", "anomaly"]);
    expect(needsMedia(["spam"])).toBe(false);
    expect(needsMedia(["agent"])).toBe(false);
    expect(needsMedia(["voice"])).toBe(true);
  });

  it("covers signup login call payment and review without forcing a camera except call", () => {
    expect(HUMAN_PRESETS.signup.media).toBe(false);
    expect(HUMAN_PRESETS.login.passkey).toBe(true);
    expect(HUMAN_PRESETS.login.type).toBe("authentication");
    expect(HUMAN_PRESETS.call.media).toBe(true);
    expect(HUMAN_PRESETS.call.threats).toEqual(["human"]);
    expect(HUMAN_PRESETS.payment.type).toBe("transaction");
    expect(HUMAN_PRESETS.review.threats).toContain("spam");
    expect(needsMedia(HUMAN_PRESETS.signup.threats)).toBe(false);
  });

  it("picks session types integrators already have", () => {
    expect(sessionTypeForThreats(["agent"])).toBe("agent");
    expect(sessionTypeForThreats(["fraud"])).toBe("transaction");
    expect(sessionTypeForThreats(["spam"])).toBe("user_verification");
    expect(sessionTypeForThreats(["human"])).toBe("interview");
  });
});
