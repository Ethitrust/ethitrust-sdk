import {
  EthitrustAbortError,
  EthitrustNetworkError,
  EthitrustRateLimitError,
  buildApiError,
} from './errors.js';
import { toQueryString } from './utils/query.js';

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Header name carrying the API key. Defaults to `X-API-Key`. */
  apiKeyHeader?: string;
  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
  /** Max retries for transient failures (network, 429, 5xx). Defaults to 2. */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff. Defaults to 300. */
  retryBaseDelayMs?: number;
  /** Custom fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Extra headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /** User agent appended to `User-Agent` (Node only). */
  userAgent?: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /** Adds an `X-Idempotency-Key` header. */
  idempotencyKey?: string;
  /** Overrides per-request timeout. */
  timeoutMs?: number;
  /** Abort signal supplied by the caller. */
  signal?: AbortSignal;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiKeyHeader: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    if (!opts.baseUrl) throw new Error('baseUrl is required');
    this.apiKey = opts.apiKey;
    this.apiKeyHeader = opts.apiKeyHeader ?? 'X-API-Key';
    this.baseUrl = stripTrailingSlash(opts.baseUrl);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? 300;
    const fImpl = opts.fetch ?? globalThis.fetch;
    if (!fImpl) {
      throw new Error(
        'No fetch implementation found. Use Node 18+ or pass `fetch` explicitly.',
      );
    }
    this.fetchImpl = fImpl.bind(globalThis);
    this.defaultHeaders = {
      Accept: 'application/json',
      'User-Agent': opts.userAgent ?? '@ethitrust/sdk/1.0.0 node',
      ...opts.defaultHeaders,
    };
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers = this.buildHeaders(opts);

    const hasBody = opts.body !== undefined && opts.body !== null;
    const init: RequestInit = {
      method: opts.method,
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    };

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { signal, cancel } = mergeSignals(
        opts.signal,
        opts.timeoutMs ?? this.timeoutMs,
      );
      try {
        const response = await this.fetchImpl(url, { ...init, signal });
        cancel();
        if (response.ok) {
          return (await parseBody(response)) as T;
        }

        const body = await parseBody(response);
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        const err = buildApiError({
          status: response.status,
          statusText: response.statusText,
          url,
          method: opts.method,
          body,
          requestId: response.headers.get('X-Request-Id') ?? undefined,
          retryAfter,
        });

        if (this.shouldRetry(response.status, attempt) && opts.method === 'GET') {
          await sleep(this.backoff(attempt, retryAfter));
          attempt++;
          continue;
        }
        // Always retry 429s regardless of method, since the server signals it.
        if (response.status === 429 && attempt < this.maxRetries) {
          await sleep(this.backoff(attempt, retryAfter));
          attempt++;
          continue;
        }
        throw err;
      } catch (err) {
        cancel();
        if (err instanceof EthitrustRateLimitError) throw err;
        if (isAbortError(err)) {
          if (opts.signal?.aborted) throw new EthitrustAbortError();
          // Timeout: treat as network error, eligible for retry on GET.
          if (opts.method === 'GET' && attempt < this.maxRetries) {
            await sleep(this.backoff(attempt));
            attempt++;
            continue;
          }
          throw new EthitrustNetworkError('Request timed out', err);
        }
        // Non-API error rethrown (validation, etc.).
        if (err && typeof err === 'object' && 'status' in (err as object)) {
          throw err;
        }
        if (opts.method === 'GET' && attempt < this.maxRetries) {
          await sleep(this.backoff(attempt));
          attempt++;
          continue;
        }
        throw new EthitrustNetworkError(
          err instanceof Error ? err.message : 'Network error',
          err,
        );
      }
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    const qs = query ? toQueryString(query) : '';
    return `${this.baseUrl}${p}${qs}`;
  }

  private buildHeaders(opts: RequestOptions): Headers {
    const h = new Headers(this.defaultHeaders);
    h.set(this.apiKeyHeader, this.apiKey);
    if (opts.body !== undefined && opts.body !== null) {
      h.set('Content-Type', 'application/json');
    }
    if (opts.idempotencyKey) {
      h.set('X-Idempotency-Key', opts.idempotencyKey);
    }
    if (opts.headers) {
      for (const [k, v] of Object.entries(opts.headers)) h.set(k, v);
    }
    return h;
  }

  private shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    return status >= 500 && status < 600;
  }

  private backoff(attempt: number, retryAfterSec?: number): number {
    if (retryAfterSec && retryAfterSec > 0) return retryAfterSec * 1000;
    const jitter = Math.random() * 0.25 + 0.875; // 0.875–1.125
    return Math.min(this.retryBaseDelayMs * 2 ** attempt * jitter, 10_000);
  }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const ct = res.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
  const txt = await res.text();
  return txt || undefined;
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return n;
  const date = Date.parse(h);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return undefined;
}

function mergeSignals(
  user: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const onUserAbort = () => ctrl.abort(user?.reason);
  if (user) {
    if (user.aborted) ctrl.abort(user.reason);
    else user.addEventListener('abort', onUserAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer);
      if (user) user.removeEventListener('abort', onUserAbort);
    },
  };
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
