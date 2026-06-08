# Quality Report v2.2 — Part 2 Execution & Risk Verification Pass

## Scope

This pass continues Technical Specification Part 2/3 and focuses on runtime safety defects that still existed after v2.1:

- destructive execution routes must require CSRF and operator password re-authentication;
- manual close must reach Agent 3 instead of only mutating local database state;
- operator kill switch must lock the account and actively attempt to close exposure;
- browser CORS policy must allow the already implemented PUT/DELETE risk routes;
- frontend actions must send the required password-confirmed payloads;
- mock e2e API must match the tightened backend response contracts;
- the project must contain a static Part 2 safety audit that is runnable without external services.

## Fixes completed

1. Added `AuthService.requirePasswordReauth(userId, password)` for critical operator actions.
2. Added CSRF enforcement to all mutating risk/execution routes in `apps/api/src/routes/risk.ts`.
3. Added operator password re-authentication to:
   - `POST /api/execution/mode` when enabling `LIVE`;
   - `POST /api/execution/kill-switch`;
   - `POST /api/execution/positions/:id/close`;
   - `POST /api/risk/locks/manual`;
   - `DELETE /api/risk/locks/:id`.
4. Rewired manual close to `OrderExecutorAgent.forceClosePositionById(...)` so the command reaches the execution layer.
5. Rewired kill switch to `OrderExecutorAgent.forceCloseAllForAccount(...)` so it both persists the global lock and attempts to close open exposure.
6. Added idempotent manual force-close behavior for already closing/closed positions.
7. Added critical incident logging when manual kill-switch exposure closure partially fails.
8. Added backend routes for:
   - `POST /api/risk/locks/manual`;
   - `DELETE /api/risk/locks/:id`;
   - `POST /api/risk/recalculate`;
   - `GET /api/execution/decisions/:id`;
   - `GET /api/execution/orders`;
   - `GET /api/execution/audit`.
9. Added `OrderRepository.listForUser(...)`.
10. Added `ExchangeAuditRepository.listForUser(...)`.
11. Updated app dependency wiring for order audit and exchange audit routes.
12. Fixed CORS allowed methods to include `PUT` and `DELETE`.
13. Updated frontend API client so kill switch and manual close send password-confirmed payloads.
14. Updated Risk Cockpit buttons to ask for operator password before destructive actions.
15. Updated Playwright mock API to return the tightened kill-switch response and new execution audit routes.
16. Added `scripts/part2-safety-audit.mjs`.
17. Added `pnpm verify:part2` and extended `pnpm verify:static` to run both static and Part 2 safety checks.

## Commands verified in this sandbox

```bash
node scripts/static-audit.mjs
node scripts/part2-safety-audit.mjs
```

Both checks passed.

## Commands not verified in this sandbox

The following commands could not be verified because Corepack attempted to download pnpm from npm registry and the sandbox DNS request failed with `EAI_AGAIN registry.npmjs.org`:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e:mock
pnpm visual:qa:mock
```

Docker Compose and live/testnet exchange verification also remain unverified in this sandbox because Docker and real exchange credentials are unavailable.

## Remaining live-money blockers

Before enabling real money trading, a real environment must still confirm:

1. Full TypeScript, test, lint and build pipeline.
2. Docker Compose stack with API, web, PostgreSQL, Redis and e2e runner.
3. Binance Futures Testnet and Bybit Testnet execution.
4. Private order/position stream reconciliation.
5. Symbol trading rules sync for every enabled instrument.
6. Emergency halt against testnet positions.
7. Manual kill switch against testnet positions.
8. 24-hour soak/load test with Redis Streams, SSE and database contention.
