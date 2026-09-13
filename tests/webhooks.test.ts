import { signRequest, verifyWebhookSignature } from "../src/crypto/signing";

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "session.completed", data: { session_id: "sess_1" } });

  it("accepts HMAC of timestamp + '.' + body", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hex = await signRequest(`${timestamp}.${payload}`, secret);
    const ok = await verifyWebhookSignature(payload, `sha256=${hex}`, secret, timestamp);
    expect(ok).toBe(true);
  });

  it("rejects a body-only signature (the old SDK bug)", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hex = await signRequest(payload, secret);
    const ok = await verifyWebhookSignature(payload, `sha256=${hex}`, secret, timestamp);
    expect(ok).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 1000);
    const hex = await signRequest(`${timestamp}.${payload}`, secret);
    const ok = await verifyWebhookSignature(payload, `sha256=${hex}`, secret, timestamp, 300);
    expect(ok).toBe(false);
  });

  it("rejects a missing timestamp", async () => {
    const ok = await verifyWebhookSignature(payload, "sha256=abcd", secret, "");
    expect(ok).toBe(false);
  });
});
