import type { EvaluationResponse } from "../src/api/types";
import { startAttachLoop, shouldRemoveParticipant, type CallLoopSampler } from "../src/integrations/meeting";
import { asVoiceWindow, canonicalSampleRate, resampleLinear } from "../src/signals/media";

const allow = {
  session_id: "s",
  human_probability: 0.9,
  deepfake_risk: 0.1,
  integrity_score: 0.9,
  recommendation: "allow",
  reasons: [],
  confidence: 0.8,
  trust_score: { trust_score: 90, confidence: 0.8, status: "trusted", reasons: [] },
  risk_score: { risk_score: 10, level: "low", factors: [], confidence: 0.8, primary_factors: [] },
  explanation: [],
} as EvaluationResponse;

function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const step = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - start > ms) {
        reject(new Error("timed out"));
        return;
      }
      setTimeout(step, 5);
    };
    step();
  });
}

describe("meeting integration", () => {
  it("removes only on block", () => {
    expect(shouldRemoveParticipant("block")).toBe(true);
    expect(shouldRemoveParticipant("allow")).toBe(false);
    expect(shouldRemoveParticipant("verify")).toBe(false);
    expect(shouldRemoveParticipant("review")).toBe(false);
    expect(shouldRemoveParticipant("monitor")).toBe(false);
  });

  it("keeps phone audio at 8000 and a faster mic at 16000", () => {
    expect(canonicalSampleRate(8000)).toBe(8000);
    expect(canonicalSampleRate(48000)).toBe(16000);
    const phone = asVoiceWindow([0.2, -0.2, 0.1, -0.1], 8000);
    expect(phone.sample_rate).toBe(8000);
    expect(phone.audio_pcm).toHaveLength(4);
    expect(phone.audio_energy).toBeGreaterThan(0);
    const fast = resampleLinear([0, 1, 0, -1], 48000, 16000);
    expect(fast.length).toBe(1);
    const window = asVoiceWindow([0.25, -0.25, 0.25, -0.25], 48000, 16000);
    expect(window.sample_rate).toBe(16000);
    expect(window.audio_energy).toBeGreaterThan(0);
  });

  it("posts a short PCM window for the whole sidecar call until stop", async () => {
    const posts: { type: string; data: Record<string, unknown> }[] = [];
    let calls = 0;
    let releaseThird: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseThird = resolve;
    });
    const sampler: CallLoopSampler = {
      async sampleFrame() {
        return null;
      },
      sampleJpeg: () => null,
      virtualCamera: () => false,
      async sampleVoiceWindow() {
        calls += 1;
        if (calls > 2) await held;
        return {
          audio_pcm: [0.2, -0.1, 0.05, 0.2],
          sample_rate: 16000,
          audio_energy: 0.12,
        };
      },
      stop() {
        return undefined;
      },
    };
    const watch = startAttachLoop({
      session: {
        sessionId: "call",
        async trackEvent(type, data) {
          posts.push({ type, data: data ?? {} });
        },
        async evaluate() {
          return allow;
        },
      },
      sampler,
      video: false,
      audio: true,
      intervalMs: 10,
      participantId: "guest_recording",
      platform: "google-meet",
    });

    const voice = () => posts.filter((post) => post.type === "voice_liveness");
    await waitFor(() => voice().length >= 2);
    for (const post of voice()) {
      expect(post.data.sample_rate === 8000 || post.data.sample_rate === 16000).toBe(true);
      expect(typeof post.data.audio_energy).toBe("number");
      expect(Array.isArray(post.data.audio_pcm)).toBe(true);
      expect((post.data.audio_pcm as number[]).length).toBeGreaterThan(1);
    }
    const count = voice().length;
    watch.stop();
    releaseThird();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(voice().length).toBe(count);
    expect(count).toBeGreaterThan(1);
  });
});
