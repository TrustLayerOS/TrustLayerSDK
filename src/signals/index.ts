export { collectDeviceSignals, type DeviceSignals } from "./device";
export { BehaviorCollector, type BehaviorSignals } from "./behavior";
export { collectNetworkSignals, type NetworkSignals } from "./network";
export { collectIdentitySignals, type IdentitySignals } from "./identity";
export {
  extractFrameFeatures,
  extractAudioFeatures,
  createMediaSampler,
  motionFromFrames,
  isBrowser,
  type FrameSample,
  type MotionSummary,
  type LivenessChallenge,
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
