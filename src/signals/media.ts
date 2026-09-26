/**
 * Camera / microphone capture and forensic feature extraction.
 *
 * Features are compact floats sent to TrustLayerOS — not raw video.
 * Browser-only; no-ops / throws in Node.
 */

export type LivenessChallenge = "look_left" | "look_right" | "blink" | "speak_digits";

export interface FrameSample {
  width: number;
  height: number;
  /** RGBA pixels */
  data: Uint8ClampedArray;
  timestamp: number;
}

export interface MotionSummary {
  left_right_delta: number;
  blink_delta: number;
  temporal_energy: number;
  /** Frames sampled during the challenge. A still is 1. */
  frame_count?: number;
  /** Sum of frame-to-frame energy. A frozen photo stays near 0. */
  path_energy?: number;
}

export type MediaSource = MediaStream | HTMLVideoElement | HTMLAudioElement;

export interface MediaSampler {
  start(opts?: { audio?: boolean; video?: boolean }): Promise<void>;
  sampleFrame(): Promise<FrameSample | null>;
  sampleJpeg(quality?: number): string | null;
  sampleAudio(durationMs?: number): Promise<number[] | null>;
  /** RMS of the last sampleAudio window. 0 until a sample exists. */
  lastAudioEnergy(): number;
  /** True when the video track label looks like a virtual camera. */
  virtualCamera(): boolean;
  stop(): void;
}

export function looksVirtual(label: string): boolean {
  return /virtual|obs|manycam|snap camera|vcam|mmhmm/i.test(label);
}

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isMediaStream(value: unknown): value is MediaStream {
  return typeof MediaStream !== "undefined" && value instanceof MediaStream;
}

function captureElementStream(el: HTMLMediaElement): MediaStream | null {
  const withCapture = el as HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  try {
    return withCapture.captureStream?.() ?? withCapture.mozCaptureStream?.() ?? null;
  } catch {
    return null;
  }
}

function drawSource(
  source: HTMLVideoElement | HTMLAudioElement | null
): HTMLVideoElement | null {
  return source instanceof HTMLVideoElement ? source : null;
}

/**
 * Open the local camera / mic. Stops tracks when `stop()` is called.
 */
export async function createMediaSampler(): Promise<MediaSampler> {
  return createMediaSamplerFrom(undefined);
}

/**
 * Sample an existing Meet / Zoom / LiveKit / file stream without calling
 * getUserMedia. Does **not** stop the caller's tracks on `stop()`.
 */
export async function createMediaSamplerFrom(
  source?: MediaSource
): Promise<MediaSampler> {
  if (!isBrowser()) {
    throw new Error("camera_unavailable");
  }

  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | HTMLAudioElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ownsStream = false;
  let audioEnergy = 0;
  let createdVideo = false;

  return {
    async start(opts = { audio: true, video: true }) {
      if (source === undefined) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("camera_unavailable");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: opts.video === false ? false : { facingMode: "user", width: 640, height: 480 },
          audio: opts.audio !== false,
        });
        ownsStream = true;
      } else if (isMediaStream(source)) {
        stream = source;
      } else {
        video = source;
        if (source instanceof HTMLVideoElement && source.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const ok = () => resolve();
            const err = () => reject(new Error("media_not_ready"));
            source.addEventListener("loadeddata", ok, { once: true });
            source.addEventListener("error", err, { once: true });
          });
        }
        stream =
          (isMediaStream(source.srcObject) ? source.srcObject : null) ??
          captureElementStream(source);
      }

      if (!video && stream && opts.video !== false) {
        const el = document.createElement("video");
        el.srcObject = stream;
        el.muted = true;
        el.playsInline = true;
        await el.play().catch(() => undefined);
        video = el;
        createdVideo = true;
      }

      canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
    },

    async sampleFrame(): Promise<FrameSample | null> {
      const el = drawSource(video);
      if (!el || !canvas) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: image.width,
        height: image.height,
        data: image.data,
        timestamp: Date.now(),
      };
    },

    virtualCamera(): boolean {
      if (!stream) return false;
      return stream.getVideoTracks().some((track) => looksVirtual(track.label));
    },

    sampleJpeg(quality = 0.85): string | null {
      const el = drawSource(video);
      if (!el) return null;
      const shot = document.createElement("canvas");
      shot.width = el.videoWidth || 640;
      shot.height = el.videoHeight || 480;
      const ctx = shot.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(el, 0, 0, shot.width, shot.height);
      return shot.toDataURL("image/jpeg", quality);
    },

    async sampleAudio(durationMs = 800): Promise<number[] | null> {
      let audioStream = stream;
      if (!audioStream && video) {
        audioStream = captureElementStream(video);
      }
      if (!audioStream || audioStream.getAudioTracks().length === 0) return null;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const node = ctx.createMediaStreamSource(audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(analyser);
      await new Promise((r) => setTimeout(r, durationMs));
      const spec = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(spec);
      const time = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(time);
      const features = extractAudioFeatures(time, spec);
      audioEnergy = signalEnergy(time);
      await ctx.close();
      return features;
    },

    lastAudioEnergy() {
      return audioEnergy;
    },

    stop() {
      if (ownsStream) {
        stream?.getTracks().forEach((t) => t.stop());
      }
      stream = null;
      if (createdVideo && video instanceof HTMLVideoElement) {
        video.srcObject = null;
      }
      video = null;
      canvas = null;
    },
  };
}

/** Compact digest of a frame. Two identical samples share a digest. */
/** Mean absolute pixel change, 0–1. A frozen photo stays near 0. */
export function flowEnergy(prev: FrameSample, curr: FrameSample): number {
  if (prev.width !== curr.width || prev.height !== curr.height || curr.width === 0) return 0;
  const pixels = curr.width * curr.height;
  const step = Math.max(1, Math.floor(pixels / 2000));
  let total = 0;
  let samples = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const a = ((prev.data[i] ?? 0) + (prev.data[i + 1] ?? 0) + (prev.data[i + 2] ?? 0)) / 3;
    const b = ((curr.data[i] ?? 0) + (curr.data[i + 1] ?? 0) + (curr.data[i + 2] ?? 0)) / 3;
    total += Math.abs(a - b);
    samples++;
  }
  return Math.min(1, Math.round((total / Math.max(1, samples) / 255) * 1000) / 1000);
}

/** Change in the lower center band. This is not a mouth-landmark model. */
export function mouthBandEnergy(prev: FrameSample, curr: FrameSample): number {
  if (prev.width !== curr.width || prev.height !== curr.height || curr.height < 4) return 0;
  const y0 = Math.floor(curr.height * 0.62);
  const x0 = Math.floor(curr.width * 0.25);
  const x1 = Math.floor(curr.width * 0.75);
  let total = 0;
  let samples = 0;
  for (let y = y0; y < curr.height; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * curr.width + x) * 4;
      const a = ((prev.data[i] ?? 0) + (prev.data[i + 1] ?? 0) + (prev.data[i + 2] ?? 0)) / 3;
      const b = ((curr.data[i] ?? 0) + (curr.data[i + 1] ?? 0) + (curr.data[i + 2] ?? 0)) / 3;
      total += Math.abs(a - b);
      samples++;
    }
  }
  return Math.min(1, Math.round((total / Math.max(1, samples) / 255) * 1000) / 1000);
}

export function signalEnergy(time: ArrayLike<number>): number {
  if (time.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const v = time[i] ?? 0;
    sum += v * v;
  }
  return Math.min(1, Math.round(Math.sqrt(sum / time.length) * 1000) / 1000);
}

export function frameDigest(data: ArrayLike<number>, width: number, height: number): string {
  let hash = 5381;
  const pixels = width * height;
  if (pixels === 0) return "0";
  const step = Math.max(1, Math.floor(pixels / 64));
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    const y = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    hash = (((hash << 5) + hash) + (y & 255)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Sign changes along the top edge. A monitor replay often flickers there.
 * Returns 0–1. This is a cue, not a screen detector network.
 */
export function screenEdgeEnergy(data: ArrayLike<number>, width: number, height: number): number {
  if (width < 8 || height < 4) return 0;
  let flips = 0;
  let samples = 0;
  const rows = Math.min(2, height);
  for (let y = 0; y < rows; y++) {
    let prev = 0;
    for (let x = 1; x < width; x++) {
      const i0 = (y * width + x - 1) * 4;
      const i1 = (y * width + x) * 4;
      const a = (data[i0] ?? 0) + (data[i0 + 1] ?? 0) + (data[i0 + 2] ?? 0);
      const b = (data[i1] ?? 0) + (data[i1 + 1] ?? 0) + (data[i1 + 2] ?? 0);
      const delta = b - a;
      if (prev !== 0 && delta !== 0 && Math.sign(delta) !== Math.sign(prev) && Math.abs(delta) > 24) {
        flips++;
      }
      if (Math.abs(delta) > 12) prev = delta;
      samples++;
    }
  }
  return Math.min(1, Math.round((flips / Math.max(1, samples)) * 4000) / 1000);
}

/**
 * 32-d forensic vector matching TrustLayerOS ml/detectors/forensics.py
 */
export function extractFrameFeatures(
  frame: FrameSample | { data: ArrayLike<number>; width: number; height: number },
  previous?: FrameSample | null
): number[] {
  const { data, width, height } = frame;
  const pixels = width * height;
  if (pixels === 0) return new Array(32).fill(0);

  let rSum = 0,
    gSum = 0,
    bSum = 0;
  let rSq = 0,
    gSq = 0,
    bSq = 0;
  let rg = 0,
    rb = 0,
    gb = 0;
  let sat = 0,
    clip = 0,
    dark = 0,
    skin = 0;
  const gray = new Float32Array(pixels);
  const quadrants = [0, 0, 0, 0];
  const qCount = [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      rSum += r;
      gSum += g;
      bSum += b;
      rSq += r * r;
      gSq += g * g;
      bSq += b * b;
      rg += r * g;
      rb += r * b;
      gb += g * b;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      if (mx > 0.97) clip++;
      if (mx < 0.08) dark++;
      const yv = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[y * width + x] = yv;
      if (r > 0.35 && g > 0.15 && b > 0.1 && r > g && r > b && r - g < 0.5) skin++;
      const qi = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      quadrants[qi] += yv;
      qCount[qi]++;
    }
  }

  const n = pixels;
  const rMean = rSum / n;
  const gMean = gSum / n;
  const bMean = bSum / n;
  const rStd = Math.sqrt(Math.max(0, rSq / n - rMean * rMean));
  const gStd = Math.sqrt(Math.max(0, gSq / n - gMean * gMean));
  const bStd = Math.sqrt(Math.max(0, bSq / n - bMean * bMean));
  const corr = (sum: number, m1: number, m2: number) => sum / n - m1 * m2;
  const cRG = corr(rg, rMean, gMean);
  const cRB = corr(rb, rMean, bMean);
  const cGB = corr(gb, gMean, bMean);

  let edge = 0;
  let block = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = gray[y * width + x];
      const gx = gray[y * width + x + 1] - gray[y * width + x - 1];
      const gy = gray[(y + 1) * width + x] - gray[(y - 1) * width + x];
      edge += Math.abs(gx) + Math.abs(gy);
      if (x % 8 === 0 || y % 8 === 0) {
        block += Math.abs(c - gray[y * width + Math.max(0, x - 1)]);
      }
    }
  }
  edge /= n;
  block /= n;

  const bands = spectralBands(gray, width, height);

  let temporal = 0;
  if (previous && previous.width === width && previous.height === height) {
    for (let i = 0; i < pixels; i++) {
      const pr = previous.data[i * 4] / 255;
      const pg = previous.data[i * 4 + 1] / 255;
      const pb = previous.data[i * 4 + 2] / 255;
      const py = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      temporal += Math.abs(gray[i] - py);
    }
    temporal /= n;
  }

  let chromaNoise = (rStd + gStd + bStd) / 3;
  const q = quadrants.map((v, i) => (qCount[i] ? v / qCount[i] : 0));
  const center =
    gray[Math.floor(height / 2) * width + Math.floor(width / 2)] || 0;
  const edgeLum = (q[0] + q[1] + q[2] + q[3]) / 4;
  const localContrast = edge;
  const flatness = 1 - Math.min(1, edge * 8 + rStd + gStd);

  return [
    rMean,
    gMean,
    bMean,
    rStd,
    gStd,
    bStd,
    cRG,
    cRB,
    cGB,
    Math.min(1, edge * 10),
    bands[0],
    bands[1],
    bands[2],
    bands[3],
    width / 1920,
    height / 1080,
    sat / n,
    clip / n,
    dark / n,
    Math.min(1, localContrast * 10),
    q[0],
    q[1],
    q[2],
    q[3],
    Math.min(1, temporal * 20),
    Math.min(1, chromaNoise * 4),
    Math.min(1, block * 20),
    skin / n,
    Math.abs(center - edgeLum),
    Math.max(0, Math.min(1, flatness)),
    Math.min(1, temporal * 20),
    Math.max(0, Math.min(1, flatness)),
  ];
}

function spectralBands(gray: Float32Array, width: number, height: number): number[] {
  // 1-D row FFT energy in 4 bands on the center scanline (cheap proxy for 2-D DCT).
  const y = Math.floor(height / 2);
  const n = width;
  const bands = [0, 0, 0, 0];
  let total = 0;
  for (let k = 1; k < n / 2; k++) {
    let re = 0,
      im = 0;
    for (let x = 0; x < n; x++) {
      const ang = (-2 * Math.PI * k * x) / n;
      const v = gray[y * width + x];
      re += v * Math.cos(ang);
      im += v * Math.sin(ang);
    }
    const mag = Math.sqrt(re * re + im * im);
    total += mag;
    const bi = Math.min(3, Math.floor((k / (n / 2)) * 4));
    bands[bi] += mag;
  }
  if (total <= 0) return [0, 0, 0, 0];
  return bands.map((b) => b / total);
}

export function motionFromSequence(frames: FrameSample[]): MotionSummary {
  if (frames.length < 2) {
    return {
      left_right_delta: 0,
      blink_delta: 0,
      temporal_energy: 0,
      frame_count: frames.length,
      path_energy: 0,
    };
  }
  let lr = 0;
  let blink = 0;
  let energy = 0;
  let steps = 0;
  for (let i = 1; i < frames.length; i++) {
    const step = motionFromFrames(frames[i - 1], frames[i]);
    lr += step.left_right_delta;
    blink += step.blink_delta;
    energy += step.temporal_energy;
    steps++;
  }
  return {
    left_right_delta: lr / steps,
    blink_delta: blink / steps,
    temporal_energy: energy / steps,
    frame_count: frames.length,
    path_energy: energy,
  };
}

export function motionFromFrames(prev: FrameSample, next: FrameSample): MotionSummary {
  const w = Math.min(prev.width, next.width);
  const h = Math.min(prev.height, next.height);
  let left = 0,
    right = 0,
    top = 0,
    bot = 0,
    energy = 0;
  const midX = w / 2;
  const eyeY0 = Math.floor(h * 0.28);
  const eyeY1 = Math.floor(h * 0.48);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i0 = (y * prev.width + x) * 4;
      const i1 = (y * next.width + x) * 4;
      const g0 =
        0.299 * prev.data[i0] + 0.587 * prev.data[i0 + 1] + 0.114 * prev.data[i0 + 2];
      const g1 =
        0.299 * next.data[i1] + 0.587 * next.data[i1 + 1] + 0.114 * next.data[i1 + 2];
      const d = (g1 - g0) / 255;
      energy += Math.abs(d);
      if (x < midX) left += d;
      else right += d;
      if (y >= eyeY0 && y < eyeY1) {
        if (y < (eyeY0 + eyeY1) / 2) top += d;
        else bot += d;
      }
    }
  }
  const n = w * h;
  return {
    left_right_delta: (right - left) / n,
    blink_delta: (bot - top) / n,
    temporal_energy: energy / n,
  };
}

export function extractAudioFeatures(time: ArrayLike<number>, spec?: ArrayLike<number>): number[] {
  const n = time.length;
  if (n === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
  let rms = 0;
  let zcr = 0;
  let silent = 0;
  for (let i = 0; i < n; i++) {
    const v = time[i];
    rms += v * v;
    if (Math.abs(v) < 0.01) silent++;
    if (i > 0 && ((time[i - 1] >= 0 && v < 0) || (time[i - 1] < 0 && v >= 0))) zcr++;
  }
  rms = Math.sqrt(rms / n);
  zcr = zcr / n;
  silent = silent / n;

  let centroid = 0;
  let flatNum = 0;
  let flatDen = 0;
  let specEnergy = 0;
  const specLen = spec?.length ?? 0;
  if (spec && specLen > 0) {
    let magSum = 0;
    let weighted = 0;
    let logSum = 0;
    for (let i = 0; i < specLen; i++) {
      const mag = Math.pow(10, spec[i] / 20); // dB → linear-ish
      magSum += mag;
      weighted += mag * i;
      logSum += Math.log(mag + 1e-8);
      specEnergy += mag;
    }
    centroid = magSum > 0 ? weighted / magSum / specLen : 0;
    const geo = Math.exp(logSum / specLen);
    const arith = magSum / specLen;
    flatNum = geo;
    flatDen = arith || 1;
  }

  // Pitch via autocorrelation peak
  let bestLag = 0;
  let best = 0;
  const minLag = 20;
  const maxLag = Math.min(200, Math.floor(n / 2));
  for (let lag = minLag; lag < maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i < n - lag; i++) acc += time[i] * time[i + lag];
    if (acc > best) {
      best = acc;
      bestLag = lag;
    }
  }
  const pitch = bestLag > 0 ? 44100 / bestLag / 8000 : 0; // normalized-ish
  const stability = best > 0 ? Math.min(1, best / (n * rms * rms + 1e-6)) : 0;
  const harmonic = Math.min(1, (specEnergy || 0) / (specLen || 1) / 10);

  return [
    rms,
    zcr,
    centroid,
    flatDen === 0 ? 0 : flatNum / flatDen,
    pitch,
    Math.max(0, Math.min(1, stability)),
    Math.max(0, Math.min(1, harmonic)),
    silent,
  ];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
