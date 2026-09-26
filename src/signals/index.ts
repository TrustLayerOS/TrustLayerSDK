export { collectDeviceSignals, collectAutomationFlags, automationFlags, type DeviceSignals, type AutomationFlags } from "./device";
export { installHoneypot } from "./honeypot";
export { summarizePointer, type PathSummary } from "./behavior";
export { BehaviorCollector, type BehaviorSignals } from "./behavior";
export { collectNetworkSignals, type NetworkSignals } from "./network";
export { collectIdentitySignals, type IdentitySignals } from "./identity";
export {
  extractFrameFeatures,
  extractAudioFeatures,
  createMediaSampler,
  createMediaSamplerFrom,
  motionFromFrames,
  motionFromSequence,
  frameDigest,
  screenEdgeEnergy,
  isBrowser,
  type FrameSample,
  type MotionSummary,
  type LivenessChallenge,
  type MediaSource,
} from "./media";

import { collectDeviceSignals, DeviceSignals } from "./device";
import { collectNetworkSignals, NetworkSignals } from "./network";
import { collectIdentitySignals, IdentitySignals } from "./identity";

export interface AllSignals {
  device: DeviceSignals;
  network: NetworkSignals;
  identity: IdentitySignals;
  collectedAt: string;
}

/**
 * Collects all available signals in parallel.
 */
export async function collectAllSignals(): Promise<AllSignals> {
  const [device, network] = await Promise.all([
    collectDeviceSignals(),
    collectNetworkSignals(),
  ]);

  const identity = collectIdentitySignals();

  return {
    device,
    network,
    identity,
    collectedAt: new Date().toISOString(),
  };
}
