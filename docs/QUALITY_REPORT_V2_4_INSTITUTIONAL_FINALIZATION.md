# MA Core v2.4 Institutional Finalization Pass

## Scope

This pass upgrades Part 2 from live-safety infrastructure into an institutional operating product. The update adds live readiness workflow, safe mode, operations command center, portfolio protection, forensic audit mode, human approval gates, disaster recovery, compliance records and test evidence reporting.

## Backend additions

- Added migration `006_v24_institutional_finalization.sql`.
- Added `InstitutionalRepository` for safe mode, operations health, portfolio snapshots, forensic cases, approval requests, recovery drills, compliance acceptances, test evidence reports and live readiness wizard runs.
- Added `registerInstitutionalRoutes` with authenticated and CSRF-protected routes for all institutional workflows.
- Added `SafeModeMonitorWorker` that automatically activates safe mode when private streams become unhealthy or critical reconciliation mismatches remain unresolved.
- Added `SensitiveRouteLimiter` for high-risk routes such as login, registration, exchange connect, kill switch, manual close, live mode change and lock release.
- Wired the institutional repository, routes, sensitive limiter and safe mode monitor into the API app runtime.

## Frontend additions

- Added pages and route entries for `/readiness`, `/operations-command`, `/portfolio`, `/forensics`, `/approvals`, `/disaster-recovery`, `/compliance` and `/test-evidence`.
- Added navigation items and command palette actions for every new institutional page.
- Added Live Readiness Wizard with operator certification actions.
- Added Operations Command Center with safe mode activation and subsystem health views.
- Added Portfolio Protection dashboard with capital-at-risk and exposure map.
- Added Forensic Audit page with signal-to-close evidence case creation.
- Added Human Approval page for approval-required control flow.
- Added Disaster Recovery page for resilience drills.
- Added Compliance Center for risk disclosure, API permission warning and live consent records.
- Added Test Evidence page for CI, Docker, e2e, testnet, security and load report artifacts.

## Verification performed in sandbox

- `node scripts/static-audit.mjs` passed.
- `node scripts/part2-safety-audit.mjs` passed.
- Static audit confirmed no forbidden production markers, browser token storage, legacy demo identity or explicit TypeScript `any` patterns in audited source files.

## Verification not confirmed in sandbox

- Full `pnpm install` was not confirmed because Corepack could not download pnpm from npm registry in this environment.
- TypeScript build, unit tests, lint, Next build and Playwright runtime were not confirmed in this sandbox.
- Docker Compose was not confirmed because Docker is not available in this sandbox.
- Binance and Bybit testnet/live private streams were not confirmed because real exchange credentials and network execution are not available here.
- Latency under 50 ms was not confirmed because it requires deployed infrastructure near exchange endpoints.

## Required next evidence outside sandbox

Run the following in a real CI or workstation with Docker, npm registry and Playwright browsers available:

```bash
pnpm install --frozen-lockfile
pnpm verify:static
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e:mock
pnpm visual:qa:mock
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e
```

Then run Bybit Testnet and Binance Futures Testnet certification through the Live Readiness Wizard before enabling live trading.
