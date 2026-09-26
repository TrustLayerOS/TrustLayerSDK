import { TrustLayer } from "./client";
import type { EvaluationResponse } from "./api/types";
import { planForPreset, type HumanPreset } from "./presets";

export interface MountHumanCheckOptions {
  apiKey: string;
  apiUrl?: string;
  /** signup | login | call | payment | review. Default login. */
  preset?: HumanPreset;
  /** CSS selector or element. Default document.body. */
  target?: string | HTMLElement;
  consent?: boolean;
  /** Review text, payment context, or any message to score. */
  text?: string;
  onResult?: (result: EvaluationResponse) => void;
}

export interface HumanCheckHandle {
  destroy: () => void;
  /** Session id after the user runs the check. Empty until then. */
  sessionId: () => string;
}

/**
 * Drop-in "are you human" panel for a plain script tag.
 * Returns the same evaluate JSON as TrustLayer.check({ preset }).
 */
export function mountHumanCheck(options: MountHumanCheckOptions): HumanCheckHandle {
  if (typeof document === "undefined") {
    throw new Error("mountHumanCheck requires a browser");
  }
  const preset = options.preset ?? "login";
  const plan = planForPreset(preset);
  const host = resolveTarget(options.target);
  const root = document.createElement("div");
  root.className = "trustlayer-human-check";
  root.innerHTML = panelHtml(plan.label, plan.media, plan.passkey, preset === "review");
  host.appendChild(root);

  let sessionId = "";
  const button = root.querySelector("button");
  const status = root.querySelector("[data-status]");
  button?.addEventListener("click", () => {
    void run();
  });

  async function run() {
    if (button) button.setAttribute("disabled", "true");
    setStatus(status, "Checking…");
    try {
      const tl = TrustLayer.initialize({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
      });
      const typed = root.querySelector("[data-text]");
      const text = typed instanceof HTMLTextAreaElement && typed.value ? typed.value : options.text;
      const result = await tl.check({
        preset,
        consent: options.consent ?? true,
        text,
      });
      sessionId = result.session_id;
      setStatus(status, `${result.recommendation} · human ${Math.round(result.human_probability * 100)}%`);
      options.onResult?.(result);
    } catch (err) {
      setStatus(status, err instanceof Error ? err.message : "check failed");
    } finally {
      button?.removeAttribute("disabled");
    }
  }

  return {
    destroy: () => root.remove(),
    sessionId: () => sessionId,
  };
}

function resolveTarget(target?: string | HTMLElement): HTMLElement {
  if (!target) return document.body;
  if (typeof target !== "string") return target;
  const found = document.querySelector(target);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`mount target not found: ${target}`);
  }
  return found;
}

function setStatus(node: Element | null, text: string) {
  if (node) node.textContent = text;
}

function panelHtml(label: string, media: boolean, passkey: boolean, review: boolean): string {
  const extra = media
    ? "Uses the camera and microphone on this device."
    : passkey
      ? "Uses behavior on this page and a passkey if the browser offers one."
      : "Uses behavior on this page. No camera.";
  return `
    <style>
      .trustlayer-human-check {
        font-family: system-ui, sans-serif;
        border: 1px solid #d0d7de;
        border-radius: 12px;
        padding: 16px;
        max-width: 360px;
        background: #fff;
        color: #1f2328;
      }
      .trustlayer-human-check h3 { margin: 0 0 6px; font-size: 16px; }
      .trustlayer-human-check p { margin: 0 0 12px; font-size: 13px; color: #59636e; }
      .trustlayer-human-check button {
        background: #1f2328; color: #fff; border: 0; border-radius: 8px;
        padding: 8px 12px; font-size: 14px; cursor: pointer;
      }
      .trustlayer-human-check button:disabled { opacity: 0.6; cursor: wait; }
      .trustlayer-human-check textarea { width: 100%; min-height: 72px; margin-bottom: 10px; }
      .trustlayer-human-check [data-status] { margin-top: 10px; font-size: 13px; }
    </style>
    <h3>Are you human · ${label}</h3>
    <p>${extra}</p>
    ${review ? '<textarea data-text placeholder="Review text"></textarea>' : ""}
    <button type="button">Continue</button>
    <div data-status></div>
  `;
}
