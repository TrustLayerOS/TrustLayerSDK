import { TrustSession } from "../session";

export interface DeepfakeVideoResult {
  deepfakeProbability: number;
  confidence: number;
  status: "likely_real" | "suspicious" | "likely_deepfake";
}

export interface DeepfakeAudioResult {
  syntheticProbability: number;
  confidence: number;
}

/**
 * DeepfakeShield — detects synthetic or manipulated media.
 */
export class DeepfakeShield {
  constructor(private readonly session: TrustSession) {}

  /**
   * Analyzes a video frame for deepfake signals.
   * Pass an ImageData object or a base64-encoded JPEG string.
   *
   * The frame features are extracted client-side and sent as signals
   * to TrustLayerOS for ML inference.
   */
  async analyzeVideoFrame(
    frameData: ImageData | string
  ): Promise<DeepfakeVideoResult> {
    const features = extractFrameFeatures(frameData);

    // Send features to TrustLayerOS as a deepfake event
    await this.session.trackEvent("deepfake_detected", {
      analysis_type: "video",
      ml_features: features,
      frame_analyzed: true,
    });

    // The actual ML inference runs server-side; get result via risk score
    const risk = await this.session.getRiskScore();
    const contentRisk = risk.dimensions?.content_risk ?? 0;
    const prob = contentRisk / 100;

    return {
      deepfakeProbability: Math.round(prob * 1000) / 1000,
      confidence: risk.confidence,
      status:
        prob < 0.2 ? "likely_real" : prob < 0.6 ? "suspicious" : "likely_deepfake",
    };
  }

  /**
   * Analyzes audio features for synthetic speech indicators.
   */
  async analyzeAudio(
    audioFeatures: number[]
  ): Promise<DeepfakeAudioResult> {
    await this.session.trackEvent("voice_verified", {
      ml_features: audioFeatures,
      analysis_type: "audio",
    });

    const risk = await this.session.getRiskScore();
    const contentRisk = risk.dimensions?.content_risk ?? 0;
    const syntheticProb = contentRisk / 100;

    return {
      syntheticProbability: Math.round(syntheticProb * 1000) / 1000,
      confidence: risk.confidence,
    };
  }
}

/**
 * Extracts lightweight feature vector from video frame data.
 * Returns a compact representation suitable for ML inference.
 */
function extractFrameFeatures(frameData: ImageData | string): number[] {
  if (typeof frameData === "string") {
    // Base64 string — derive features from length and content hash
    const hash = simpleHash(frameData);
    return [
      frameData.length / 10000,
      (hash & 0xff) / 255,
      ((hash >> 8) & 0xff) / 255,
      ((hash >> 16) & 0xff) / 255,
    ];
  }

  // ImageData — compute basic statistics over pixel values
  const data = frameData.data;
  const pixels = data.length / 4;
  let rSum = 0, gSum = 0, bSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }

  const rMean = rSum / pixels / 255;
  const gMean = gSum / pixels / 255;
  const bMean = bSum / pixels / 255;

  return [rMean, gMean, bMean, frameData.width / 1920, frameData.height / 1080];
}

function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(s.length, 1000); i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
