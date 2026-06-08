# Multi-Agent Core v2.5 — GitHub Pages Demo Link + Institutional Trading Core

This repository contains the institutional multi-agent trading platform built through Parts 1 and 2: market intelligence, OSINT strategy parsing, encrypted API vault, execution/risk layer, private stream safety, reconciliation, Safe Mode, Operations Command Center, Portfolio Protection, Forensic Audit, Approval Mode, Disaster Recovery, Compliance and Test Evidence.

Version **2.5** adds a dedicated **GitHub Pages Demo Mode** so the premium multi-page console can be shared with a friend through a GitHub-only static link without Docker, Vercel, PostgreSQL, Redis or a backend server.

## What GitHub Pages Demo Mode gives you

- Static website deployable to `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`.
- No Docker required.
- No Vercel required.
- No PostgreSQL or Redis required.
- No exchange API keys required.
- Full institutional UI with mock/demo data.
- Working pages, navigation, command palette, drawers, filters, export buttons, risk controls, readiness wizard and operator actions.
- A visible `GitHub Pages Demo` badge so nobody confuses it with the live trading environment.

## What GitHub Pages Demo Mode cannot do

GitHub Pages is static hosting. It cannot run:

- Fastify backend API.
- PostgreSQL migrations.
- Redis Streams/PubSub.
- Workers / agents.
- Binance or Bybit private streams.
- Real API-key vault operations.
- Real order execution.

For live trading or testnet certification, use the full backend stack with Docker or a real server.

## Fastest way to create a link for a friend without Docker or Vercel

### 1. Create an empty GitHub repository

Example repository name:

```text
ma-core-platform
```

### 2. Push this folder from VS Code / PowerShell

```powershell
git init
git add .
git commit -m "Deploy MA Core institutional demo"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ma-core-platform.git
git push -u origin main
```

### 3. Enable GitHub Pages through Actions

In GitHub:

```text
Repository → Settings → Pages → Source → GitHub Actions
```

### 4. Wait for the workflow

GitHub will run:

```text
.github/workflows/github-pages.yml
```

When it finishes, your demo link will be:

```text
https://YOUR_USERNAME.github.io/ma-core-platform/
```

## Local GitHub Pages static build

If `pnpm` is installed locally:

```bash
pnpm install --no-frozen-lockfile
pnpm verify:github-pages
```

The static site will be exported to:

```text
apps/web/out
```

## Full backend local start

Use this only when Docker is installed and you want the real API + DB + Redis stack:

```bash
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @ma-core/shared build
pnpm migrate
pnpm dev:api
pnpm dev:web
```

Open:

```text
http://localhost:3000
```

## Full Docker stack

```bash
docker compose up --build
```

## Full e2e stack

```bash
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e
```

## Test and verification commands

```bash
pnpm verify:static
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e:mock
pnpm visual:qa:mock
```

## Architecture summary

```text
Exchange WS/REST → Agent 1 Market Analyst → Redis Streams/PubSub → Agent 2 Strategist → Agent 3 Executor
                                                                               ↓
                                  Agent 4 Drawdown Guard / Agent 5 Profit Cap Guard / Agent 6 Time Horizon Guard
                                                                               ↓
                                      Safe Mode / Reconciliation / Protection Supervisor / Forensic Audit
```

## Safety boundary

The GitHub Pages link is a **demo environment only**. It is designed for presentation, UX review and investor/friend preview. Real trading, testnet execution, private streams and risk enforcement require the backend stack and real infrastructure.

## Main console sections

- Overview
- Live Terminal
- Strategy Feed
- Signal Terminal
- Market Analysis
- Agent Network
- API Vault
- Risk Manager
- Positions
- Incidents
- Live Readiness
- Command Center
- Portfolio
- Forensic Audit
- Approvals
- Disaster Recovery
- Compliance
- Evidence
- Ops
- Settings
