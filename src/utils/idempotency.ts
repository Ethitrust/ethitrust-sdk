import { randomUUID, randomBytes } from 'node:crypto';

/**
 * Generate a RFC-4122 v4 idempotency key suitable for the
 * `X-Idempotency-Key` header.
 *
 * Falls back to the Web Crypto API when `node:crypto` is unavailable
 * (e.g. edge runtimes).
 */
export function generateIdempotencyKey(prefix?: string): string {
  let id: string;
  try {
    id = randomUUID();
  } catch {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto?.randomUUID) {
      id = g.crypto.randomUUID();
    } else {
      id = randomBytes(16).toString('hex');
    }
  }
  return prefix ? `${prefix}_${id}` : id;
}
