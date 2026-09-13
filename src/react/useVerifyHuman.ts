import { useCallback, useMemo, useState } from "react";
import { TrustLayer } from "../client";
import type { EvaluationResponse } from "../api/types";
import type { CreateSessionOptions, VerifyHumanOptions } from "../session";

export interface UseVerifyHumanConfig {
  apiKey: string;
  apiUrl?: string;
}

export interface UseVerifyHumanState {
  verify: (
    options?: VerifyHumanOptions & Partial<CreateSessionOptions>
  ) => Promise<EvaluationResponse>;
  status: "idle" | "running" | "done" | "error";
  result: EvaluationResponse | null;
  error: Error | null;
  reset: () => void;
}

/**
 * React hook around TrustLayer.verifyHuman().
 *
 *   import { useVerifyHuman } from "@trustlayer/sdk/react"
 */
export function useVerifyHuman(config: UseVerifyHumanConfig): UseVerifyHumanState {
  const [status, setStatus] = useState<UseVerifyHumanState["status"]>("idle");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(
    () =>
      TrustLayer.initialize({
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
      }),
    [config.apiKey, config.apiUrl]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const verify = useCallback(
    async (options: VerifyHumanOptions & Partial<CreateSessionOptions> = {}) => {
      setStatus("running");
      setError(null);
      try {
        const evaluation = await client.verifyHuman(options);
        setResult(evaluation);
        setStatus("done");
        return evaluation;
      } catch (err) {
        const next = err instanceof Error ? err : new Error(String(err));
        setError(next);
        setStatus("error");
        throw next;
      }
    },
    [client]
  );

  return { verify, status, result, error, reset };
}
