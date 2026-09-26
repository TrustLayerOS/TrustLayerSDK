export interface DeviceSignals {
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  colorDepth: number;
  hardwareConcurrency: number;
  deviceMemory?: number;
  touchSupport: boolean;
  cookiesEnabled: boolean;
  doNotTrack: string | null;
  canvasFingerprint?: string;
  webglRenderer?: string;
  plugins?: string[];
}

/**
 * Collects browser device signals for trust evaluation.
 * Only collects what's needed — no excessive fingerprinting.
 */
export async function collectDeviceSignals(): Promise<DeviceSignals> {
  const nav = navigator;

  const signals: DeviceSignals = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    touchSupport: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    cookiesEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
  };

  // Device memory (Chrome only)
  const navWithMemory = nav as Navigator & { deviceMemory?: number };
  if (typeof navWithMemory.deviceMemory === "number") {
    signals.deviceMemory = navWithMemory.deviceMemory;
  }

  // Canvas fingerprint
  try {
    signals.canvasFingerprint = await getCanvasFingerprint();
  } catch {
    // Canvas not available (e.g. Node.js)
  }

  // WebGL renderer
  try {
    signals.webglRenderer = getWebGLRenderer();
  } catch {
    // WebGL not available
  }

  // Installed plugins
  try {
    signals.plugins = getPluginNames();
  } catch {
    // Plugins not available
  }

  return signals;
}

function getCanvasFingerprint(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no canvas context"));
        return;
      }

      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("TrustLayer", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("TrustLayer", 4, 17);

      const dataURL = canvas.toDataURL();
      // Simple hash of the data URL
      let hash = 0;
      for (let i = 0; i < dataURL.length; i++) {
        const char = dataURL.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32-bit int
      }
      resolve(Math.abs(hash).toString(16));
    } catch (err) {
      reject(err);
    }
  });
}

export interface AutomationFlags {
  webdriver: boolean;
  headless_ua: boolean;
  automation_global: boolean;
  languages_empty: boolean;
  webgl_swiftshader: boolean;
  automation_framework: boolean;
}

export interface AutomationSnapshot {
  webdriver?: boolean;
  userAgent?: string;
  languages?: readonly string[];
  webglRenderer?: string;
  globals?: Record<string, unknown>;
}

/** Environment booleans. A real browser call builds the snapshot; tests pass one in. */
export function automationFlags(env: AutomationSnapshot): AutomationFlags {
  const ua = env.userAgent ?? "";
  const globals = env.globals ?? {};
  const flags = {
    webdriver: env.webdriver === true,
    headless_ua: /HeadlessChrome|PhantomJS/i.test(ua),
    automation_global: Boolean(
      globals["callPhantom"] ||
        globals["_phantom"] ||
        globals["domAutomation"] ||
        globals["__playwright"] ||
        globals["__pw_manual"] ||
        globals["__nightmare"]
    ),
    languages_empty: !env.languages || env.languages.length === 0,
    webgl_swiftshader: /swiftshader/i.test(env.webglRenderer ?? ""),
  };
  return {
    ...flags,
    automation_framework:
      flags.webdriver || flags.headless_ua || flags.automation_global || flags.languages_empty || flags.webgl_swiftshader,
  };
}

export function collectAutomationFlags(): AutomationFlags {
  if (typeof navigator === "undefined") {
    return automationFlags({});
  }
  const w = typeof window === "undefined" ? {} : (window as unknown as Record<string, unknown>);
  return automationFlags({
    webdriver: navigator.webdriver === true,
    userAgent: navigator.userAgent,
    languages: navigator.languages,
    webglRenderer: getWebGLRenderer(),
    globals: w,
  });
}

function getWebGLRenderer(): string | undefined {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) return undefined;

    const debugInfo = (gl as WebGLRenderingContext).getExtension(
      "WEBGL_debug_renderer_info"
    );
    if (!debugInfo) return undefined;

    return (gl as WebGLRenderingContext).getParameter(
      debugInfo.UNMASKED_RENDERER_WEBGL
    ) as string;
  } catch {
    return undefined;
  }
}

function getPluginNames(): string[] {
  if (!navigator.plugins) return [];
  return Array.from(navigator.plugins).map((p) => p.name);
}
