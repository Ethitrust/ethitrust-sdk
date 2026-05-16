# AGENTS.md

Hand-crafted TypeScript SDK for the Ethitrust `org-escrows` REST API. **No codegen** — everything in `src/` is written by hand against the OpenAPI spec (`ethi-mono v0.1.0`). Keep it that way.

## Commands

Package manager is **pnpm** (declared via `devEngines`; CI uses pnpm v11 + Node 20). Scripts:

- `pnpm build` — `tsc -p tsconfig.json` → emits `./dist`
- `pnpm test` — **runs `node --test test/*.test.mjs` against `./dist`**, so you MUST `pnpm build` first or tests will fail with import errors
- `pnpm example` — runs `examples/basic.ts` via `tsx`
- `pnpm clean` — `rm -rf dist` (POSIX command; on Windows use `Remove-Item -Recurse -Force dist`)

There is no lint, formatter, or typecheck script — TypeScript is the only gate. `pnpm build` IS the typecheck.

To run a single test, use Node's filter:

```bash
pnpm build; node --test --test-name-pattern='iter\(\) pages' test/client.test.mjs
```

## Architecture

Single-package library. ESM-only (`"type": "module"`), Node 18+ (relies on global `fetch`).

Layering (do not invert):

- `src/index.ts` — public barrel; only re-exports
- `src/client.ts` — `EthitrustClient`, the user-facing entry. Holds an `HttpClient` and resource instances
- `src/http.ts` — `HttpClient`: URL building, headers, retries, backoff+jitter, timeout via `AbortController`, error mapping. The retry/abort loop is subtle — see `request()` at `src/http.ts:76`
- `src/resources/orgEscrows.ts` — thin method-per-endpoint layer. All path IDs go through `encodeURIComponent`. Writes auto-generate idempotency keys via `resolveIdempotencyKey` (`src/resources/orgEscrows.ts:240`); pass `null` to disable
- `src/errors.ts` — error hierarchy + `buildApiError` status→class mapping (401/403→Auth, 404→NotFound, 409→Conflict, 422→Validation, 429→RateLimit, other→Api). Network/timeout become `EthitrustNetworkError`/`EthitrustAbortError`
- `src/types.ts` — hand-written request/response types mirroring the OpenAPI spec
- `src/utils/query.ts`, `src/utils/idempotency.ts` — small helpers (Date→ISO, boolean→string in query; UUID v4 via `crypto.randomUUID`)

Retry policy lives only in `HttpClient`: GET retried on 5xx / network / timeout; **all methods retried on 429** honoring `Retry-After`; POST/PATCH/DELETE NOT retried on 5xx (caller can retry safely thanks to auto idempotency key). Backoff is exponential with jitter, capped at 10 s.

## Conventions

- Source is ESM with **explicit `.js` extensions in relative imports** (e.g. `from './http.js'`) even though sources are `.ts`. Required by `moduleResolution: "Bundler"` + Node ESM. Do not drop the `.js`.
- `tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, and `isolatedModules` on — array/record access is `T | undefined`; account for that.
- `tsconfig.json` excludes `test` and `examples`, so they are NOT typechecked by `pnpm build`. Tests are plain `.mjs` (`node:test` + `node:assert/strict`) and import from `../dist/index.js`. Examples use `tsx`.
- Types are hand-maintained — when the upstream OpenAPI changes, update `src/types.ts` and the matching resource method together. No generator runs.
- Public API is whatever `src/index.ts` re-exports. Adding a new export there is a public API change.
- Bare-host base URLs are auto-prefixed with `https://` (`normaliseBaseUrl` in `src/client.ts:65`); keep this behavior — a test asserts it.

## Release / CI

`.github/workflows/publish-npm.yml` publishes to npm on `release: published` or `push` of a `v*` tag. It runs `pnpm install --frozen-lockfile` then `pnpm run build` then `npm publish --access public` using `NPM_TOKEN`. There is no CI test job — tests run locally only.

Version lives in `package.json` and is duplicated in the default `User-Agent` (`@ethitrust/sdk/1.0.0 node`) at `src/http.ts:71`. Bump both when releasing.
