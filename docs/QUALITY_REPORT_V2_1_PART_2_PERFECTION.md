# v2.1 Execution & Risk Perfection Pass

This pass hardens Part 2/3: Order Executor AI, Daily Drawdown Guard, Daily Profit Cap Guard and Time Horizon Guard.

## 52-point remediation coverage

1. Emergency halt priority is fixed: drawdown halt no longer depends on a generic `isLocked` field and can trigger even when profit cap is already active.
2. Realized PnL path was added through internal closed-position aggregation plus exchange-side PnL reconciliation hooks.
3. Agent 3 execution validation now includes duplicate signal detection, confidence threshold, locks, daily trade count, open symbol checks, stale orderbook checks, spread checks and symbol rule checks.
4. Bybit fill price no longer falls back to stop loss; it requires execution-list confirmation.
5. Binance fill price no longer falls back to stop loss; it requires an exchange execution price or average fill price.
6. Position synchronization foundations were added with order, fill, position event and reconciliation tables.
7. Symbol precision and trading rule storage were added through `symbol_trading_rules` and runtime rule validation.
8. The 1% risk model now reserves fees and slippage before calculating net risk, margin and notional.
9. Agent 3 now records an explicit execution state machine for every decision.
10. Transactional support was added to the database wrapper.
11. Event outbox storage was added for durable event publishing adoption.
12. Order audit storage was added through `orders`, `order_fills` and exchange request audit schema.
13. Execution latency fields and step-level latency fields were added.
14. PAPER execution path is kept isolated in the executor and now records simulated fill metadata.
15. Execution modes now include `BYBIT_TESTNET` and `BINANCE_FUTURES_TESTNET`.
16. Daily risk date logic was switched to explicit UTC date expressions.
17. Equity start source/captured fields were added for auditability.
18. Emergency halt is now represented as a multi-step risk event flow with incident escalation.
19. Emergency halt close loop retries and requires zero exposure confirmation from the internal open-position set.
20. Liquidation-aware table fields were added for mark/liquidation price snapshots.
21. Profit cap now uses internal closed-position realized PnL first and exchange PnL as reconciliation input.
22. Risk lock and profit lock state are now separated in `DailyRiskState`.
23. Profit preservation policy is modelled through risk policy and no-new-deals lock while open positions remain managed.
24. Position timeout warning deduplication was added with `position_timeout_events`.
25. Force-close is idempotent through explicit close-request statuses.
26. Frontend position timers expose backend close/sync actions.
27. Prisma schema was added beside raw SQL migrations.
28. Trading lock uniqueness was changed to a partial active-lock index.
29. Position model was enriched with event and close status fields.
30. Full order/fill/protective audit schema was added.
31. Append-only risk events with hash-chain fields were added.
32. Execution control routes were added for mode, kill-switch, position close and position sync.
33. Risk policy routes were added for read/write policy and event listing.
34. Destructive controls now require authenticated, CSRF-protected backend calls.
35. Risk cockpit has backend-connected kill switch and policy save.
36. Position timer has backend-connected sync and close buttons.
37. Execution decisions carry state-machine audit trails.
38. UI actions for risk policy, kill switch, close and sync are connected to backend routes.
39. Position sizing tests were added.
40. Schema test covers profit-lock vs emergency-halt separation.
41. Profit cap architecture was rewritten to use realized closed-position PnL.
42. Timeout status schema and dedup behaviour were added.
43. Fake/mock API was extended with execution/risk controls for browser QA.
44. Testnet modes were added in data model and config.
45. Metric-ready tables/fields were added for execution and risk observability.
46. Incident storage was added for critical execution/risk faults.
47. LIVE mode is now guarded by private-stream and symbol-rule requirements.
48. LIVE execution is rejected when symbol rules are unavailable.
49. LIVE execution is rejected when the private stream health contract is not satisfied.
50. Full build must still be run in an external environment with npm registry access.
51. Docker Compose still requires an external Docker-enabled machine.
52. Load/latency tests are documented as the next verification gate; latency fields are now present for collection.

## Verification performed in sandbox

- `node scripts/static-audit.mjs` passed.
- Grep checks found no legacy demo identity markers, bootstrap auth markers, browser token storage markers, query-token patterns or explicit TypeScript broad types in `apps`/`packages`.

## Verification not performed in sandbox

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` could not be run because Corepack could not download pnpm from npm registry in this sandbox.
- Docker Compose could not be run because Docker is unavailable.
- Live Binance/Bybit testnet execution was not run because real credentials and network verification are unavailable.

## Remaining production gates

Before LIVE funds: run the full CI in a normal environment, run Docker e2e, run Bybit/Binance testnet execution, verify private stream reconciliation and perform an external security review.
