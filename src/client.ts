import { HttpClient, type HttpClientOptions } from './http.js';
import { OrgEscrowsResource } from './resources/orgEscrows.js';

export interface EthitrustClientOptions {
  /** Organization API key. Sent as `X-API-Key` (configurable). */
  apiKey: string;
  /**
   * Base URL. Defaults to `https://api.ethitrust.me`. Accepts host with or
   * without scheme — if missing, `https://` is assumed.
   */
  baseUrl?: string;
  /** Header carrying the API key. Defaults to `X-API-Key`. */
  apiKeyHeader?: string;
  /** Per-request timeout (ms). Defaults to 30 000. */
  timeoutMs?: number;
  /** Max retries for transient failures (GET / 429 / 5xx). Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch (e.g. undici, node-fetch). */
  fetch?: typeof fetch;
  /** Extra headers applied to every request. */
  defaultHeaders?: Record<string, string>;
  /** User agent string. */
  userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://api.ethitrust.me';

/**
 * Top-level entry point.
 *
 * ```ts
 * import { EthitrustClient } from '@ethitrust/sdk';
 * const client = new EthitrustClient({ apiKey: process.env.ETHITRUST_API_KEY! });
 * const escrow = await client.orgEscrows.create({
 *   invitee_email: 'buyer@example.com',
 *   title: 'Website redesign',
 *   amount: 5000,
 * });
 * ```
 */
export class EthitrustClient {
  readonly http: HttpClient;
  readonly orgEscrows: OrgEscrowsResource;

  constructor(opts: EthitrustClientOptions) {
    if (!opts.apiKey) {
      throw new Error('EthitrustClient: `apiKey` is required.');
    }
    const baseUrl = normaliseBaseUrl(opts.baseUrl ?? DEFAULT_BASE_URL);
    const httpOpts: HttpClientOptions = {
      apiKey: opts.apiKey,
      apiKeyHeader: opts.apiKeyHeader,
      baseUrl,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      fetch: opts.fetch,
      defaultHeaders: opts.defaultHeaders,
      userAgent: opts.userAgent,
    };
    this.http = new HttpClient(httpOpts);
    this.orgEscrows = new OrgEscrowsResource(this.http);
  }
}

function normaliseBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
