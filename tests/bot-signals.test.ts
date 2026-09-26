import { automationFlags } from "../src/signals/device";
import { summarizePointer } from "../src/signals/behavior";

describe("automation environment", () => {
  it("flags webdriver even when other bits are quiet", () => {
    const flags = automationFlags({
      webdriver: true,
      userAgent: "Mozilla/5.0",
      languages: ["en-US"],
      webglRenderer: "ANGLE",
    });
    expect(flags.webdriver).toBe(true);
    expect(flags.automation_framework).toBe(true);
  });

  it("flags headless chrome and swiftshader", () => {
    const flags = automationFlags({
      userAgent: "HeadlessChrome/120",
      languages: ["en"],
      webglRenderer: "Google SwiftShader",
    });
    expect(flags.headless_ua).toBe(true);
    expect(flags.webgl_swiftshader).toBe(true);
    expect(flags.automation_framework).toBe(true);
  });

  it("stays clear for a normal browser snapshot", () => {
    const flags = automationFlags({
      webdriver: false,
      userAgent: "Mozilla/5.0",
      languages: ["en-US"],
      webglRenderer: "ANGLE (NVIDIA)",
      globals: {},
    });
    expect(flags.automation_framework).toBe(false);
  });
});

describe("pointer summary", () => {
  it("treats a straight trail as a straight line", () => {
    const points = [];
    for (let i = 0; i < 12; i++) {
      points.push({ x: i * 10, y: 0, t: i * 16 });
    }
    const summary = summarizePointer(points);
    expect(summary.straightLineRatio).toBeGreaterThan(0.9);
    expect(summary.dx.length).toBeGreaterThanOrEqual(8);
    expect(summary.teleportGaps).toBe(0);
  });

  it("counts a teleport gap", () => {
    const summary = summarizePointer([
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 16 },
      { x: 400, y: 0, t: 20 },
    ]);
    expect(summary.teleportGaps).toBe(1);
  });
});
