/**
 * Serialise a flat record to a URLSearchParams instance.
 *  - `undefined` / `null` values are skipped.
 *  - `Date` objects are serialised to ISO 8601.
 *  - Arrays are repeated as `?key=a&key=b`.
 */
export function toQueryString(
  params: Record<string, unknown> | undefined,
): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        usp.append(k, serialiseScalar(item));
      }
    } else {
      usp.append(k, serialiseScalar(v));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function serialiseScalar(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}
