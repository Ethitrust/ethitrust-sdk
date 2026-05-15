import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EthitrustClient,
  EthitrustAuthError,
  EthitrustValidationError,
  EthitrustNotFoundError,
  generateIdempotencyKey,
} from '../dist/index.js';

/** Build a fake fetch that captures the last request and returns a configured response. */
function makeFakeFetch(responses) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(
      r.body === undefined ? null : JSON.stringify(r.body),
      {
        status: r.status ?? 200,
        statusText: r.statusText ?? 'OK',
        headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
      },
    );
  };
  fn.calls = calls;
  return fn;
}

test('idempotency key looks like a UUID', () => {
  const k = generateIdempotencyKey();
  assert.match(k, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('create() sends correct method, path, headers, body', async () => {
  const fake = makeFakeFetch([
    {
      status: 201,
      body: {
        id: '11111111-1111-1111-1111-111111111111',
        escrow_type: 'onetime',
        status: 'invited',
        initiator_actor_type: 'organization',
        initiator_id: null,
        initiator_org_id: 'org-1',
        receiver_id: null,
        receiver_email: 'b@x.com',
        initiator_role: 'buyer',
        title: 't',
        description: null,
        currency: 'ETB',
        amount: 100,
        fee_amount: 1,
        acceptance_criteria: null,
        inspection_period: 48,
        delivery_date: null,
        dispute_window: 72,
        who_pays_fees: 'buyer',
        org_id: 'org-1',
        offer_version: 1,
        counter_status: 'none',
        active_counter_offer_version: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    },
  ]);
  const c = new EthitrustClient({ apiKey: 'sk_test_123', fetch: fake });
  const out = await c.orgEscrows.create({
    invitee_email: 'b@x.com',
    title: 't',
    amount: 100,
  });
  assert.equal(out.id, '11111111-1111-1111-1111-111111111111');

  const call = fake.calls[0];
  assert.equal(call.init.method, 'POST');
  assert.equal(call.url, 'https://api.ethitrust.me/api/v1/org-escrows');
  const headers = call.init.headers;
  assert.equal(headers.get('x-api-key'), 'sk_test_123');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.ok(headers.get('x-idempotency-key'), 'auto-generated idempotency key');
  assert.deepEqual(JSON.parse(call.init.body), {
    invitee_email: 'b@x.com',
    title: 't',
    amount: 100,
  });
});

test('list() serialises query params (Date, boolean) and path', async () => {
  const fake = makeFakeFetch([
    { body: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0 } },
  ]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake });
  await c.orgEscrows.list({
    status: 'active',
    is_active: true,
    date_from: new Date('2025-01-01T00:00:00Z'),
    page: 2,
  });
  const url = new URL(fake.calls[0].url);
  assert.equal(url.pathname, '/api/v1/org-escrows');
  assert.equal(url.searchParams.get('status'), 'active');
  assert.equal(url.searchParams.get('is_active'), 'true');
  assert.equal(url.searchParams.get('date_from'), '2025-01-01T00:00:00.000Z');
  assert.equal(url.searchParams.get('page'), '2');
});

test('cancel() encodes path id and uses POST', async () => {
  const fake = makeFakeFetch([{ body: { id: 'x' }, status: 200 }]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake });
  await c.orgEscrows.cancel('abc/123', { idempotencyKey: 'idem-1' });
  assert.equal(
    fake.calls[0].url,
    'https://api.ethitrust.me/api/v1/org-escrows/abc%2F123/cancel',
  );
  assert.equal(fake.calls[0].init.method, 'POST');
  assert.equal(fake.calls[0].init.headers.get('x-idempotency-key'), 'idem-1');
});

test('401 maps to EthitrustAuthError', async () => {
  const fake = makeFakeFetch([
    { status: 401, statusText: 'Unauthorized', body: { detail: 'bad key' } },
  ]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake, maxRetries: 0 });
  await assert.rejects(
    () => c.orgEscrows.getStatus('id-1'),
    (e) => e instanceof EthitrustAuthError && e.status === 401,
  );
});

test('404 maps to EthitrustNotFoundError', async () => {
  const fake = makeFakeFetch([
    { status: 404, body: { detail: 'not found' } },
  ]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake, maxRetries: 0 });
  await assert.rejects(
    () => c.orgEscrows.getStatus('id-1'),
    (e) => e instanceof EthitrustNotFoundError,
  );
});

test('422 maps to EthitrustValidationError with parsed details', async () => {
  const fake = makeFakeFetch([
    {
      status: 422,
      body: { detail: [{ loc: ['body', 'amount'], msg: 'must be > 0', type: 'value_error' }] },
    },
  ]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake, maxRetries: 0 });
  await assert.rejects(
    () =>
      c.orgEscrows.create({
        invitee_email: 'a@b.c',
        title: 't',
        amount: 0,
      }),
    (e) => {
      if (!(e instanceof EthitrustValidationError)) return false;
      assert.equal(e.errors.length, 1);
      assert.equal(e.errors[0].msg, 'must be > 0');
      return true;
    },
  );
});

test('5xx GET is retried then succeeds', async () => {
  const fake = makeFakeFetch([
    { status: 503, body: { detail: 'down' } },
    { status: 200, body: {
      escrow_id: 'e1', organization_id: 'o1', status: 'active',
      is_active: true, can_cancel: true, can_resend_invite: false, can_accept: false,
      expires_at: null, funded_amount: 0, currency: 'ETB', amount: 1,
      updated_at: '2025-01-01T00:00:00Z',
    } },
  ]);
  const c = new EthitrustClient({
    apiKey: 'k', fetch: fake, maxRetries: 2,
  });
  // shrink backoff for fast test
  // (the default 300ms is fine; just a single retry here)
  const out = await c.orgEscrows.getStatus('e1');
  assert.equal(out.escrow_id, 'e1');
  assert.equal(fake.calls.length, 2);
});

test('iter() pages through all results', async () => {
  const fake = makeFakeFetch([
    { body: { items: [{ escrow_id: '1' }, { escrow_id: '2' }], page: 1, page_size: 2, total: 3, total_pages: 2 } },
    { body: { items: [{ escrow_id: '3' }], page: 2, page_size: 2, total: 3, total_pages: 2 } },
  ]);
  const c = new EthitrustClient({ apiKey: 'k', fetch: fake });
  const ids = [];
  for await (const e of c.orgEscrows.iter({ page_size: 2 })) ids.push(e.escrow_id);
  assert.deepEqual(ids, ['1', '2', '3']);
  assert.equal(fake.calls.length, 2);
});

test('baseUrl normalisation: bare host gets https://', async () => {
  const fake = makeFakeFetch([{ body: [] }]);
  const c = new EthitrustClient({
    apiKey: 'k',
    baseUrl: 'api.ethitrust.me',
    fetch: fake,
  });
  await c.orgEscrows.listWebhookLogs();
  assert.ok(fake.calls[0].url.startsWith('https://api.ethitrust.me/'));
});
