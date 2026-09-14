import type { EvaluationResponse } from "../api/types";
import { DEFAULT_API_URL } from "../config";

export const SESSION_HEADER = "x-trustlayer-session";
/** Short window — stolen session ids should not unlock sensitive actions for long. */
export const DEFAULT_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export type HumanCheckFailure = {
  ok: false;
  status: number;
  reason: string;
};

export type HumanCheckSuccess = {
  ok: true;
  evaluation: EvaluationResponse;
};

export type HumanCheckResult = HumanCheckSuccess | HumanCheckFailure;

export interface AssertRecentAllowOptions {
  apiKey: string;
  apiUrl?: string;
  sessionId: string;
  maxAgeMs?: number;
}

/**
 * Re-evaluate a session and require recommendation === "allow"
 * on a session that is still within maxAgeMs of creation.
 */
export async function assertRecentAllow(
  options: AssertRecentAllowOptions
): Promise<HumanCheckResult> {
  const base = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.apiKey}`,
  };

  const sessRes = await fetch(`${base}/v1/sessions/${options.sessionId}`, {
    headers,
  });
  if (!sessRes.ok) {
    return {
      ok: false,
      status: sessRes.status === 404 ? 404 : 401,
      reason: "session_not_found",
    };
  }

  const session = (await sessRes.json()) as {
    status?: string;
    created_at?: string;
  };
  if (session.status === "expired") {
    return { ok: false, status: 403, reason: "session_expired" };
  }

  const maxAge = options.maxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS;
  const created = session.created_at ? Date.parse(session.created_at) : NaN;
  if (Number.isFinite(created) && Date.now() - created > maxAge) {
    return { ok: false, status: 403, reason: "session_too_old" };
  }

  const evRes = await fetch(`${base}/v1/evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: options.sessionId,
      modules: ["interview", "deepfake", "bot"],
    }),
  });
  if (!evRes.ok) {
    return { ok: false, status: 502, reason: "evaluate_failed" };
  }

  const evaluation = (await evRes.json()) as EvaluationResponse;
  if (evaluation.recommendation !== "allow") {
    return { ok: false, status: 403, reason: evaluation.recommendation };
  }
  // Require a positive human signal — recommendation alone is insufficient.
  if (
    typeof evaluation.human_probability === "number" &&
    evaluation.human_probability < 0.55
  ) {
    return { ok: false, status: 403, reason: "low_human_probability" };
  }
  if (
    typeof evaluation.deepfake_risk === "number" &&
    evaluation.deepfake_risk > 0.45
  ) {
    return { ok: false, status: 403, reason: "high_deepfake_risk" };
  }
  return { ok: true, evaluation };
}

export interface IncomingLike {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface OutgoingLike {
  status: (code: number) => OutgoingLike;
  json: (body: unknown) => unknown;
}

export interface RequireHumanOptions {
  apiKey: string;
  apiUrl?: string;
  maxAgeMs?: number;
  header?: string;
}

function headerValue(
  headers: IncomingLike["headers"],
  name: string
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Express-style middleware: require a recent evaluate recommendation of "allow".
 * Client sends the session id in `X-TrustLayer-Session`.
 */
export function requireHuman(options: RequireHumanOptions) {
  const headerName = (options.header ?? SESSION_HEADER).toLowerCase();

  return async function trustLayerRequireHuman(
    req: IncomingLike & { trustlayer?: EvaluationResponse },
    res: OutgoingLike,
    next: (err?: unknown) => void
  ): Promise<void> {
    const sessionId =
      headerValue(req.headers, headerName) ??
      headerValue(req.headers, SESSION_HEADER) ??
      (typeof req.query?.session_id === "string" ? req.query.session_id : undefined);

    if (!sessionId) {
      res.status(401).json({
        error: "missing_session",
        message: "Send X-TrustLayer-Session with a recent TrustLayer session id",
      });
      return;
    }

    try {
      const result = await assertRecentAllow({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        maxAgeMs: options.maxAgeMs,
        sessionId,
      });
      if (!result.ok) {
        res.status(result.status).json({
          error: "human_check_failed",
          reason: result.reason,
        });
        return;
      }
      req.trustlayer = result.evaluation;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Next.js App Router helper. Use in a route handler or middleware:
 *
 *   const check = await nextRequireHuman(request, { apiKey })
 *   if (!check.ok) return NextResponse.json(check.body, { status: check.status })
 */
export async function nextRequireHuman(
  request: { headers: { get: (name: string) => string | null } },
  options: Omit<RequireHumanOptions, "header">
): Promise<
  | { ok: true; evaluation: EvaluationResponse }
  | { ok: false; status: number; body: { error: string; reason?: string } }
> {
  const sessionId = request.headers.get(SESSION_HEADER);
  if (!sessionId) {
    return { ok: false, status: 401, body: { error: "missing_session" } };
  }
  const result = await assertRecentAllow({ ...options, sessionId });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      body: { error: "human_check_failed", reason: result.reason },
    };
  }
  return { ok: true, evaluation: result.evaluation };
}
