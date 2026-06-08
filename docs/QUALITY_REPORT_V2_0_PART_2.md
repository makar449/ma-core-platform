# MA Core v2.0 Part 2 Execution and Autonomous Risk Layer

## Implemented scope

This version adds the autonomous execution and capital protection layer requested in Part 2/3.

### Agent 3 Order Executor

Agent 3 consumes user-scoped strategy signals from the durable `agent.strategy.signal` stream and converts them into strict executable payloads. It validates account status, trading locks, available balance, top-of-book slippage, position sizing and exchange readiness before opening a bracket order.

The executor supports:

- incoming signal runtime validation
- 1% equity risk sizing
- available balance check
- ask/bid slippage guard
- paper execution mode
- live exchange wrapper path for Binance USD-M futures and Bybit linear contracts
- bracket order registration with stop loss and take profit
- forced close commands from risk and time guard agents
- persistent execution decisions
- user-scoped execution event envelopes

### Agent 4 Daily Drawdown Guard

Agent 4 scans enabled exchange accounts every five seconds, persists daily equity state, publishes risk telemetry and triggers `EMERGENCY_HALT` when drawdown reaches the configured threshold. The default threshold is 5%.

When the circuit activates it:

- writes a global trading lock
- marks the daily risk stat as locked by risk
- emits `agent.risk.halt`
- sends the positions to Agent 3 for forced closing

### Agent 5 Daily Profit Cap Guard

Agent 5 scans enabled accounts every fifteen seconds and activates `NEW_DEALS_LOCK` when realized profit reaches the configured daily cap. The default cap is 15%.

It does not close existing positions. It only prevents new orders until the UTC day ends.

### Agent 6 Time Horizon Guard

Agent 6 scans open positions every sixty seconds. It emits a warning after 165 minutes and emits `FORCE_CLOSE_TIMEOUT` after 180 minutes. Agent 3 receives the force-close event and submits a reduce-only market close.

### Database layer

Migration `003_part2_execution_risk.sql` adds:

- `user_exchange_accounts`
- `daily_trading_stats`
- `trading_locks`
- `active_positions`
- `execution_decisions`
- `exchange_order_audit`
- execution columns on `trade_signals`

### Frontend layer

The institutional console now includes:

- Agent 3 execution audit trail
- Agent 4 daily drawdown ring
- Agent 5 daily profit cap ring
- Agent 6 position TTL countdown cards
- circuit breaker health status
- active lock display
- execution decisions in the Signal Terminal
- richer Risk Manager page

### QA and mock layer

The Playwright mock API now includes:

- valid execution decisions
- valid open positions
- valid risk state
- valid risk and execution SSE events
- user-scoped UUIDs compatible with the shared schemas

## Verified in this sandbox

The static audit passed:

```bash
node scripts/static-audit.mjs
```

No forbidden placeholders, legacy browser token storage, demo user, bootstrap auth token, query-token pattern or explicit TypeScript `any` pattern was introduced.

## Not verified in this sandbox

The following checks were not confirmed because this sandbox cannot fetch pnpm from npm registry and Docker is unavailable:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:mock`
- Docker Compose e2e
- live Binance or Bybit WebSocket
- real exchange API-key trading flow

## Required next verification on a real machine

Run:

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

Then validate live exchange integrations with testnet keys before any production key is allowed to use `EXECUTION_DEFAULT_MODE=LIVE`.
