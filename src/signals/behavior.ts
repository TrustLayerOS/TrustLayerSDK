export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export interface PathSummary {
  straightLineRatio: number;
  curvature: number;
  teleportGaps: number;
  velocityVariance: number;
  dx: number[];
  dy: number[];
}

export interface BehaviorSignals {
  mouseMovements: number;
  keystrokes: number;
  avgTypingSpeed: number;   // chars per second
  scrollEvents: number;
  clickCount: number;
  windowSwitches: number;
  idleTime: number;         // ms spent idle (no input)
  sessionDuration: number;  // ms since start()
  navigationEvents: number;
  cadenceVariance: number;  // 0 = robotic, 1 = very human
  straightLineRatio: number;
  curvature: number;
  teleportGaps: number;
  velocityVariance: number;
  mouseDx: number[];
  mouseDy: number[];
  keyDelays: number[];
  pasteBursts: number;
  corrections: number;
}

const SEQ_CAP = 32;

/** Path features from a capped pointer trail. Used by the collector and tests. */
export function summarizePointer(points: PointerSample[]): PathSummary {
  if (points.length < 2) {
    return { straightLineRatio: 0, curvature: 1, teleportGaps: 0, velocityVariance: 0.5, dx: [], dy: [] };
  }
  const dx: number[] = [];
  const dy: number[] = [];
  const speeds: number[] = [];
  let path = 0;
  let teleports = 0;
  let turn = 0;
  let turns = 0;
  let prevAngle: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const ddx = points[i].x - points[i - 1].x;
    const ddy = points[i].y - points[i - 1].y;
    const dt = Math.max(1, points[i].t - points[i - 1].t);
    const dist = Math.hypot(ddx, ddy);
    path += dist;
    if (dist > 180 && dt < 20) teleports++;
    speeds.push(dist / dt);
    if (dx.length < SEQ_CAP) {
      dx.push(Math.round(ddx * 10) / 10);
      dy.push(Math.round(ddy * 10) / 10);
    }
    if (dist > 2) {
      const angle = Math.atan2(ddy, ddx);
      if (prevAngle !== null) {
        let delta = Math.abs(angle - prevAngle);
        if (delta > Math.PI) delta = 2 * Math.PI - delta;
        turn += delta;
        turns++;
      }
      prevAngle = angle;
    }
  }
  const chord = Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y);
  const straight = path > 0 ? Math.min(1, chord / path) : 0;
  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const varSpeed = speeds.reduce((sum, s) => sum + (s - meanSpeed) ** 2, 0) / speeds.length;
  const cv = meanSpeed > 0 ? Math.sqrt(varSpeed) / meanSpeed : 0;
  return {
    straightLineRatio: Math.round(straight * 1000) / 1000,
    curvature: turns > 0 ? Math.round((turn / turns) * 1000) / 1000 : 1,
    teleportGaps: teleports,
    velocityVariance: Math.min(1, Math.round(cv * 1000) / 1000),
    dx,
    dy,
  };
}

/**
 * Collects behavioral signals by attaching DOM event listeners.
 * Call start() to begin collection, stop() to clean up.
 */
export class BehaviorCollector {
  private startTime: number = 0;
  private mouseMovements = 0;
  private keystrokes = 0;
  private scrollEvents = 0;
  private clickCount = 0;
  private windowSwitches = 0;
  private navigationEvents = 0;
  private lastActivityTime: number = 0;
  private totalIdleTime = 0;
  private keyTimings: number[] = [];
  private lastKeyTime = 0;
  private points: PointerSample[] = [];
  private pasteBursts = 0;
  private corrections = 0;
  private running = false;

  // Event listener references for cleanup
  private readonly onMouseMove = (ev: MouseEvent) => {
    this.mouseMovements++;
    if (this.points.length < 64) {
      this.points.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
    }
    this.updateActivity();
  };

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    const now = performance.now();
    if (this.lastKeyTime > 0) {
      const delta = now - this.lastKeyTime;
      if (delta > 0 && delta < 5000 && this.keyTimings.length < SEQ_CAP) {
        this.keyTimings.push(Math.round(delta));
      }
    }
    this.lastKeyTime = now;
    if (ev.key === "Backspace" || ev.key === "Delete") {
      this.corrections++;
    }
    this.keystrokes++;
    this.updateActivity();
  };

  private readonly onPaste = () => {
    this.pasteBursts++;
    this.updateActivity();
  };

  private readonly onScroll = () => {
    this.scrollEvents++;
    this.updateActivity();
  };

  private readonly onClick = () => {
    this.clickCount++;
    this.updateActivity();
  };

  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      this.windowSwitches++;
    }
  };

  private readonly onFocus = () => {
    // Window regained focus — potential switch-back
    this.updateActivity();
  };

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.lastActivityTime = this.startTime;

    if (typeof window === "undefined") return; // Node.js guard

    window.addEventListener("mousemove", this.onMouseMove, { passive: true });
    window.addEventListener("keydown", this.onKeyDown, { passive: true });
    window.addEventListener("paste", this.onPaste);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("click", this.onClick, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("focus", this.onFocus);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (typeof window === "undefined") return;

    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("paste", this.onPaste);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("click", this.onClick);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("focus", this.onFocus);

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  getSignals(): BehaviorSignals {
    const sessionDuration = performance.now() - this.startTime;
    const avgTypingSpeed =
      sessionDuration > 0
        ? (this.keystrokes / sessionDuration) * 1000
        : 0;
    const path = summarizePointer(this.points);

    return {
      mouseMovements: this.mouseMovements,
      keystrokes: this.keystrokes,
      avgTypingSpeed: Math.round(avgTypingSpeed * 100) / 100,
      scrollEvents: this.scrollEvents,
      clickCount: this.clickCount,
      windowSwitches: this.windowSwitches,
      idleTime: Math.round(this.totalIdleTime),
      sessionDuration: Math.round(sessionDuration),
      navigationEvents: this.navigationEvents,
      cadenceVariance: this.computeCadenceVariance(),
      straightLineRatio: path.straightLineRatio,
      curvature: path.curvature,
      teleportGaps: path.teleportGaps,
      velocityVariance: this.points.length >= 4 ? path.velocityVariance : this.mouseMovements > 5 ? 0.35 : 0.02,
      mouseDx: path.dx,
      mouseDy: path.dy,
      keyDelays: this.keyTimings.slice(0, SEQ_CAP),
      pasteBursts: this.pasteBursts,
      corrections: this.corrections,
    };
  }

  reset(): void {
    this.mouseMovements = 0;
    this.keystrokes = 0;
    this.scrollEvents = 0;
    this.clickCount = 0;
    this.windowSwitches = 0;
    this.navigationEvents = 0;
    this.totalIdleTime = 0;
    this.keyTimings = [];
    this.lastKeyTime = 0;
    this.points = [];
    this.pasteBursts = 0;
    this.corrections = 0;
    this.startTime = performance.now();
    this.lastActivityTime = this.startTime;
  }

  private updateActivity(): void {
    const now = performance.now();
    const idleGap = now - this.lastActivityTime;
    if (idleGap > 3000) {
      // More than 3s since last activity = idle time
      this.totalIdleTime += idleGap;
    }
    this.lastActivityTime = now;
  }

  private computeCadenceVariance(): number {
    // Use inter-keystroke intervals to measure how "human" the typing pattern is
    const timings = this.keyTimings.filter((t) => t < 2000 && t > 0);
    if (timings.length < 3) return 0.5; // not enough data

    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    const variance =
      timings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) /
      timings.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // Coefficient of variation clamped to [0, 1]
    return Math.min(1, Math.round(cv * 100) / 100);
  }
}
