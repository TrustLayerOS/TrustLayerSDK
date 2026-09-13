import { assertRecentAllow, requireHuman } from "../src/middleware";

const allowBody = {
  session_id: "sess_ok",
  human_probability: 0.92,
  deepfake_risk: 0.05,
  integrity_score: 88,
  recommendation: "allow",
  reasons: [],
  confidence: 0.8,
  trust_score: { trust_score: 88, confidence: 0.8, status: "trusted", reasons: [] },
  risk_score: { risk_score: 10, level: "low", factors: [], confidence: 0.8, primary_factors: [] },
  explanation: [],
};

describe("assertRecentAllow", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("allows a recent session with recommendation allow", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/sessions/")) {
        return new Response(
          JSON.stringify({
            id: "sess_ok",
            status: "active",
            created_at: new Date().toISOString(),
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(allowBody), { status: 200 });
    }) as typeof fetch;

    const result = await assertRecentAllow({
      apiKey: "tl_secret_test",
      apiUrl: "http://os.test",
      sessionId: "sess_ok",
    });
    expect(result.ok).toBe(true);
  });

  it("blocks recommendation verify", async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/sessions/")) {
        return new Response(
          JSON.stringify({
            id: "sess_v",
            status: "active",
            created_at: new Date().toISOString(),
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ ...allowBody, recommendation: "verify" }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await assertRecentAllow({
      apiKey: "tl_secret_test",
      apiUrl: "http://os.test",
      sessionId: "sess_v",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("verify");
  });
});

describe("requireHuman", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("401 when the session header is missing", async () => {
    const mw = requireHuman({ apiKey: "tl_secret_test", apiUrl: "http://os.test" });
    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return body;
      },
    };
    await mw({ headers: {} }, res, () => {
      throw new Error("should not next");
    });
    expect(res.statusCode).toBe(401);
  });
});
