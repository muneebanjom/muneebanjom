import { ConnectorError } from './types';

/**
 * Shared HTTP client for connectors: timeouts, jittered exponential backoff on
 * 429/5xx, and an explicit cap so a provider outage cannot hang a job worker.
 */
export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxAttempts?: number;
}

export async function requestJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeoutMs = 20_000, maxAttempts = 3 } = options;
  let lastError: ConnectorError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429 || res.status >= 500) {
        lastError = new ConnectorError(`Provider returned ${res.status}.`, res.status, true);
        await backoff(attempt, res.headers.get('retry-after'));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ConnectorError(
          res.status === 401 || res.status === 403
            ? 'Credentials were rejected by the provider. Reconnect the integration.'
            : `Provider returned ${res.status}. ${text.slice(0, 200)}`,
          res.status,
          false,
        );
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof ConnectorError && !error.retryable) throw error;
      lastError = error instanceof ConnectorError ? error : new ConnectorError((error as Error).message, undefined, true);
      if (attempt < maxAttempts) await backoff(attempt, null);
    }
  }
  throw lastError ?? new ConnectorError('Request failed.');
}

async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const headerDelay = retryAfter ? Number(retryAfter) * 1000 : 0;
  const base = Math.min(8000, 500 * 2 ** (attempt - 1));
  const jitter = Math.random() * 250;
  await new Promise((resolve) => setTimeout(resolve, Math.max(headerDelay, base) + jitter));
}
