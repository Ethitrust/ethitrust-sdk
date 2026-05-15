import type { HttpClient } from '../http.js';
import type {
  InitializeEscrowResponse,
  ListOrgEscrowsParams,
  OrgEscrowAuditTrailResponse,
  OrgEscrowCancelResponse,
  OrgEscrowDetailResponse,
  OrgEscrowHealthResponse,
  OrgEscrowListItem,
  OrgEscrowListResponse,
  OrgEscrowReportParams,
  OrgEscrowReportResponse,
  OrgEscrowStatusResponse,
  OrganizationInitializeEscrowRequest,
  WebhookLogEntry,
  WebhookTestResponse,
} from '../types.js';
import { generateIdempotencyKey } from '../utils/idempotency.js';

export interface RequestExtras {
  /**
   * Idempotency key for write operations. If omitted, the SDK auto-generates
   * a UUID v4 so safe retries remain idempotent.
   * Pass `null` to explicitly disable the header.
   */
  idempotencyKey?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class OrgEscrowsResource {
  constructor(private readonly http: HttpClient) {}

  // ── CRUD-ish ──────────────────────────────────────────────────────────────

  /** POST /api/v1/org-escrows — initialise a new escrow on behalf of the org. */
  create(
    body: OrganizationInitializeEscrowRequest,
    extras: RequestExtras = {},
  ): Promise<InitializeEscrowResponse> {
    return this.http.request<InitializeEscrowResponse>({
      method: 'POST',
      path: '/api/v1/org-escrows',
      body,
      idempotencyKey: resolveIdempotencyKey(extras.idempotencyKey),
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** GET /api/v1/org-escrows — paginated, filterable list. */
  list(
    params: ListOrgEscrowsParams = {},
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowListResponse> {
    return this.http.request<OrgEscrowListResponse>({
      method: 'GET',
      path: '/api/v1/org-escrows',
      query: params as Record<string, unknown>,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /**
   * Async iterator over every page of org escrows. Yields individual
   * `OrgEscrowListItem` records.
   *
   * ```ts
   * for await (const e of client.orgEscrows.iter({ status: 'active' })) {
   *   console.log(e.escrow_id);
   * }
   * ```
   */
  async *iter(
    params: ListOrgEscrowsParams = {},
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): AsyncGenerator<OrgEscrowListItem, void, void> {
    let page = params.page ?? 1;
    const pageSize = params.page_size ?? 20;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await this.list({ ...params, page, page_size: pageSize }, extras);
      for (const item of res.items) yield item;
      if (page >= res.total_pages || res.items.length === 0) return;
      page++;
    }
  }

  /** GET /api/v1/org-escrows/{escrow_id} — lightweight status snapshot. */
  getStatus(
    escrowId: string,
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowStatusResponse> {
    return this.http.request<OrgEscrowStatusResponse>({
      method: 'GET',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}`,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** GET /api/v1/org-escrows/{escrow_id}/detail — full detail incl. progress, risk flags. */
  getDetail(
    escrowId: string,
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowDetailResponse> {
    return this.http.request<OrgEscrowDetailResponse>({
      method: 'GET',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/detail`,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** GET /api/v1/org-escrows/{escrow_id}/events — audit trail. */
  getEvents(
    escrowId: string,
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowAuditTrailResponse> {
    return this.http.request<OrgEscrowAuditTrailResponse>({
      method: 'GET',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/events`,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** GET /api/v1/org-escrows/{escrow_id}/health — boolean state flags. */
  getHealth(
    escrowId: string,
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowHealthResponse> {
    return this.http.request<OrgEscrowHealthResponse>({
      method: 'GET',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/health`,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** POST /api/v1/org-escrows/{escrow_id}/cancel — cancel & refund (if eligible). */
  cancel(
    escrowId: string,
    extras: RequestExtras = {},
  ): Promise<OrgEscrowCancelResponse> {
    return this.http.request<OrgEscrowCancelResponse>({
      method: 'POST',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/cancel`,
      idempotencyKey: resolveIdempotencyKey(extras.idempotencyKey),
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** POST /api/v1/org-escrows/{escrow_id}/resend — resend the invitation email. */
  resendInvitation(
    escrowId: string,
    extras: RequestExtras = {},
  ): Promise<InitializeEscrowResponse> {
    return this.http.request<InitializeEscrowResponse>({
      method: 'POST',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/resend`,
      idempotencyKey: resolveIdempotencyKey(extras.idempotencyKey),
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  // ── Reports ───────────────────────────────────────────────────────────────────

  /** GET /api/v1/org-escrows/reports/summary — org-wide aggregates over a period. */
  getReport(
    params: OrgEscrowReportParams = {},
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<OrgEscrowReportResponse> {
    return this.http.request<OrgEscrowReportResponse>({
      method: 'GET',
      path: '/api/v1/org-escrows/reports/summary',
      query: params as Record<string, unknown>,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  /** GET /api/v1/org-escrows/{escrow_id}/webhooks — deliveries for one escrow. */
  listEscrowWebhookLogs(
    escrowId: string,
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<WebhookLogEntry[]> {
    return this.http.request<WebhookLogEntry[]>({
      method: 'GET',
      path: `/api/v1/org-escrows/${encodeURIComponent(escrowId)}/webhooks`,
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** GET /api/v1/org-escrows/webhooks — 50 most recent deliveries across the org. */
  listWebhookLogs(
    extras: Omit<RequestExtras, 'idempotencyKey'> = {},
  ): Promise<WebhookLogEntry[]> {
    return this.http.request<WebhookLogEntry[]>({
      method: 'GET',
      path: '/api/v1/org-escrows/webhooks',
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }

  /** POST /api/v1/org-escrows/webhooks/test — send a synthetic delivery. */
  testWebhook(
    extras: RequestExtras = {},
  ): Promise<WebhookTestResponse> {
    return this.http.request<WebhookTestResponse>({
      method: 'POST',
      path: '/api/v1/org-escrows/webhooks/test',
      idempotencyKey: resolveIdempotencyKey(extras.idempotencyKey),
      signal: extras.signal,
      timeoutMs: extras.timeoutMs,
      headers: extras.headers,
    });
  }
}

function resolveIdempotencyKey(
  k: string | null | undefined,
): string | undefined {
  if (k === null) return undefined; // explicitly disabled
  if (k === undefined) return generateIdempotencyKey();
  return k;
}
