import type { Page, Route } from "@playwright/test";
import type { AdapterStatus, AgentEnvelope, DailyRiskState, ExecutionDecision, LiveReadinessCheck, Position, PrivateStreamStatus, ReconciliationMismatch, ReconciliationRun, StrategyRule, TradeSignal, SafeModeEvent, OperationsHealthSnapshot, PortfolioSnapshot, ForensicAuditCase, ApprovalRequest, DisasterRecoveryRun, ComplianceAcceptance, TestEvidenceReport, LiveReadinessWizardRun } from "@ma-core/shared";

interface MockRouteContext {
  readonly route: Route;
  readonly url: URL;
}

const now = new Date("2026-06-08T02:40:00.000Z");
const operatorId = "11111111-1111-4111-8111-111111111111";

export async function installMockApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const context: MockRouteContext = { route, url: requestUrl };
    if (requestUrl.pathname === "/api/auth/me") return json(context, sessionPayload());
    if (requestUrl.pathname === "/api/auth/register") return json(context, sessionPayload());
    if (requestUrl.pathname === "/api/auth/login") return json(context, sessionPayload());
    if (requestUrl.pathname === "/api/auth/refresh") return json(context, sessionPayload());
    if (requestUrl.pathname === "/api/auth/logout") return json(context, { ok: true });
    if (requestUrl.pathname === "/api/live/events") return eventStream(context);
    if (requestUrl.pathname === "/api/events/recent") return json(context, recentEvents());
    if (requestUrl.pathname === "/api/signals") return json(context, signals());
    if (requestUrl.pathname === "/api/strategies") return json(context, strategies());
    if (requestUrl.pathname === "/api/market/adapters/status") return json(context, adapterStatuses());
    if (requestUrl.pathname === "/api/risk/state") return json(context, riskStateResponse());
    if (requestUrl.pathname === "/api/risk/events") return json(context, riskEvents());
    if (requestUrl.pathname === "/api/risk/policy") return json(context, riskPolicy());
    if (requestUrl.pathname === "/api/execution/kill-switch") return json(context, { lock: { id: "lock_manual_2026", userId: operatorId, accountId: "22222222-2222-4222-8222-222222222222", lockType: "GLOBAL_TRADING_LOCK", reason: "MANUAL_LOCK", active: true, lockUntil: new Date(now.getTime() + 3600000).toISOString(), createdAt: now.toISOString() }, closeResult: { closed: 1, failed: 0 } });
    if (requestUrl.pathname === "/api/execution/mode") return json(context, { ok: true });
    if (requestUrl.pathname.startsWith("/api/execution/positions/") && requestUrl.pathname.endsWith("/close")) return json(context, { position: { ...firstPosition(), status: "FORCE_CLOSE_REQUESTED", forceCloseRequestedAt: now.toISOString() } });
    if (requestUrl.pathname.startsWith("/api/execution/positions/") && requestUrl.pathname.endsWith("/sync")) return json(context, { position: firstPosition(), syncQueued: true });
    if (requestUrl.pathname === "/api/positions/open") return json(context, positions());
    if (requestUrl.pathname === "/api/executions") return json(context, executions());
    if (requestUrl.pathname.startsWith("/api/execution/decisions/")) return json(context, executions()[0]);
    if (requestUrl.pathname === "/api/execution/orders") return json(context, []);
    if (requestUrl.pathname === "/api/execution/audit") return json(context, []);
    if (requestUrl.pathname === "/api/private-streams") return json(context, privateStreams());
    if (requestUrl.pathname === "/api/live-readiness") return json(context, liveReadiness());
    if (requestUrl.pathname === "/api/live-readiness/checks") return json(context, liveReadiness()[0] ?? { ok: true });
    if (requestUrl.pathname === "/api/reconciliation/runs") return json(context, reconciliationRuns());
    if (requestUrl.pathname === "/api/reconciliation/mismatches") return json(context, reconciliationMismatches());
    if (requestUrl.pathname === "/api/incidents") return json(context, incidents());
    if (requestUrl.pathname === "/api/safe-mode") return json(context, safeModeEvents());
    if (requestUrl.pathname.startsWith("/api/safe-mode/") && requestUrl.pathname.endsWith("/resolve")) return json(context, safeModeEvents()[0]);
    if (requestUrl.pathname === "/api/operations/command-center") return json(context, operationsHealth());
    if (requestUrl.pathname === "/api/portfolio/protection") return json(context, portfolioSnapshot());
    if (requestUrl.pathname === "/api/forensic-audit") return json(context, route.request().method() === "POST" ? forensicCases()[0] : forensicCases());
    if (requestUrl.pathname === "/api/approval-requests") return json(context, route.request().method() === "POST" ? approvalRequests()[0] : approvalRequests());
    if (requestUrl.pathname.startsWith("/api/approval-requests/") && requestUrl.pathname.endsWith("/decision")) return json(context, { ...approvalRequests()[0], status: "APPROVED", decidedAt: now.toISOString() });
    if (requestUrl.pathname === "/api/disaster-recovery") return json(context, disasterRecoveryRuns());
    if (requestUrl.pathname === "/api/disaster-recovery/run") return json(context, disasterRecoveryRuns()[0]);
    if (requestUrl.pathname === "/api/compliance/status") return json(context, complianceAcceptances());
    if (requestUrl.pathname === "/api/compliance/accept") return json(context, complianceAcceptances()[0]);
    if (requestUrl.pathname === "/api/test-evidence") return json(context, route.request().method() === "POST" ? testEvidenceReports()[0] : testEvidenceReports());
    if (requestUrl.pathname === "/api/live-readiness/wizard") return json(context, liveReadinessWizard());
    if (requestUrl.pathname === "/api/live-readiness/wizard/step") return json(context, liveReadinessWizard());
    if (requestUrl.pathname === "/api/ops/outbox") return json(context, outboxItems());
    if (requestUrl.pathname === "/api/ops/metrics") return json(context, metrics());
    if (requestUrl.pathname === "/api/ops/streams/metrics") return json(context, streamMetrics());
    if (requestUrl.pathname === "/api/ops/streams/dead-letter") return json(context, []);
    if (requestUrl.pathname === "/api/agents/market-analysis/run") return json(context, { ok: true, transaction_id: "tx_mock_market_cycle_2026" });
    if (requestUrl.pathname === "/api/exchanges/connect") return json(context, { message: "Exchange credentials were validated and encrypted in the vault." });
    return json(context, { message: `Mock API route is not registered: ${requestUrl.pathname}` }, 404);
  });
}

function sessionPayload(): { readonly ok: true; readonly csrfToken: string; readonly user: { readonly id: string; readonly email: string; readonly roles: readonly string[] } } {
  return { ok: true, csrfToken: "csrf_mock_operator_token", user: { id: operatorId, email: "operator@ma-core.local", roles: ["operator", "admin"] } };
}

function recentEvents(): readonly object[] {
  return [
    envelopeRow(marketVectorEnvelope()),
    envelopeRow(executionStatusEnvelope()),
    envelopeRow(riskStateEnvelope()),
    envelopeRow(positionTimeoutEnvelope()),
    envelopeRow(strategyFeedEnvelope()),
    envelopeRow(securityAuditEnvelope())
  ];
}

function envelopeRow(envelope: AgentEnvelope): object {
  return {
    schema_version: envelope.schema_version,
    transaction_id: envelope.transaction_id,
    trace_id: envelope.trace_id,
    created_at: envelope.timestamp,
    sender_agent: envelope.sender_agent,
    target_agent: envelope.target_agent ?? null,
    channel: envelope.channel,
    pipeline_stage: envelope.pipeline_stage,
    idempotency_key: envelope.idempotency_key,
    agent_log: envelope.agent_log,
    user_id: envelope.user_id ?? null,
    payload: envelope.payload
  };
}

function marketVectorEnvelope(): AgentEnvelope {
  return {
    schema_version: "1.3",
    transaction_id: "tx_mock_market_vector_2026",
    trace_id: "trace_mock_market_vector_2026",
    timestamp: now.toISOString(),
    sender_agent: "Agent_1_Market_Analyst",
    target_agent: "Agent_2_Strategist",
    channel: "agent.market.vector",
    pipeline_stage: "market_analysis",
    idempotency_key: "idem_mock_market_vector_2026",
    agent_log: "Market vector updated from Binance BTC/USDT orderbook pressure.",
    payload: marketVectorPayload()
  };
}

function strategyFeedEnvelope(): AgentEnvelope {
  return {
    schema_version: "1.3",
    transaction_id: "tx_mock_strategy_feed_2026",
    trace_id: "trace_mock_strategy_feed_2026",
    timestamp: new Date(now.getTime() - 70_000).toISOString(),
    sender_agent: "Agent_2_Strategist",
    channel: "agent.strategy.feed",
    pipeline_stage: "strategy_ingestion",
    idempotency_key: "idem_mock_strategy_feed_2026",
    agent_log: "Strategy evidence score accepted a high-conviction EMA200 breakout pattern.",
    payload: {
      sourceType: "YOUTUBE",
      sourceTitle: "Institutional EMA200 breakout setup",
      sourceUrl: "https://example.com/ema200-breakout",
      trigger: "15m candle close > EMA200 with positive orderbook imbalance",
      action: "LONG",
      confidenceScore: 0.83,
      sourceTrustScore: 0.92,
      freshnessScore: 0.86,
      evidenceScore: 0.83,
      reviewStatus: "ACCEPTED",
      reviewReason: "Concrete trigger, timeframe, invalidation and risk/reward were present."
    }
  };
}


function executionStatusEnvelope(): AgentEnvelope {
  return {
    schema_version: "1.3",
    transaction_id: "tx_signal_btc_long",
    trace_id: "trace_mock_execution_2026",
    timestamp: new Date(now.getTime() - 20_000).toISOString(),
    sender_agent: "Agent_3_Executor",
    channel: "agent.execution.status",
    pipeline_stage: "order_execution",
    idempotency_key: "idem_mock_execution_status_2026",
    agent_log: "Agent 3 opened a paper bracket order after balance and slippage validation.",
    user_id: operatorId,
    payload: firstExecution()
  };
}

function riskStateEnvelope(): AgentEnvelope {
  return {
    schema_version: "1.3",
    transaction_id: "tx_mock_risk_state_2026",
    trace_id: "trace_mock_risk_state_2026",
    timestamp: new Date(now.getTime() - 35_000).toISOString(),
    sender_agent: "Agent_4_Risk_Manager_A",
    channel: "agent.risk.state",
    pipeline_stage: "risk_drawdown_guard",
    idempotency_key: "idem_mock_risk_state_2026",
    agent_log: "Daily drawdown guard reports 1.2% drawdown against 5% emergency circuit.",
    user_id: operatorId,
    payload: firstRiskState()
  };
}

function positionTimeoutEnvelope(): AgentEnvelope {
  const position = firstPosition();
  return {
    schema_version: "1.3",
    transaction_id: "tx_mock_position_timeout_2026",
    trace_id: "trace_mock_position_timeout_2026",
    timestamp: new Date(now.getTime() - 45_000).toISOString(),
    sender_agent: "Agent_6_Time_Manager",
    target_agent: "Agent_3_Executor",
    channel: "agent.position.timeout",
    pipeline_stage: "time_horizon_guard",
    idempotency_key: "idem_mock_position_timeout_2026",
    agent_log: "Position BTC/USDT is approaching the 180-minute intraday holding limit.",
    user_id: operatorId,
    payload: { type: "POSITION_TIMEOUT_WARNING", position, elapsedMinutes: 166, maxMinutes: 180 }
  };
}

function securityAuditEnvelope(): AgentEnvelope {
  return {
    schema_version: "1.3",
    transaction_id: "tx_mock_security_audit_2026",
    trace_id: "trace_mock_security_audit_2026",
    timestamp: new Date(now.getTime() - 120_000).toISOString(),
    sender_agent: "Security_Vault",
    channel: "security.audit",
    pipeline_stage: "security_audit",
    idempotency_key: "idem_mock_security_audit_2026",
    agent_log: "Exchange credential write was audited with AES-GCM AAD binding.",
    payload: {
      userId: operatorId,
      exchange: "BINANCE",
      status: "ACCEPTED",
      reason: "Withdrawal permission was not present and key material was encrypted."
    }
  };
}

function marketVectorPayload(): AgentEnvelope["payload"] {
  const indicators = {
    rsi: 54.2,
    macd: 38.4,
    macdSignal: 31.9,
    ema20: 67482.1,
    ema50: 67122.6,
    ema200: 66411.3,
    bollingerUpper: 68120.5,
    bollingerMiddle: 67241.4,
    bollingerLower: 66392.2
  };
  return {
    exchange: "BINANCE",
    pair: "BTC/USDT",
    trend: "Bullish",
    volatility: "High",
    anomalies: ["Orderbook imbalance expanded while funding stayed constructive", "15m candle reclaimed EMA200"],
    keyLevels: { support: 66411.3, resistance: 68120.5 },
    fundingRate: 0.003,
    orderbookImbalance: 0.21,
    dominantTimeframe: "15m",
    technicalSummary: { "1m": indicators, "5m": indicators, "15m": indicators, "1h": indicators },
    confidenceScore: 0.87,
    dataQuality: { source: "MIXED", latencyMs: 42, stale: false, missing: [] },
    generatedAt: now.toISOString()
  };
}


function firstSignal(): TradeSignal {
  const signal = signals()[0];
  if (!signal) {
    throw new Error("Mock signal fixture is missing");
  }
  return signal;
}

function firstRiskState(): DailyRiskState {
  const state = riskStates()[0];
  if (!state) {
    throw new Error("Mock risk state fixture is missing");
  }
  return state;
}

function firstPosition(): Position {
  const position = positions()[0];
  if (!position) {
    throw new Error("Mock position fixture is missing");
  }
  return position;
}

function firstExecution(): ExecutionDecision {
  const execution = executions()[0];
  if (!execution) {
    throw new Error("Mock execution fixture is missing");
  }
  return execution;
}

function signals(): readonly TradeSignal[] {
  return [
    { id: "sig_btc_long_2026", transactionId: "tx_signal_btc_long", userId: operatorId, pair: "BTC/USDT", action: "LONG", leverage: 2, strategySource: "Institutional EMA200 breakout strategy", strategyId: "strat_ema200_breakout", confidenceScore: 0.87, rationale: "BTC reclaimed EMA200 with constructive funding and positive orderbook imbalance.", technicalIndicators: { rsi5m: 54.2, fundingRate: 0.003, orderbookImbalance: 0.21 }, entryPriceRange: { min: 67340, max: 67520 }, suggestedStopLoss: 66880, suggestedTakeProfit: 68100, createdAt: now.toISOString() },
    { id: "sig_eth_short_2026", transactionId: "tx_signal_eth_short", userId: operatorId, pair: "ETH/USDT", action: "SHORT", leverage: 1, strategySource: "Liquidity sweep mean-reversion strategy", strategyId: "strat_liquidity_reversion", confidenceScore: 0.71, rationale: "ETH rejected a local liquidity sweep while volatility expanded above policy threshold.", technicalIndicators: { rsi5m: 71.5, fundingRate: 0.007, orderbookImbalance: -0.18 }, entryPriceRange: { min: 3230, max: 3248 }, suggestedStopLoss: 3285, suggestedTakeProfit: 3180, createdAt: new Date(now.getTime() - 180_000).toISOString() }
  ];
}

function strategies(): readonly StrategyRule[] {
  return [
    strategyRule("strat_ema200_breakout", "YOUTUBE", "yt_ema200_breakout", "Institutional EMA200 breakout setup", "https://example.com/ema200-breakout", "15m candle close > EMA200 with positive orderbook imbalance", "LONG", "Resistance_Level_1", "15m", 0.83, 0.92, 0.86, now),
    strategyRule("strat_liquidity_reversion", "X", "x_liquidity_reversion", "Liquidity sweep mean-reversion", "https://example.com/liquidity-reversion", "RSI > 70 after failed breakout and negative orderbook imbalance", "SHORT", "VWAP_Mean", "5m", 0.72, 0.77, 0.91, new Date(now.getTime() - 360_000))
  ];
}

function strategyRule(id: string, sourceType: StrategyRule["sourceType"], sourceId: string, sourceTitle: string, sourceUrl: string, trigger: string, action: StrategyRule["action"], target: string, timeframe: StrategyRule["timeframe"], confidenceScore: number, sourceTrustScore: number, freshnessScore: number, observedAt: Date): StrategyRule {
  return {
    id,
    sourceType,
    sourceId,
    sourceUrl,
    sourceTitle,
    extractedText: "The setup requires a confirmed trigger, explicit invalidation, defined timeframe and controlled risk budget before it can enter the signal pipeline.",
    trigger,
    action,
    target,
    timeframe,
    marketRegime: { trend: action === "SHORT" ? "Bearish" : "Bullish", volatility: "High", rsiZone: action === "SHORT" ? "Overbought" : "Neutral" },
    riskNotes: ["Invalidate immediately if orderbook imbalance flips", "Reject if funding crosses the danger threshold"],
    confidenceScore,
    sourceTrustScore,
    freshnessScore,
    evidenceScore: { trigger: 0.9, invalidation: 0.82, stopLoss: 0.74, timeframe: 0.88, riskReward: 0.79, aggregate: 0.83 },
    reviewStatus: "ACCEPTED",
    reviewReason: "Concrete trigger, timeframe, invalidation and risk/reward were present.",
    embedding: Array.from({ length: 64 }, (_, index) => Number(((index + 1) / 100).toFixed(4))),
    embeddingModel: "deterministic-local-v1",
    embeddingDimensions: 64,
    createdAt: observedAt.toISOString(),
    lastSeenAt: observedAt.toISOString()
  };
}


function riskStates(): readonly DailyRiskState[] {
  return [{ userId: operatorId, accountId: "22222222-2222-4222-8222-222222222222", equityAtStartOfDay: 250000, currentEquity: 247000, realizedPnLToday: 18600, unrealizedPnLToday: -3000, drawdownRatio: 0.012, profitRatio: 0.0744, riskLockActive: false, profitLockActive: false, riskLockUntil: null, profitLockUntil: null, systemHealth: "NORMAL", isLocked: false, lockReason: "NONE", lockUntil: null, updatedAt: now.toISOString() }];
}

function riskStateResponse(): { readonly riskStates: readonly DailyRiskState[]; readonly locks: readonly object[] } {
  return { riskStates: riskStates(), locks: [] };
}

function riskEvents(): readonly object[] {
  return [
    { id: "risk_evt_drawdown_probe", userId: operatorId, accountId: "22222222-2222-4222-8222-222222222222", eventType: "HALT_CHECK", severity: "info", message: "Drawdown guard checked account equity and exposure.", metadata: { drawdownRatio: 0.012 }, createdAt: now.toISOString() },
    { id: "risk_evt_timeout_warning", userId: operatorId, accountId: "22222222-2222-4222-8222-222222222222", eventType: "POSITION_TIMEOUT_WARNING", severity: "warning", message: "BTC/USDT position is approaching the 180-minute hard limit.", metadata: { positionId: "33333333-3333-4333-8333-333333333333" }, createdAt: now.toISOString() }
  ];
}

function riskPolicy(): object {
  return { userId: operatorId, accountId: "22222222-2222-4222-8222-222222222222", maxDailyDrawdownRatio: 0.05, dailyProfitCapRatio: 0.15, riskPerTradeFraction: 0.01, maxOpenPositions: 3, maxDailyTrades: 20, maxSymbolExposureRatio: 0.25, maxAccountExposureRatio: 0.75, maxSpreadBps: 25, maxOrderbookAgeMs: 3000, requirePrivateStreamForLive: true, requireSymbolRulesForLive: true, updatedAt: now.toISOString() };
}

function positions(): readonly Position[] {
  return [{ id: "33333333-3333-4333-8333-333333333333", accountId: "22222222-2222-4222-8222-222222222222", userId: operatorId, exchange: "BINANCE", exchangePositionId: "paper_position_btc_2026", pair: "BTC/USDT", direction: "LONG", leverage: 2, volume: 0.42, entryPrice: 67420, stopLossPrice: 66880, takeProfitPrice: 68100, status: "OPENED", openedAt: new Date(now.getTime() - 166 * 60_000).toISOString(), closedAt: null, realizedPnL: null, closeRequestedAt: null, closeConfirmedAt: null, warningSentAt: now.toISOString(), forceCloseRequestedAt: null, forceCloseConfirmedAt: null, createdAt: new Date(now.getTime() - 166 * 60_000).toISOString(), updatedAt: now.toISOString() }];
}

function executions(): readonly ExecutionDecision[] {
  const signal = firstSignal();
  return [{ id: "exec_btc_paper_2026", transactionId: signal.transactionId, userId: operatorId, exchange: "BINANCE", signal: { transactionId: signal.transactionId, timestamp: signal.createdAt, pair: signal.pair, direction: "LONG", leverage: signal.leverage, entryPriceRange: { min: 67340, max: 67520 }, suggestedStopLoss: 66880, suggestedTakeProfit: 68100, confidenceScore: signal.confidenceScore, strategySource: signal.strategySource }, status: "PAPER_OPENED", order: { pair: signal.pair, side: "Buy", orderType: "MARKET", qty: 0.42, leverage: signal.leverage, price: null, stopLoss: 66880, takeProfit: 68100 }, availableBalanceUsdt: 120000, equityUsdt: 247000, riskAmountUsdt: 2470, marketPrice: 67420, exchangeOrderId: "paper_order_btc_2026", exchangePositionId: "paper_position_btc_2026", riskPreview: { grossRiskUsdt: 2470, feesEstimateUsdt: 2.96, slippageReserveUsdt: 1.24, netRiskUsdt: 2465.8, marginRequiredUsdt: 14156.4, liquidationBufferPct: 0.8, estimatedNotionalUsdt: 28312.8 }, stateMachine: [{ name: "RECEIVED", status: "PASSED", startedAt: now.toISOString(), finishedAt: now.toISOString(), latencyMs: 0, message: "Signal received by Agent 3.", metadata: { pair: signal.pair } }, { name: "OPENED", status: "PASSED", startedAt: now.toISOString(), finishedAt: now.toISOString(), latencyMs: 19, message: "Paper position opened.", metadata: { mode: "PAPER" } }], latencyMs: 19, createdAt: now.toISOString() }];
}

function adapterStatuses(): readonly AdapterStatus[] {
  return [
    { exchange: "BINANCE", pair: "BTC/USDT", connected: true, reconnecting: false, stale: false, lastMessageAt: now.toISOString(), lastRestBackfillAt: now.toISOString(), missingFields: [], errorReason: null, reconnectAttempts: 0 },
    { exchange: "BYBIT", pair: "BTC/USDT", connected: true, reconnecting: false, stale: false, lastMessageAt: now.toISOString(), lastRestBackfillAt: now.toISOString(), missingFields: [], errorReason: null, reconnectAttempts: 0 }
  ];
}

function privateStreams(): readonly PrivateStreamStatus[] {
  return [
    {
      accountId: "22222222-2222-4222-8222-222222222222",
      userId: operatorId,
      exchange: "BINANCE",
      streamType: "COMBINED",
      status: "HEALTHY",
      lastMessageAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      reconnectAttempts: 0,
      errorReason: null,
      updatedAt: now.toISOString()
    }
  ];
}

function liveReadiness(): readonly LiveReadinessCheck[] {
  const accountId = "22222222-2222-4222-8222-222222222222";
  const base = { userId: operatorId, accountId, checkedAt: now.toISOString(), metadata: { source: "mock-certification" } };
  return [
    { ...base, checkKey: "permission_recheck", status: "PASSED", message: "Exchange permissions were revalidated without withdrawal scope." },
    { ...base, checkKey: "withdraw_disabled", status: "PASSED", message: "Withdrawal permission is absent." },
    { ...base, checkKey: "private_stream_healthy", status: "PASSED", message: "Private order/execution/position stream is healthy." },
    { ...base, checkKey: "symbol_rules_loaded", status: "PASSED", message: "BTC/USDT symbol rules were loaded and verified." },
    { ...base, checkKey: "testnet_order", status: "PENDING", message: "Awaiting operator-run testnet market order certification." },
    { ...base, checkKey: "testnet_sl_tp", status: "PENDING", message: "Awaiting SL/TP attachment certification." },
    { ...base, checkKey: "testnet_manual_close", status: "PENDING", message: "Awaiting manual close certification." },
    { ...base, checkKey: "testnet_kill_switch", status: "PENDING", message: "Awaiting kill-switch certification." },
    { ...base, checkKey: "risk_policy_locked", status: "PASSED", message: "Risk policy is locked at the approved thresholds." },
    { ...base, checkKey: "risk_confirmation_signed", status: "PASSED", message: "Operator signed the live-risk confirmation." },
    { ...base, checkKey: "emergency_close_test", status: "PENDING", message: "Awaiting emergency close drill." }
  ];
}

function reconciliationRuns(): readonly ReconciliationRun[] {
  return [
    {
      id: "44444444-4444-4444-8444-444444444441",
      userId: operatorId,
      accountId: "22222222-2222-4222-8222-222222222222",
      exchange: "BINANCE",
      status: "MISMATCH",
      startedAt: new Date(now.getTime() - 30_000).toISOString(),
      finishedAt: new Date(now.getTime() - 29_200).toISOString(),
      internalOpenPositions: 1,
      exchangeOpenPositions: 1,
      internalOpenOrders: 2,
      exchangeOpenOrders: 1
    }
  ];
}

function reconciliationMismatches(): readonly ReconciliationMismatch[] {
  return [
    {
      id: "44444444-4444-4444-8444-444444444442",
      runId: "44444444-4444-4444-8444-444444444441",
      userId: operatorId,
      accountId: "22222222-2222-4222-8222-222222222222",
      mismatchType: "PROTECTION_ORDER_MISSING",
      severity: "critical",
      pair: "BTC/USDT",
      positionId: "33333333-3333-4333-8333-333333333333",
      orderId: null,
      message: "Take-profit protection is not confirmed by exchange reconciliation.",
      metadata: { expected: "SL+TP", observed: "SL_ONLY" },
      createdAt: now.toISOString(),
      resolvedAt: null
    }
  ];
}

function incidents(): readonly object[] {
  return [
    {
      id: "incident_protection_missing_001",
      userId: operatorId,
      accountId: "22222222-2222-4222-8222-222222222222",
      severity: "critical",
      incidentType: "PROTECTION_ORDER_MISSING",
      message: "Protection supervisor detected missing take-profit order on BTC/USDT.",
      metadata: { pair: "BTC/USDT", action: "force-close-if-repair-fails" },
      resolved: false,
      resolvedAt: null,
      createdAt: now.toISOString()
    },
    {
      id: "incident_private_stream_reconnect_001",
      userId: operatorId,
      accountId: "22222222-2222-4222-8222-222222222222",
      severity: "warning",
      incidentType: "PRIVATE_STREAM_RECONNECTED",
      message: "Private stream reconnected after a short transport interruption.",
      metadata: { reconnectAttempts: 1 },
      resolved: true,
      resolvedAt: now.toISOString(),
      createdAt: new Date(now.getTime() - 300_000).toISOString()
    }
  ];
}

function outboxItems(): readonly object[] {
  return [
    { id: "outbox_execution_status_001", status: "PUBLISHED", channel: "agent.execution.status", attempts: 1, createdAt: now.toISOString(), publishedAt: now.toISOString() },
    { id: "outbox_risk_state_001", status: "PUBLISHED", channel: "agent.risk.state", attempts: 1, createdAt: now.toISOString(), publishedAt: now.toISOString() }
  ];
}

function metrics(): readonly object[] {
  return [
    { name: "agent_cycles_total", kind: "counter", value: 1248, labels: { agent: "market" }, updatedAt: now.toISOString() },
    { name: "redis_stream_lag", kind: "gauge", value: 2, labels: { channel: "agent.market.vector" }, updatedAt: now.toISOString() },
    { name: "market_adapter_stale", kind: "gauge", value: 0, labels: { exchange: "BINANCE" }, updatedAt: now.toISOString() }
  ];
}

function streamMetrics(): readonly object[] {
  return [
    { channel: "agent.market.vector", length: 320, pending: 0 },
    { channel: "agent.strategy.signal", length: 114, pending: 1 },
    { channel: "agent.execution.status", length: 18, pending: 0 },
    { channel: "agent.risk.halt", length: 0, pending: 0 },
    { channel: "agent.position.timeout", length: 3, pending: 0 }
  ];
}

async function json(context: MockRouteContext, body: object | readonly object[], status = 200): Promise<void> {
  await context.route.fulfill({ status, contentType: "application/json; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
}

async function eventStream(context: MockRouteContext): Promise<void> {
  const eventPayload = JSON.stringify(marketVectorEnvelope());
  await context.route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "cache-control": "no-cache", connection: "keep-alive" }, body: `event: heartbeat\ndata: {"ts":"${now.toISOString()}","status":"connected"}\n\nevent: agent.market.vector\ndata: ${eventPayload}\n\n` });
}

function safeModeEvents(): readonly SafeModeEvent[] {
  return [{
    id: "11111111-2222-4333-8444-555555555551",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    triggerType: "PROTECTION_ORDER_MISSING",
    severity: "critical",
    active: true,
    reason: "Protection supervisor detected missing take profit on BTC/USDT.",
    recoveryChecklist: ["Freeze new entries", "Inspect protective orders", "Run reconciliation", "Close unsafe exposure"],
    metadata: { source: "mock_protection_supervisor" },
    activatedAt: now.toISOString(),
    resolvedAt: null
  }];
}

function operationsHealth(): OperationsHealthSnapshot {
  return {
    id: "11111111-2222-4333-8444-555555555552",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    healthStatus: "SAFE_MODE",
    agentHealth: { activeAgents: 6, agentMesh: "nominal" },
    infrastructureHealth: { database: "healthy", redis: "healthy", vault: "healthy" },
    exchangeHealth: { privateStreams: "healthy", reconciliation: "mismatch_watch" },
    riskHealth: { safeMode: true, liveGate: "locked_until_certified" },
    latency: { executionP95Ms: 42, sseLagMs: 18 },
    createdAt: now.toISOString()
  };
}

function portfolioSnapshot(): PortfolioSnapshot {
  return {
    id: "11111111-2222-4333-8444-555555555553",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    totalEquityUsdt: 1_250_000,
    realizedPnlUsdt: 42_800,
    unrealizedPnlUsdt: 7_200,
    capitalAtRiskUsdt: 12_500,
    exposureByAsset: [
      { asset: "BTC", notionalUsdt: 320_000, allocationRatio: 0.256, riskContributionRatio: 0.41 },
      { asset: "ETH", notionalUsdt: 180_000, allocationRatio: 0.144, riskContributionRatio: 0.23 },
      { asset: "SOL", notionalUsdt: 90_000, allocationRatio: 0.072, riskContributionRatio: 0.14 }
    ],
    leverageHeatmap: [
      { pair: "BTC/USDT", leverage: 4, notionalUsdt: 320_000 },
      { pair: "ETH/USDT", leverage: 3, notionalUsdt: 180_000 }
    ],
    drawdownHistory: [
      { at: new Date(now.getTime() - 86_400_000).toISOString(), drawdownRatio: 0.008 },
      { at: now.toISOString(), drawdownRatio: 0.012 }
    ],
    allocation: [
      { label: "Crypto Perps", valueUsdt: 590_000, ratio: 0.472 },
      { label: "USDT Reserve", valueUsdt: 660_000, ratio: 0.528 }
    ],
    createdAt: now.toISOString()
  };
}

function forensicCases(): readonly ForensicAuditCase[] {
  return [{
    id: "11111111-2222-4333-8444-555555555554",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    executionId: "33333333-3333-4333-8333-333333333333",
    positionId: "44444444-4444-4444-8444-444444444444",
    signalTransactionId: "tx_signal_btc_long",
    caseStatus: "OPEN",
    timeline: [
      { stage: "Signal received", status: "PASSED", timestamp: now.toISOString(), latencyMs: 3, message: "Signal passed schema validation.", evidenceRef: "agent.strategy.signal" },
      { stage: "Risk checks", status: "PASSED", timestamp: now.toISOString(), latencyMs: 7, message: "Locks, drawdown and profit cap passed.", evidenceRef: "risk_events" },
      { stage: "Protection", status: "WARNING", timestamp: now.toISOString(), latencyMs: 14, message: "Protection supervisor is monitoring bracket integrity.", evidenceRef: "protection_order_checks" }
    ],
    evidence: { pair: "BTC/USDT", mode: "PAPER" },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }];
}

function approvalRequests(): readonly ApprovalRequest[] {
  return [{
    id: "11111111-2222-4333-8444-555555555555",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    requestType: "LIVE_ENABLE",
    modeRequested: "APPROVAL_REQUIRED",
    status: "PENDING",
    reason: "Operator approval is required before live automation.",
    payload: { source: "mock_console" },
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    decidedAt: null,
    createdAt: now.toISOString()
  }];
}

function disasterRecoveryRuns(): readonly DisasterRecoveryRun[] {
  return [{
    id: "11111111-2222-4333-8444-555555555556",
    userId: operatorId,
    accountId: null,
    runType: "BACKUP_VERIFY",
    status: "PASSED",
    steps: [
      { label: "Configuration snapshot captured", status: "PASSED", message: "Fingerprint stored." },
      { label: "Migration ledger inspected", status: "PASSED", message: "Schema ledger reachable." }
    ],
    evidence: { mode: "dry_run" },
    startedAt: now.toISOString(),
    finishedAt: now.toISOString()
  }];
}

function complianceAcceptances(): readonly ComplianceAcceptance[] {
  return [{ id: "11111111-2222-4333-8444-555555555557", userId: operatorId, policyKey: "risk_disclosure", version: "2026.06", accepted: true, acceptedAt: now.toISOString() }];
}

function testEvidenceReports(): readonly TestEvidenceReport[] {
  return [{
    id: "11111111-2222-4333-8444-555555555558",
    userId: operatorId,
    reportType: "CI",
    status: "PENDING",
    summary: { staticAudit: true, docker: false, testnet: false },
    artifacts: [],
    generatedAt: now.toISOString()
  }];
}

function liveReadinessWizard(): LiveReadinessWizardRun {
  return {
    id: "11111111-2222-4333-8444-555555555559",
    userId: operatorId,
    accountId: "22222222-2222-4222-8222-222222222222",
    status: "IN_PROGRESS",
    currentStep: "private_streams",
    steps: [
      { key: "environment", label: "Production environment", status: "PASSED", message: "Hard-fail guards verified.", required: true },
      { key: "vault", label: "Vault", status: "PASSED", message: "Key provider is reachable.", required: true },
      { key: "private_streams", label: "Private streams", status: "PENDING", message: "Awaiting stream soak evidence.", required: true },
      { key: "testnet_order", label: "Testnet order", status: "PENDING", message: "Awaiting certification.", required: true }
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
