/**
 * Join a call your app is allowed to host, then score the local stream.
 *
 * Supported: Zoom Video SDK, Daily, LiveKit, Twilio Video, any WebRTC MediaStream.
 * Not supported from a random page: meet.google.com and the Zoom desktop app.
 * For those, open examples/meeting-sidecar.html or run a bot that captures an
 * authorized stream and passes it here.
 */
import TrustLayer, { attachToCall, type MediaSource } from "../src/index";

const tl = TrustLayer.initialize({
  apiKey: process.env.TRUSTLAYER_PUBLIC_KEY || "tl_public_demodemo12DEADBEEF00000001",
  apiUrl: process.env.TRUSTLAYER_API_URL || "http://127.0.0.1:8080",
});

export async function watchZoomVideoSdkTrack(track: MediaStreamTrack) {
  const session = await tl.createSession({ type: "interview", modules: ["interview", "deepfake", "bot"] });
  return attachToCall({
    session,
    source: new MediaStream([track]),
    platform: "zoom",
    consent: true,
  });
}

export async function watchDailyTrack(track: MediaStreamTrack) {
  const session = await tl.createSession({ type: "interview" });
  return attachToCall({ session, source: new MediaStream([track]), platform: "daily", consent: true });
}

export async function watchLiveKitTrack(track: MediaStreamTrack) {
  const session = await tl.createSession({ type: "interview" });
  return attachToCall({ session, source: new MediaStream([track]), platform: "livekit", consent: true });
}

export async function watchTwilioTrack(track: MediaStreamTrack) {
  const session = await tl.createSession({ type: "interview" });
  return attachToCall({ session, source: new MediaStream([track]), platform: "twilio", consent: true });
}

export async function watchSidecarFile(source: MediaSource) {
  const session = await tl.createSession({ type: "interview" });
  return attachToCall({ session, source, platform: "generic", consent: true });
}
