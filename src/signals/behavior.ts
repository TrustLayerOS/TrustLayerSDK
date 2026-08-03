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
  private running = false;

  // Event listener references for cleanup
  private readonly onMouseMove = () => {
    this.mouseMovements++;
    this.updateActivity();
  };

  private readonly onKeyDown = () => {
    const now = performance.now();
    if (this.keyTimings.length > 0) {
      const delta = now - this.keyTimings[this.keyTimings.length - 1];
      if (delta > 0 && delta < 5000) {
        this.keyTimings.push(delta);
      }
    } else {
      this.keyTimings.push(now);
    }
    this.keystrokes++;
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
