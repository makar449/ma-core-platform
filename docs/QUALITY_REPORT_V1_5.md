# MA Core v1.5 Quality Report

## Scope

Version 1.5 is a verification and UI-quality pass over v1.4. The goal is not to add new trading agents. The goal is to make the approved institutional terminal design measurable, routable, testable and safer to evolve.

## Implemented

- Fixed strict TypeScript errors found during a real clean install and root typecheck.
- Added root Playwright dependency and lockfile updates.
- Added Playwright config with Chromium, WebKit and 1920px institutional-wide projects.
- Added e2e coverage for:
  - registration and cookie-session entry;
  - every sidebar route;
  - command palette navigation;
  - detail drawer open and close;
  - notification drawer open and close;
  - terminal pause and resume;
  - visible data export;
  - Vault validation feedback;
  - Risk policy save feedback;
  - Settings state changes and save feedback;
  - visual QA screenshots for core console pages.
- Added route-aware sidebar navigation through the Next.js router.
- Added stable test selectors for auth, navigation, command palette, notification drawer, detail drawer and logout.
- Added `docker-compose.e2e.yml` for a full browser-test stack.
- CI now installs Playwright Chromium, runs e2e and uploads browser reports plus visual QA screenshots.

## Verified in this environment

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm typecheck`
- `node scripts/static-audit.mjs`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm exec playwright test -c apps/web/playwright.config.ts --list`

## Not verified in this environment

- Docker Compose e2e stack, because Docker is not installed in the sandbox.
- Playwright browser execution against the full API/Web/Postgres/Redis stack, because local Postgres and Redis services are not installed in the sandbox.
- Live Binance and Bybit WebSocket connectivity.
- Real exchange API-key permission checks with user-owned keys.
- GitHub Actions execution on GitHub infrastructure.

## Visual QA standard

The approved direction is an institutional terminal for affluent operators:

- deep graphite/navy surfaces;
- restrained violet and blue accents;
- green only for operational success;
- red only for loss or risk states;
- high-density tables and panels;
- command/search bar at the top;
- persistent sidebar navigation;
- subtle glassmorphism without toy-like glow;
- animation through opacity and transform only.

The Playwright visual QA test stores screenshots under `apps/web/test-results/visual-qa` when executed.
