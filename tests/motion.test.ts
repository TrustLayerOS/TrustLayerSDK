import { motionFromSequence, type FrameSample } from "../src/signals/media";

function frame(fill: number): FrameSample {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { width: 8, height: 8, data, timestamp: 0 };
}

describe("multi-frame liveness motion", () => {
  it("records a path across three frames", () => {
    const motion = motionFromSequence([frame(10), frame(80), frame(140)]);
    expect(motion.frame_count).toBe(3);
    expect(motion.path_energy).toBeGreaterThan(0.004);
  });

  it("a repeated still has no path", () => {
    const still = frame(40);
    const motion = motionFromSequence([still, still, still]);
    expect(motion.frame_count).toBe(3);
    expect(motion.path_energy).toBe(0);
  });
});
