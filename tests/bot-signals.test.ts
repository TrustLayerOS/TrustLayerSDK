import { automationFlags } from "../src/signals/device";
import { summarizePointer } from "../src/signals/behavior";
import { flowEnergy, frameDigest, looksVirtual, mouthBandEnergy, screenEdgeEnergy, signalEnergy } from "../src/signals/media";
import { SpamShield } from "../src/modules/spam";
import { AgentShield } from "../src/modules/agent";

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

describe("capture label", () => {
  it("notices a virtual camera name", () => {
    expect(looksVirtual("OBS Virtual Camera")).toBe(true);
    expect(looksVirtual("FaceTime HD Camera")).toBe(false);
  });
});

describe("spam and agent shields", () => {
  it("exports the shield classes", () => {
    expect(typeof SpamShield).toBe("function");
    expect(typeof AgentShield).toBe("function");
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

describe("screen injection cues", () => {
  it("gives identical frames the same digest", () => {
    const data = new Uint8Array(16 * 16 * 4).fill(40);
    expect(frameDigest(data, 16, 16)).toBe(frameDigest(data, 16, 16));
    const other = new Uint8Array(data);
    other[0] = 200;
    expect(frameDigest(other, 16, 16)).not.toBe(frameDigest(data, 16, 16));
  });

  it("raises screen-edge energy on a flickering top row", () => {
    const width = 64;
    const height = 8;
    const data = new Uint8Array(width * height * 4);
    for (let x = 0; x < width; x++) {
      const v = x % 2 === 0 ? 255 : 0;
      const i = x * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    expect(screenEdgeEnergy(data, width, height)).toBeGreaterThanOrEqual(0.65);
    expect(screenEdgeEnergy(new Uint8Array(width * height * 4), width, height)).toBe(0);
  });

  it("reads a still window as zero flow and a changed window as motion", () => {
    const still = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(40), timestamp: 1 };
    expect(flowEnergy(still, still)).toBe(0);
    const moved = { ...still, data: new Uint8ClampedArray(still.data) };
    moved.data[0] = 255;
    expect(flowEnergy(still, moved)).toBeGreaterThan(0);
    expect(mouthBandEnergy(still, moved)).toBeGreaterThanOrEqual(0);
    expect(signalEnergy([0, 0, 0])).toBe(0);
    expect(signalEnergy([1, -1])).toBeGreaterThan(0.5);
  });
});
