export { EthitrustClient } from './client.js';
export type { EthitrustClientOptions } from './client.js';

export { HttpClient } from './http.js';
export type { HttpClientOptions, RequestOptions } from './http.js';

export { OrgEscrowsResource } from './resources/orgEscrows.js';
export type { RequestExtras } from './resources/orgEscrows.js';

export { generateIdempotencyKey } from './utils/idempotency.js';

export * from './types.js';
export {
  EthitrustError,
  EthitrustApiError,
  EthitrustAuthError,
  EthitrustNotFoundError,
  EthitrustConflictError,
  EthitrustValidationError,
  EthitrustRateLimitError,
  EthitrustNetworkError,
  EthitrustAbortError,
} from './errors.js';
