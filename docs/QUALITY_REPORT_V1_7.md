# MA Core v1.7 Quality Report

## Scope

This pass targets defects that could make the product feel unfinished or unsafe even if the visual shell is strong: invalid mock API payloads, incomplete SSE user filtering, unsafe external links, frontend requests without explicit timeout cancellation, stale route state and insufficient visual warning states.

## Added or fixed

- Fixed Playwright mock API fixtures so strategies, signals, market vectors and SSE events match shared Zod schemas.
- Changed mock SSE from an untyped `message` event to a named `agent.market.vector` event plus heartbeat, matching the real backend.
- Hardened `/api/live/events` so user-scoped events are filtered from envelope `user_id`, security audit payload ownership and signal payload ownership.
- Added backend-safe SSE write guards for closed/destroyed responses.
- Added HTTP(S)-only URL validation via shared `HttpUrlSchema`.
- Added drawer-level runtime URL sanitization so non-http protocols render as blocked instead of clickable.
- Added frontend API timeout/abort handling, typed timeout and parse errors, retry backoff and production `NEXT_PUBLIC_API_URL` validation.
- Added deduplication of SSE events in `useLiveEvents` and heartbeat-aware connection state.
- Added route-state synchronization from `usePathname()` so browser back/forward keeps the active console view correct.
- Added an operator connection banner for loading, reconnect and API error states.
- Added an event/source security contract test covering HTTP(S) source validation and strategy-feed envelope parsing.

## Verified in sandbox

- `node scripts/static-audit.mjs` passed after the modifications.
- Grep checks did not find legacy demo identity strings, bootstrap-auth markers, browser token-storage patterns, query-token patterns, obsolete mock envelope versions or the old vault sender name.

## Not verified in sandbox

- `pnpm install`, `typecheck`, `test`, `lint`, `build` could not be rerun because Corepack failed to download pnpm from `registry.npmjs.org` with DNS `EAI_AGAIN`.
- Docker Compose could not be run because Docker is unavailable in the sandbox.
- Playwright browser runtime and screenshots were not produced because browser binaries could not be downloaded here.
- Live Binance/Bybit WebSocket and real exchange API-key checks remain unverified in this environment.
