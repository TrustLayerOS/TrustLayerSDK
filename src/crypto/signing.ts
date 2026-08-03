/**
 * HMAC-SHA256 request signing using the Web Crypto API.
 * Works in both browser and Node.js (v18+).
 */

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs a payload with HMAC-SHA256.
 * Returns the hex-encoded signature.
 */
export async function signRequest(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await getKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return bufferToHex(signatureBuffer);
}

/**
 * Verifies a webhook signature sent by TrustLayerOS.
 * The signature header value is: sha256=<hex>
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const hexSig = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const encoder = new TextEncoder();
  const key = await getKey(secret);
  const expectedBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const expected = bufferToHex(expectedBuffer);

  // Constant-time comparison
  return timingSafeEqual(expected, hexSig);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
