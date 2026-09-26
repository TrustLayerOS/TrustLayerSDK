import type { TrustSession } from "../session";

const SHAPES = ["circle", "square", "triangle"] as const;

function shapeGlyph(shape: string): string {
  if (shape === "circle") return "●";
  if (shape === "square") return "■";
  if (shape === "triangle") return "▲";
  return shape;
}

/**
 * Click-the-shape whose answer is checked when the event is ingested.
 * No camera. Skips when there is no document (Node, Python).
 */
export async function runBotChallenge(session: TrustSession): Promise<"passed" | "failed" | "skipped"> {
  if (typeof document === "undefined") return "skipped";
  let issued: { challenge_id: string; shape: string; prompt: string };
  try {
    issued = await session.issueBotChallenge();
  } catch {
    return "skipped";
  }
  if (!SHAPES.includes(issued.shape as (typeof SHAPES)[number])) return "skipped";

  const selected = await askShape(issued.prompt, issued.shape);
  const ok = selected === issued.shape;
  await session.trackEvent(ok ? "bot_challenge_passed" : "bot_challenge_failed", {
    challenge_id: issued.challenge_id,
    selected: selected ?? "",
  });
  await session.flushEvents();
  return ok ? "passed" : "failed";
}

function askShape(prompt: string, expected: string): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-trustlayer-bot", "1");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:2147483646;font-family:sans-serif";
    const card = document.createElement("div");
    card.style.cssText = "background:#fff;padding:20px;border-radius:12px;min-width:240px;text-align:center";
    const title = document.createElement("p");
    title.textContent = prompt || `Click the ${expected}`;
    card.appendChild(title);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:12px;justify-content:center";
    const order = [...SHAPES].sort(() => Math.random() - 0.5);
    for (const shape of order) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = shapeGlyph(shape);
      btn.setAttribute("aria-label", shape);
      btn.style.cssText = "font-size:28px;width:64px;height:64px;cursor:pointer";
      btn.addEventListener("click", () => {
        wrap.remove();
        resolve(shape);
      });
      row.appendChild(btn);
    }
    card.appendChild(row);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  });
}
