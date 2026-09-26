import { TrustLayer } from "../client";
import type { EvaluationResponse } from "../api/types";
import { modulesForThreats } from "../check";
import { planForPreset, type HumanPreset } from "../presets";

export interface MobileClientOptions {
  apiKey: string;
  apiUrl?: string;
}

export interface MobileCheckOptions {
  preset: HumanPreset;
  userId?: string;
  text?: string;
  imageB64?: string;
  audioPcm?: number[];
  /**
   * Native app already completed WebAuthn / platform passkey.
   * challengeId must come from passkeyChallenge().
   */
  passkey?: { challengeId: string; credentialId: string };
}

/**
 * Headless client for a React Native or WebView shell.
 * It posts the same session, event, and evaluate calls as the browser SDK.
 * Pass image_b64 or PCM from the native camera instead of getUserMedia.
 */
export function createMobileClient(options: MobileClientOptions) {
  const tl = TrustLayer.initialize({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    signalCollection: {
      device: false,
      behavior: false,
      network: false,
      identity: false,
    },
  });

  return {
    plan(preset: HumanPreset) {
      return planForPreset(preset);
    },

    async check(input: MobileCheckOptions): Promise<EvaluationResponse> {
      const plan = planForPreset(input.preset);
      const modules = modulesForThreats(plan.threats);
      const session = await tl.createSession({
        type: plan.type,
        userId: input.userId,
        modules,
        metadata: { surface: "mobile", preset: input.preset },
      });
      if (input.text) {
        await session.trackEvent("custom", {
          signal_type: "message",
          message_content: input.text,
        });
      }
      if (input.passkey?.challengeId) {
        await session.trackEvent("passkey_verified", {
          challenge_id: input.passkey.challengeId,
          credential_id: input.passkey.credentialId,
          platform: "mobile",
        });
      }
      if (input.imageB64) {
        await session.trackEvent("face_frame", {
          image_b64: input.imageB64,
          consent: true,
        });
      }
      if (input.audioPcm && input.audioPcm.length > 0) {
        await session.trackEvent("voice_liveness", {
          audio_pcm: input.audioPcm,
          consent: true,
        });
      }
      return session.evaluate(modules);
    },

    async passkeyChallenge(sessionId: string) {
      const session = await tl.getSession(sessionId);
      return session.issuePasskeyChallenge();
    },
  };
}
