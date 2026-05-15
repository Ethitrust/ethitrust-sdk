import type { HTTPValidationError, ValidationErrorItem } from './types.js';

/** Base class for every error thrown by the SDK. */
export class EthitrustError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EthitrustError';
  }
}

/** Thrown when the server returns a non-2xx HTTP status. */
export class EthitrustApiError extends EthitrustError {
  readonly status: number;
  readonly statusText: string;
  readonly requestId?: string;
  readonly url: string;
  readonly method: string;
  readonly body: unknown;

  constructor(opts: {
    status: number;
    statusText: string;
    url: string;
    method: string;
    body: unknown;
    requestId?: string;
    message?: string;
  }) {
    const detail =
      opts.message ??
      extractMessage(opts.body) ??
      `${opts.status} ${opts.statusText}`;
    super(`Ethitrust API error ${opts.status}: ${detail}`);
    this.name = 'EthitrustApiError';
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.url = opts.url;
    this.method = opts.method;
    this.body = opts.body;
    this.requestId = opts.requestId;
  }
}

/** 422 Unprocessable Entity (FastAPI validation failure). */
export class EthitrustValidationError extends EthitrustApiError {
  readonly errors: ValidationErrorItem[];

  constructor(opts: ConstructorParameters<typeof EthitrustApiError>[0]) {
    super(opts);
    this.name = 'EthitrustValidationError';
    const body = opts.body as HTTPValidationError | undefined;
    this.errors = body?.detail ?? [];
  }
}

/** 401 / 403 — invalid or insufficient credentials. */
export class EthitrustAuthError extends EthitrustApiError {
  constructor(opts: ConstructorParameters<typeof EthitrustApiError>[0]) {
    super(opts);
    this.name = 'EthitrustAuthError';
  }
}

/** 404. */
export class EthitrustNotFoundError extends EthitrustApiError {
  constructor(opts: ConstructorParameters<typeof EthitrustApiError>[0]) {
    super(opts);
    this.name = 'EthitrustNotFoundError';
  }
}

/** 409 — idempotency or business-rule conflict. */
export class EthitrustConflictError extends EthitrustApiError {
  constructor(opts: ConstructorParameters<typeof EthitrustApiError>[0]) {
    super(opts);
    this.name = 'EthitrustConflictError';
  }
}

/** 429 — too many requests. */
export class EthitrustRateLimitError extends EthitrustApiError {
  readonly retryAfter?: number;
  constructor(
    opts: ConstructorParameters<typeof EthitrustApiError>[0] & {
      retryAfter?: number;
    },
  ) {
    super(opts);
    this.name = 'EthitrustRateLimitError';
    this.retryAfter = opts.retryAfter;
  }
}

/** Network / fetch / timeout level failure. */
export class EthitrustNetworkError extends EthitrustError {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EthitrustNetworkError';
    this.cause = cause;
  }
}

/** Request was aborted (timeout or user signal). */
export class EthitrustAbortError extends EthitrustError {
  constructor(message = 'Request aborted') {
    super(message);
    this.name = 'EthitrustAbortError';
  }
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string') return b.message;
  if (typeof b.error === 'string') return b.error;
  if (typeof b.detail === 'string') return b.detail;
  if (Array.isArray(b.detail) && b.detail.length > 0) {
    const first = b.detail[0] as ValidationErrorItem;
    return `${first.msg} (at ${first.loc?.join('.') ?? '?'})`;
  }
  return undefined;
}

export function buildApiError(opts: {
  status: number;
  statusText: string;
  url: string;
  method: string;
  body: unknown;
  requestId?: string;
  retryAfter?: number;
}): EthitrustApiError {
  if (opts.status === 401 || opts.status === 403) return new EthitrustAuthError(opts);
  if (opts.status === 404) return new EthitrustNotFoundError(opts);
  if (opts.status === 409) return new EthitrustConflictError(opts);
  if (opts.status === 422) return new EthitrustValidationError(opts);
  if (opts.status === 429) return new EthitrustRateLimitError(opts);
  return new EthitrustApiError(opts);
}
