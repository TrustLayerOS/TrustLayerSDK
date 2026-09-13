import { modulesForThreats, sessionTypeForThreats, needsMedia } from "../src/check";

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

  it("picks session types integrators already have", () => {
    expect(sessionTypeForThreats(["agent"])).toBe("agent");
    expect(sessionTypeForThreats(["fraud"])).toBe("transaction");
    expect(sessionTypeForThreats(["spam"])).toBe("user_verification");
    expect(sessionTypeForThreats(["human"])).toBe("interview");
  });
});
