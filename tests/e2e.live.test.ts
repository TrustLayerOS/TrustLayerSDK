/**
 * Live SDK ↔ TrustLayerOS integration. Skipped unless TRUSTLAYER_E2E=1.
 *
 *   TRUSTLAYER_E2E=1 npm test -- tests/e2e.live.test.ts
 *
 * Defaults: API http://127.0.0.1:8080, demo public key.
 */

const E2E = process.env.TRUSTLAYER_E2E === "1";
const API = (process.env.TRUSTLAYER_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const KEY =
  process.env.TRUSTLAYER_PUBLIC_KEY || "tl_public_demodemo12DEADBEEF00000001";

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "X-TrustLayer-SDK": "js/0.1.0-e2e",
  };
  if (path.includes("/events")) {
    headers["X-TrustLayer-Nonce"] =
      globalThis.crypto?.randomUUID?.() ?? `e2e-${Date.now()}-${Math.random()}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

const describeE2E = E2E ? describe : describe.skip;

describeE2E("SDK live against TrustLayerOS", () => {
  jest.setTimeout(60_000);

  it("creates a session, batches events, and evaluates like verifyHuman", async () => {
    const session = await api<{ id: string }>("POST", "/v1/sessions", {
      type: "interview",
      modules: ["bot", "fraud", "anomaly"],
      metadata: { source: "sdk-e2e", scene: "verify_style" },
    });
    expect(session.status).toBeGreaterThanOrEqual(200);
    expect(session.status).toBeLessThan(300);
    expect(session.json.id).toBeTruthy();

    const batch = await api("POST", "/v1/events/batch", {
      events: [
        {
          session_id: session.json.id,
          type: "device_change",
          data: { platform: "node-e2e", webdriver: false },
        },
        {
          session_id: session.json.id,
          type: "typing_pattern",
          data: { wpm: 55, keystroke_variance: 0.4 },
        },
        {
          session_id: session.json.id,
          type: "custom",
          data: { sdk: "js/0.1.0", action: "verifyHuman" },
        },
      ],
    });
    expect(batch.status).toBeGreaterThanOrEqual(200);
    expect(batch.status).toBeLessThan(300);

    const ev = await api<{
      recommendation: string;
      human_probability?: number;
      modules?: Record<string, unknown>;
    }>("POST", "/v1/evaluate", {
      session_id: session.json.id,
      modules: ["bot", "fraud", "anomaly"],
    });
    expect(ev.status).toBe(200);
    expect(ev.json.recommendation).toBeTruthy();
    expect(["allow", "review", "deny", "block", "challenge"]).toContain(
      ev.json.recommendation
    );
  });

  it("logs agent interaction and keeps agent unauthorized", async () => {
    const session = await api<{ id: string }>("POST", "/v1/sessions", {
      type: "agent",
      modules: ["agent", "bot", "spam"],
      metadata: { source: "sdk-e2e", scene: "agent" },
    });
    expect(session.json.id).toBeTruthy();

    await api("POST", "/v1/events", {
      session_id: session.json.id,
      type: "custom",
      data: { agent_id: "agt_sdk_e2e", action: "export", page: "/admin" },
    });
    await api("POST", "/v1/events", {
      session_id: session.json.id,
      type: "suspicious_activity",
      data: { permission_violation: "export_users", scope_exceeded: true },
    });

    const ev = await api<{
      recommendation: string;
      modules?: { agent?: { is_authorized?: boolean } };
    }>("POST", "/v1/evaluate", {
      session_id: session.json.id,
      modules: ["agent", "bot", "spam"],
    });
    expect(ev.status).toBe(200);
    expect(ev.json.recommendation).toBeTruthy();
    if (ev.json.modules?.agent && "is_authorized" in ev.json.modules.agent) {
      expect(ev.json.modules.agent.is_authorized).toBe(false);
    }
  });

  it("logs automation / hack-style bot signals", async () => {
    const session = await api<{ id: string }>("POST", "/v1/sessions", {
      type: "user_verification",
      modules: ["bot"],
      metadata: { source: "sdk-e2e", scene: "bot" },
    });
    await api("POST", "/v1/events", {
      session_id: session.json.id,
      type: "suspicious_activity",
      data: { automation_framework: true, webdriver: true },
    });
    await api("POST", "/v1/events", {
      session_id: session.json.id,
      type: "mouse_activity",
      data: { velocity_variance: 0.01, robotic: true, straight_line_ratio: 0.98 },
    });
    const ev = await api<{ recommendation: string }>("POST", "/v1/evaluate", {
      session_id: session.json.id,
      modules: ["bot"],
    });
    expect(ev.status).toBe(200);
    expect(ev.json.recommendation).toBeTruthy();

    const listed = await api<{ count: number }>(
      "GET",
      `/v1/sessions/${session.json.id}/events`
    );
    expect(listed.status).toBe(200);
    expect(listed.json.count).toBeGreaterThanOrEqual(2);
  });

  it("posts voice_liveness for deepfake / voice clone path", async () => {
    const sampleRate = 16000;
    const pcm = Array.from({ length: sampleRate * 0.25 }, (_, i) =>
      Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.2
    );
    const session = await api<{ id: string }>("POST", "/v1/sessions", {
      type: "interview",
      modules: ["deepfake", "bot"],
      metadata: { source: "sdk-e2e", scene: "voice" },
    });
    const event = await api("POST", "/v1/events", {
      session_id: session.json.id,
      type: "voice_liveness",
      data: {
        consent: true,
        audio_pcm: pcm,
        sample_rate: sampleRate,
        audio_energy: 0.1,
      },
    });
    expect(event.status).toBeGreaterThanOrEqual(200);
    expect(event.status).toBeLessThan(300);

    const ev = await api<{ recommendation: string; deepfake_risk?: number }>(
      "POST",
      "/v1/evaluate",
      { session_id: session.json.id, modules: ["deepfake", "bot"] }
    );
    expect(ev.status).toBe(200);
    expect(ev.json.recommendation).toBeTruthy();
  });
});
