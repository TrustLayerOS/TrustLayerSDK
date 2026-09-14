import { TrustSession } from "../session";
import { extractAudioFeatures, extractFrameFeatures, type FrameSample } from "../signals/media";
import type { EvaluationResponse } from "../api/types";

export interface DeepfakeVideoResult {
  deepfakeProbability: number;
  confidence: number;
  status: "likely_real" | "suspicious" | "likely_deepfake";
  reasons?: string[];
}

export interface DeepfakeAudioResult {
  syntheticProbability: number;
  confidence: number;
  reasons?: string[];
}

/**
 * DeepfakeShield — sends forensic frame/audio features to TrustLayerOS.
 */
export class DeepfakeShield {
  constructor(private readonly session: TrustSession) {}

  /**
   * Analyze a video frame. Pass ImageData, a FrameSample, or a precomputed feature vector.
   */
  async analyzeVideoFrame(
    frameData: ImageData | FrameSample | number[] | string
  ): Promise<DeepfakeVideoResult> {
    const features = toVideoFeatures(frameData);

    await this.session.trackEvent("face_frame", {
      analysis_type: "video",
      ml_features: features,
      frame_analyzed: true,
    });

    const evaluation = await this.session.evaluate(["deepfake", "interview", "bot"]);
    const df = evaluation.modules?.deepfake;
    const prob = df?.deepfake_probability ?? evaluation.deepfake_risk ?? 0;

    return {
      deepfakeProbability: Math.round(prob * 1000) / 1000,
      confidence: df?.confidence ?? evaluation.confidence,
      status:
        (df?.status as DeepfakeVideoResult["status"]) ??
        (prob < 0.2 ? "likely_real" : prob < 0.6 ? "suspicious" : "likely_deepfake"),
      reasons: df?.reasons ?? evaluation.reasons,
    };
  }

  /**
   * Analyze PCM / analyser audio. Pass a feature vector from extractAudioFeatures,
   * or a Float32Array time-domain buffer.
   */
  async analyzeAudio(
    audio: number[] | Float32Array
  ): Promise<DeepfakeAudioResult> {
    const features = Array.isArray(audio)
      ? audio
      : extractAudioFeatures(audio);

    await this.session.trackEvent("voice_liveness", {
      ml_features: features,
      analysis_type: "audio",
    });
    await this.session.trackEvent("voice_clone_risk", {
      ml_features: features,
      analysis_type: "audio",
    });

    const evaluation = await this.session.evaluate(["deepfake"]);
    const df = evaluation.modules?.deepfake;
    const synthetic = df?.voice_clone_risk ?? df?.deepfake_probability ?? evaluation.deepfake_risk ?? 0;

    return {
      syntheticProbability: Math.round(synthetic * 1000) / 1000,
      confidence: df?.confidence ?? evaluation.confidence,
      reasons: df?.reasons ?? evaluation.reasons,
    };
  }
}

function toVideoFeatures(
  frameData: ImageData | FrameSample | number[] | string
): number[] {
  if (Array.isArray(frameData)) {
    return frameData;
  }
  if (typeof frameData === "string") {
    throw new Error(
      "data-URL frame stubs are not accepted — pass ImageData, FrameSample, or a real feature vector"
    );
  }
  const sample: FrameSample = {
    width: frameData.width,
    height: frameData.height,
    data: frameData.data as Uint8ClampedArray,
    timestamp: Date.now(),
  };
  return extractFrameFeatures(sample);
}

export type { EvaluationResponse };
