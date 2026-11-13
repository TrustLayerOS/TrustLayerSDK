/**
 * Retries an async function up to `attempts` times with exponential backoff.
 * Errors with `{ noRetry: true }` (e.g. HTTP 4xx from ApiClient) fail immediately.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isNoRetry(err) || i >= attempts - 1) {
        break;
      }
      await sleep(delayMs * Math.pow(2, i));
    }
  }

  throw lastError;
}

function isNoRetry(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { noRetry?: boolean }).noRetry);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
