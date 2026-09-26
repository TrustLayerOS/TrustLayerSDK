/**
 * React Native / WebView shell.
 * Native camera frames are imageB64. Native passkeys use passkeyChallenge()
 * then check({ passkey }). This is the mobile contract; it is not a Swift or Kotlin UI kit.
 */
import { createMobileClient } from "../src/mobile";

const mobile = createMobileClient({
  apiKey: process.env.TRUSTLAYER_PUBLIC_KEY || "tl_public_demodemo12DEADBEEF00000001",
  apiUrl: process.env.TRUSTLAYER_API_URL || "http://127.0.0.1:8080",
});

export async function checkLogin(userId: string) {
  return mobile.check({ preset: "login", userId });
}

export async function checkCallFrame(userId: string, imageB64: string) {
  return mobile.check({ preset: "call", userId, imageB64 });
}
