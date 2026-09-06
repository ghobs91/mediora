export const DEFAULT_API_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Honor a caller-provided signal: abort our controller if it fires.
  const onCallerAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener('abort', onCallerAbort);
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, retries = 1 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Exponential backoff: 500ms, 1s, 2s...
        await new Promise(resolve =>
          setTimeout(resolve, 500 * 2 ** attempt),
        );
      }
    }
  }
  throw lastError;
}
