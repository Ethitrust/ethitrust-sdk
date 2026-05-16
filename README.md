# @ethitrust/sdk

Official **TypeScript / Node** SDK for the Ethitrust **org-escrows** API.

* Strongly typed against the OpenAPI spec (`ethi-mono v0.1.0`)
* Hand-crafted ergonomic surface — no codegen runtime
* Built-in retries, timeouts, and idempotency-key generation
* Async pagination iterator
* Rich error hierarchy mapped from HTTP status codes

## Install

```bash
pnpm add @ethitrust/sdk
# or
npm install @ethitrust/sdk
```

Requires **Node 18+** (uses the global `fetch`).

## Quick start

```ts
import { EthitrustClient } from '@ethitrust/sdk';

const client = new EthitrustClient({
  apiKey: process.env.ETHITRUST_API_KEY!,        // sent as X-API-Key
  baseUrl: 'https://api.ethitrust.me',           // default
});

const escrow = await client.orgEscrows.create({
  invitee_email: 'buyer@example.com',
  title: 'Website redesign',
  amount: 5000,
  currency: 'ETB',
  escrow_type: 'onetime',
  who_pays_fees: 'split',
});
```

## Configuration

| Option | Default | Description |
|---|---|---|
| `apiKey`         | — *(required)*           | Organization API key. |
| `baseUrl`        | `https://api.ethitrust.me` | API host. Bare hostnames are auto-prefixed with `https://`. |
| `apiKeyHeader`   | `X-API-Key`              | Header name carrying the key. |
| `timeoutMs`      | `30000`                  | Per-request timeout. |
| `maxRetries`     | `2`                      | Retries for transient failures (GET / `429` / `5xx`). |
| `fetch`          | global `fetch`           | Custom fetch implementation. |
| `defaultHeaders` | `{}`                     | Extra headers on every request. |
| `userAgent`      | `@ethitrust/sdk/1.1.0 node` | Override the User-Agent. |

## API surface

Every method lives on `client.orgEscrows`.

| Method | HTTP | Endpoint |
|---|---|---|
| `create(body, extras?)`                       | POST  | `/api/v1/org-escrows` |
| `list(params?, extras?)`                      | GET   | `/api/v1/org-escrows` |
| `iter(params?, extras?)` *(async iterator)*   | GET   | `/api/v1/org-escrows` (auto-paginated) |
| `getStatus(id, extras?)`                      | GET   | `/api/v1/org-escrows/{id}` |
| `getDetail(id, extras?)`                      | GET   | `/api/v1/org-escrows/{id}/detail` |
| `getEvents(id, extras?)`                      | GET   | `/api/v1/org-escrows/{id}/events` |
| `getHealth(id, extras?)`                      | GET   | `/api/v1/org-escrows/{id}/health` |
| `cancel(id, extras?)`                         | POST  | `/api/v1/org-escrows/{id}/cancel` |
| `resendInvitation(id, extras?)`               | POST  | `/api/v1/org-escrows/{id}/resend` |
| `getReport(params?, extras?)`                 | GET   | `/api/v1/org-escrows/reports/summary` |
| `listEscrowWebhookLogs(id, extras?)`          | GET   | `/api/v1/org-escrows/{id}/webhooks` |
| `listWebhookLogs(extras?)`                    | GET   | `/api/v1/org-escrows/webhooks` |
| `testWebhook(extras?)`                        | POST  | `/api/v1/org-escrows/webhooks/test` |

### Pagination iterator

```ts
for await (const item of client.orgEscrows.iter({ status: 'active' })) {
  console.log(item.escrow_id, item.title);
}
```

### Idempotency keys

Every write method (`create`, `cancel`, `resendInvitation`, `testWebhook`) **auto-generates** a UUID v4 idempotency key and sends it as `X-Idempotency-Key`. Override it (e.g. to dedupe a retried business operation) or disable it explicitly:

```ts
await client.orgEscrows.create(body, { idempotencyKey: 'order-42' });
await client.orgEscrows.create(body, { idempotencyKey: null }); // disable
```

Or generate one yourself:

```ts
import { generateIdempotencyKey } from '@ethitrust/sdk';
const key = generateIdempotencyKey('order');
```

### Timeouts & cancellation

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 5000);

await client.orgEscrows.list({ status: 'active' }, {
  signal: ac.signal,
  timeoutMs: 10_000,
});
```

### Error handling

```ts
import {
  EthitrustApiError,
  EthitrustAuthError,
  EthitrustNotFoundError,
  EthitrustValidationError,
  EthitrustRateLimitError,
  EthitrustNetworkError,
} from '@ethitrust/sdk';

try {
  await client.orgEscrows.create(/* … */);
} catch (err) {
  if (err instanceof EthitrustValidationError) {
    for (const e of err.errors) console.error(e.loc.join('.'), e.msg);
  } else if (err instanceof EthitrustAuthError) {
    // invalid / expired API key
  } else if (err instanceof EthitrustRateLimitError) {
    console.warn('Retry after', err.retryAfter, 'seconds');
  } else if (err instanceof EthitrustApiError) {
    console.error(err.status, err.body);
  } else if (err instanceof EthitrustNetworkError) {
    // DNS / TCP / timeout
  }
}
```

Mapping:

| HTTP | Error class |
|---|---|
| 401 / 403 | `EthitrustAuthError` |
| 404       | `EthitrustNotFoundError` |
| 409       | `EthitrustConflictError` |
| 422       | `EthitrustValidationError` |
| 429       | `EthitrustRateLimitError` (auto-retried with `Retry-After`) |
| other 4xx | `EthitrustApiError` |
| 5xx       | `EthitrustApiError` (GETs auto-retried) |
| fetch/timeout | `EthitrustNetworkError` / `EthitrustAbortError` |

### Retries

By default the SDK retries:
* **GET** requests on `5xx` responses, network errors and timeouts,
* **any method** on `429`, honoring `Retry-After`,

up to `maxRetries` (default `2`) with exponential backoff + jitter capped at 10 s.

POST / PATCH / DELETE are **not** retried on `5xx` automatically; combined with the auto-generated idempotency key, you can safely retry them yourself.

## Development

```bash
pnpm install
pnpm build
pnpm test       # runs node --test against ./dist (build first)
pnpm example    # runs examples/basic.ts via tsx
```

## License

MIT
