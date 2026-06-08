import { nanoid } from "nanoid";
import {
  ExecutionOrderEnvelopeSchema,
  ExecutionStatusEnvelopeSchema,
  IncomingSignalPayloadSchema,
  LiveLogEnvelopeSchema,
  PositionTimeoutEnvelopeSchema,
  RiskHaltEnvelopeSchema,
  type ExecutionDecision,
  type ExecutionStatus,
  type ExecutionStep,
  type IncomingSignalPayload,
  type Position,
  type PositionTimeoutEnvelope,
  type RiskHaltEnvelope,
  type TradeSignal,
  type TradeSignalEnvelope
} from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { TradingAccountRecord, TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { ExecutionRepository } from "../repositories/executionRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import type { TradingLockRepository } from "../repositories/tradingLockRepository.js";
import type { SymbolRulesRepository } from "../repositories/symbolRulesRepository.js";
import type { RiskPolicyRepository } from "../repositories/riskPolicyRepository.js";
import type { OrderRepository } from "../repositories/orderRepository.js";
import type { OutboxRepository } from "../repositories/outboxRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import type { ApiWalletVault, EncryptedSecret, ExchangeSecretPayload } from "../security/vault.js";
import type { ExecutionExchangeRegistry } from "../execution/executionExchangeRegistry.js";
import { calculateOrderParametersWithPreview, isPriceInsideEntryRange, orderbookAgeMs, selectExecutableMarketPrice, spreadBps } from "../execution/positionSizing.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import { logger } from "../infrastructure/logger.js";

export interface OrderExecutorConfig {
  readonly riskPerTradeFraction: number;
  readonly minNotionalUsdt: number;
  readonly quantityStep: number;
  readonly minConfidence: number;
  readonly maxOrderbookAgeMs: number;
  readonly maxSpreadBps: number;
  readonly maxDailyTrades: number;
  readonly maxOpenPositions: number;
  readonly requireSymbolRulesForLive: boolean;
  readonly requirePrivateStreamForLive: boolean;
}

export class OrderExecutorAgent {
  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly executionExchanges: ExecutionExchangeRegistry,
    private readonly locks: TradingLockRepository,
    private readonly positions: PositionRepository,
    private readonly executions: ExecutionRepository,
    private readonly symbolRules: SymbolRulesRepository,
    private readonly policies: RiskPolicyRepository,
    private readonly orders: OrderRepository,
    private readonly incidents: IncidentRepository,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository,
    private readonly outbox: OutboxRepository,
    private readonly config: OrderExecutorConfig
  ) {}

  public async handleSignalEnvelope(envelope: TradeSignalEnvelope): Promise<void> {
    if (!envelope.user_id || !envelope.payload.userId) {
      await this.publishLog("warn", `Исполнитель отклонил глобальный сигнал ${envelope.transaction_id}: нет user scope.`);
      return;
    }
    if (envelope.payload.action !== "LONG" && envelope.payload.action !== "SHORT") {
      await this.publishLog("info", `Исполнитель пропустил сигнал ${envelope.payload.action} по ${envelope.payload.pair}.`, envelope.user_id);
      return;
    }
    const signal = this.toIncomingSignal(envelope.payload);
    await this.execute(signal, envelope.payload.userId);
  }

  public async handleRiskHaltEnvelope(envelope: RiskHaltEnvelope): Promise<void> {
    const { userId, accountId, positionsToClose } = envelope.payload;
    const account = await this.accounts.findActiveForUser(userId);
    if (!account || account.id !== accountId) {
      await this.publishLog("error", `Risk halt requested for account ${accountId}, but active account was not found.`, userId);
      return;
    }
    const credentials = await this.loadCredentials(account);
    const client = this.executionExchanges.forAccount(account.exchangeName, userId, account.id);
    const maxAttempts = 5;
    await this.publishLog("error", `EMERGENCY_HALT detected. Blocking new signals and closing exposure for ${positionsToClose.length} positions.`, userId);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await client.cancelAllOrders(credentials);
        const openPositions = await this.positions.listOpenByAccount(account.id);
        if (openPositions.length === 0) {
          await this.publishLog("error", "EMERGENCY_HALT confirmed zero exposure.", userId);
          return;
        }
        for (const position of openPositions) {
          await this.positions.requestClose(position.id, "CLOSE_SUBMITTED", "Emergency halt close submitted.");
          const result = await client.closePosition(credentials, position);
          await this.positions.close(position.id, "CLOSED_BY_RISK_HALT", result.realizedPnl);
        }
        const remaining = await this.positions.listOpenByAccount(account.id);
        if (remaining.length === 0) {
          await this.publishLog("error", "EMERGENCY_HALT close loop completed and exposure is zero.", userId);
          return;
        }
      } catch (error) {
        logger.error({ err: error, userId, accountId, attempt }, "Risk halt force close failed");
        await this.incidents.create({ incidentType: "EMERGENCY_HALT_CLOSE_FAILED", severity: "critical", userId, accountId, message: error instanceof Error ? error.message : "Unknown emergency halt close error", metadata: { attempt } });
        await this.publishLog("error", `Аварийное закрытие не подтверждено, попытка ${attempt}/${maxAttempts}.`, userId);
      }
      await sleep(Math.min(250 * 2 ** attempt, 3000));
    }
    await this.incidents.create({ incidentType: "EXPOSURE_UNCONFIRMED", severity: "critical", userId, accountId, message: "Emergency halt could not confirm zero exposure after all attempts.", metadata: { maxAttempts } });
    throw new Error("Emergency halt failed to confirm zero exposure");
  }

  public async handleTimeoutEnvelope(envelope: PositionTimeoutEnvelope): Promise<void> {
    if (envelope.payload.type !== "FORCE_CLOSE_TIMEOUT") {
      return;
    }
    const position = envelope.payload.position;
    await this.forceClosePositionById(position.userId, position.id, "Agent 6 timeout force-close submitted.", "CLOSED_BY_TIMEOUT", { elapsedMinutes: envelope.payload.elapsedMinutes });
  }

  public async forceClosePositionById(userId: string, positionId: string, reason: string, closeStatus: Extract<Position["status"], "CLOSED_BY_TIMEOUT" | "CLOSED_BY_RISK_HALT" | "CLOSED_MANUALLY">, metadata: Record<string, string | number | boolean | null> = {}): Promise<Position | null> {
    const openPositions = await this.positions.listOpenForUser(userId, 500);
    const position = openPositions.find((candidate) => candidate.id === positionId);
    if (!position) {
      await this.publishLog("warn", `Force close ignored: position ${positionId} is not open or does not belong to the authenticated user.`, userId);
      return null;
    }
    if (["CLOSE_SUBMITTED", "CLOSE_CONFIRMED", "CLOSED_BY_TIMEOUT", "CLOSED_BY_RISK_HALT", "CLOSED_MANUALLY"].includes(position.status)) {
      await this.publishLog("info", `Force close ignored: position ${position.pair} is already in ${position.status}.`, userId);
      return position;
    }
    const account = await this.accounts.findActiveForUser(userId, position.exchange);
    if (!account || account.id !== position.accountId) {
      await this.publishLog("error", `Force close rejected: account ${position.accountId} is not active.`, userId);
      return null;
    }
    const requested = await this.positions.requestClose(position.id, "CLOSE_SUBMITTED", reason);
    if (!requested) {
      return null;
    }
    const credentials = await this.loadCredentials(account);
    const client = this.executionExchanges.forAccount(account.exchangeName, userId, account.id);
    try {
      const result = await client.closePosition(credentials, requested);
      const closed = await this.positions.close(position.id, closeStatus, result.realizedPnl);
      await this.orders.record({
        executionId: `manual_close_${position.id}`,
        userId,
        accountId: account.id,
        positionId: position.id,
        exchange: account.exchangeName,
        pair: position.pair,
        exchangeOrderId: result.exchangePositionId,
        orderRole: closeStatus === "CLOSED_MANUALLY" ? "MANUAL_CLOSE" : "FORCE_CLOSE",
        side: position.direction === "LONG" ? "Sell" : "Buy",
        orderType: "MARKET",
        requestedQty: position.volume,
        filledQty: position.volume,
        averageFillPrice: position.entryPrice,
        status: "FILLED",
        rawPayload: result.raw
      });
      await this.publishLog(closeStatus === "CLOSED_BY_RISK_HALT" ? "error" : "warn", `Position ${position.pair} force-closed with status ${closeStatus}.`, userId);
      return closed;
    } catch (error) {
      await this.positions.markCloseFailed(position.id, error instanceof Error ? error.message : "Unknown force close error");
      await this.incidents.create({ incidentType: "FORCE_CLOSE_FAILED", severity: "critical", userId, accountId: account.id, message: error instanceof Error ? error.message : "Unknown force close error", metadata: { positionId: position.id, closeStatus, ...metadata } });
      throw error;
    }
  }

  public async forceCloseAllForAccount(userId: string, accountId: string, reason: string): Promise<{ closed: number; failed: number }> {
    const account = await this.accounts.findActiveForUser(userId);
    if (!account || account.id !== accountId) {
      await this.publishLog("error", `Kill switch rejected: active account ${accountId} was not found.`, userId);
      return { closed: 0, failed: 1 };
    }
    const credentials = await this.loadCredentials(account);
    const client = this.executionExchanges.forAccount(account.exchangeName, userId, account.id);
    let closed = 0;
    let failed = 0;
    try {
      await client.cancelAllOrders(credentials);
    } catch (error) {
      failed += 1;
      await this.incidents.create({ incidentType: "MANUAL_KILL_SWITCH_CANCEL_FAILED", severity: "critical", userId, accountId, message: error instanceof Error ? error.message : "Unknown cancel-all error", metadata: { reason } });
    }
    const openPositions = await this.positions.listOpenByAccount(account.id, 500);
    for (const position of openPositions) {
      try {
        const result = await this.forceClosePositionById(userId, position.id, reason, "CLOSED_BY_RISK_HALT", { source: "manual_kill_switch" });
        if (result) {
          closed += 1;
        }
      } catch (error) {
        failed += 1;
        logger.error({ err: error, userId, accountId, positionId: position.id }, "Manual kill switch force close failed");
      }
    }
    if (failed > 0) {
      await this.incidents.create({ incidentType: "MANUAL_KILL_SWITCH_PARTIAL_FAILURE", severity: "critical", userId, accountId, message: "Manual kill switch finished with unconfirmed exposure.", metadata: { closed, failed } });
    }
    return { closed, failed };
  }

  private async execute(signal: IncomingSignalPayload, userId: string): Promise<ExecutionDecision> {
    const lockKey = `${userId}:${signal.transactionId}:${signal.pair}`;
    const locked = await this.accounts.withExecutionLock(lockKey, () => this.executeLocked(signal, userId));
    if (!locked) {
      return this.reject(`exec_${nanoid(18)}`, userId, "BYBIT", signal, "REJECTED_BY_DUPLICATE_SIGNAL", "Duplicate execution lock is already processing this signal.", performance.now(), null, []);
    }
    return locked;
  }

  private async executeLocked(signal: IncomingSignalPayload, userId: string): Promise<ExecutionDecision> {
    const startedAt = performance.now();
    const executionId = `exec_${nanoid(18)}`;
    const steps = new StepRecorder();
    const account = await this.accounts.findActiveForUser(userId);
    if (!account) {
      return this.reject(executionId, userId, "BYBIT", signal, "REJECTED_BY_VALIDATION", "У пользователя нет активного биржевого аккаунта для исполнения.", startedAt, null, steps.items());
    }
    try {
      steps.pass("RECEIVED", "Signal received by Agent 3.", { pair: signal.pair, direction: signal.direction });
      if (await this.executions.isDuplicateSignal(userId, signal.transactionId)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_DUPLICATE_SIGNAL", "Signal transaction was already processed for this user.", startedAt, account.id, steps.items());
      }
      steps.pass("VALIDATING_SIGNAL", "Signal schema, confidence and directional stop/target were validated.", { confidenceScore: signal.confidenceScore });
      if (signal.confidenceScore < this.config.minConfidence) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_VALIDATION", `Confidence ${signal.confidenceScore} is below execution threshold ${this.config.minConfidence}.`, startedAt, account.id, steps.items());
      }
      if (!account.executionEnabled || account.executionMode === "DISABLED") {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_LOCK", "Исполнение отключено для аккаунта.", startedAt, account.id, steps.items());
      }
      const policy = await this.policies.getOrCreate(userId, account.id);
      const globalLocked = await this.locks.hasActiveLock(userId, account.id, "GLOBAL_TRADING_LOCK");
      const newDealsLocked = await this.locks.hasActiveLock(userId, account.id, "NEW_DEALS_LOCK");
      steps.pass("CHECKING_LOCKS", "Trading locks checked.", { globalLocked, newDealsLocked });
      if (globalLocked || newDealsLocked) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_LOCK", globalLocked ? "Аккаунт заблокирован аварийным risk circuit breaker." : "Новые сделки заблокированы profit cap guard до конца дня.", startedAt, account.id, steps.items());
      }
      const openCount = await this.positions.countOpenByAccount(account.id);
      if (openCount >= Math.min(policy.maxOpenPositions, this.config.maxOpenPositions)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_LOCK", "Maximum open positions limit reached.", startedAt, account.id, steps.items());
      }
      if (await this.positions.hasOpenSymbol(account.id, signal.pair)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_LOCK", "Open position for this pair already exists.", startedAt, account.id, steps.items());
      }
      const dailyTrades = await this.executions.countToday(userId, account.id);
      if (dailyTrades >= Math.min(policy.maxDailyTrades, this.config.maxDailyTrades)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_LOCK", "Daily trade count limit reached.", startedAt, account.id, steps.items());
      }
      const credentials = await this.loadCredentials(account);
      const client = this.executionExchanges.forAccount(account.exchangeName, userId, account.id);
      const liveMode = account.executionMode === "LIVE" || account.executionMode === "BYBIT_TESTNET" || account.executionMode === "BINANCE_FUTURES_TESTNET";
      if (liveMode && policy.requirePrivateStreamForLive && this.config.requirePrivateStreamForLive) {
        const healthy = client.hasHealthyPrivateStream ? await client.hasHealthyPrivateStream(credentials) : false;
        if (!healthy) {
          return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_STALE_MARKET_DATA", "LIVE execution requires healthy private order/position stream.", startedAt, account.id, steps.items());
        }
      }
      let symbolRule = await this.symbolRules.find(account.exchangeName, signal.pair);
      if (!symbolRule && client.getSymbolRules) {
        symbolRule = await client.getSymbolRules(credentials, signal.pair).then((rule) => this.symbolRules.upsert({ exchange: rule.exchange, pair: rule.pair, symbol: rule.symbol, minQty: rule.minQty, maxQty: rule.maxQty, qtyStep: rule.qtyStep, tickSize: rule.tickSize, minNotional: rule.minNotional, maxNotional: rule.maxNotional, maxLeverage: rule.maxLeverage, contractSize: rule.contractSize, marginAsset: rule.marginAsset, status: rule.status, reduceOnlySupported: rule.reduceOnlySupported, rawPayload: { source: "exchange" } })).catch(() => null);
      }
      if (liveMode && policy.requireSymbolRulesForLive && this.config.requireSymbolRulesForLive && !symbolRule) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_SYMBOL_RULES", "LIVE execution is forbidden without verified symbol trading rules.", startedAt, account.id, steps.items());
      }
      if (symbolRule && symbolRule.status !== "TRADING") {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_SYMBOL_RULES", `Symbol ${signal.pair} is not tradable.`, startedAt, account.id, steps.items());
      }
      steps.pass("FETCHING_BALANCE", "Balance snapshot fetched.", {});
      const [balance, book] = await Promise.all([client.getBalance(credentials), client.getTopOfBook(signal.pair)]);
      const age = orderbookAgeMs(book.observedAt);
      const currentSpread = spreadBps(book.bid, book.ask);
      steps.pass("FETCHING_ORDERBOOK", "Top-of-book snapshot fetched.", { ageMs: age, spreadBps: currentSpread });
      if (age > Math.min(policy.maxOrderbookAgeMs, this.config.maxOrderbookAgeMs)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_STALE_MARKET_DATA", `Orderbook is stale: ${age}ms.`, startedAt, account.id, steps.items(), balance.availableBalanceUsdt, balance.totalEquityUsdt);
      }
      if (currentSpread > Math.min(policy.maxSpreadBps, this.config.maxSpreadBps)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_SLIPPAGE", `Spread ${currentSpread.toFixed(2)} bps exceeds max allowed.`, startedAt, account.id, steps.items(), balance.availableBalanceUsdt, balance.totalEquityUsdt);
      }
      const marketPrice = selectExecutableMarketPrice(signal.direction, book.bid, book.ask);
      if (!isPriceInsideEntryRange(signal, marketPrice)) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_SLIPPAGE", `Рыночная цена ${marketPrice} вышла за диапазон входа ${signal.entryPriceRange.min}-${signal.entryPriceRange.max}.`, startedAt, account.id, steps.items(), balance.availableBalanceUsdt, balance.totalEquityUsdt, marketPrice);
      }
      steps.pass("CHECKING_SLIPPAGE", "Slippage, spread and orderbook freshness checks passed.", { marketPrice });
      const sizing = calculateOrderParametersWithPreview({ signal, totalEquityUsdt: balance.totalEquityUsdt, marketPrice, riskFraction: Math.min(policy.riskPerTradeFraction, this.config.riskPerTradeFraction), minNotionalUsdt: this.config.minNotionalUsdt, quantityStep: this.config.quantityStep, symbolRule: symbolRule ?? undefined });
      steps.pass("CALCULATING_SIZE", "Position size calculated with fee and slippage reserves.", { qty: sizing.order.qty, marginRequiredUsdt: sizing.preview.marginRequiredUsdt });
      if (balance.availableBalanceUsdt < sizing.preview.marginRequiredUsdt) {
        return this.reject(executionId, userId, account.exchangeName, signal, "REJECTED_BY_BALANCE", `Недостаточно свободного USDT: требуется ${sizing.preview.marginRequiredUsdt.toFixed(2)}, доступно ${balance.availableBalanceUsdt.toFixed(2)}.`, startedAt, account.id, steps.items(), balance.availableBalanceUsdt, balance.totalEquityUsdt, marketPrice);
      }
      await client.setLeverage(credentials, signal.pair, signal.leverage, signal.direction);
      steps.pass("SETTING_LEVERAGE", "Exchange leverage was set or confirmed.", { leverage: signal.leverage });
      let placement;
      if (account.executionMode === "PAPER") {
        placement = { exchangeOrderId: `paper_${nanoid(12)}`, exchangePositionId: `paper_${nanoid(16)}`, filledPrice: marketPrice, filledQty: sizing.order.qty, protectionAttached: true, raw: { mode: "PAPER", order: sizing.order, simulatedLatencyMs: 12 } };
      } else {
        steps.pass("SUBMITTING_ENTRY", "Entry order submitted to exchange.", { mode: account.executionMode });
        placement = await client.placeBracketOrder(credentials, sizing.order);
      }
      if (!placement.protectionAttached) {
        return this.reject(executionId, userId, account.exchangeName, signal, "FAILED_PROTECTION", "Entry order was not protected by stop loss and take profit.", startedAt, account.id, steps.items(), balance.availableBalanceUsdt, balance.totalEquityUsdt, marketPrice);
      }
      steps.pass("WAITING_FOR_FILL", "Entry fill confirmed by execution response.", { filledPrice: placement.filledPrice, filledQty: placement.filledQty });
      steps.pass("ATTACHING_PROTECTION", "Stop loss and take profit protection attached.", { stopLoss: sizing.order.stopLoss, takeProfit: sizing.order.takeProfit });
      const position = await this.positions.open({ accountId: account.id, userId, exchangePositionId: placement.exchangePositionId, pair: signal.pair, direction: signal.direction, leverage: signal.leverage, volume: placement.filledQty, entryPrice: placement.filledPrice, stopLossPrice: sizing.order.stopLoss, takeProfitPrice: sizing.order.takeProfit });
      await this.orders.record({ executionId, userId, accountId: account.id, positionId: position.id, exchange: account.exchangeName, pair: signal.pair, exchangeOrderId: placement.exchangeOrderId, orderRole: "ENTRY", side: sizing.order.side, orderType: sizing.order.orderType, requestedQty: sizing.order.qty, filledQty: placement.filledQty, averageFillPrice: placement.filledPrice, status: "FILLED", rawPayload: placement.raw });
      const status = account.executionMode === "PAPER" ? "PAPER_OPENED" : "OPENED";
      const decision: ExecutionDecision = {
        id: executionId,
        transactionId: signal.transactionId,
        userId,
        exchange: account.exchangeName,
        signal,
        status,
        order: sizing.order,
        availableBalanceUsdt: balance.availableBalanceUsdt,
        equityUsdt: balance.totalEquityUsdt,
        riskAmountUsdt: balance.totalEquityUsdt * Math.min(policy.riskPerTradeFraction, this.config.riskPerTradeFraction),
        riskPreview: sizing.preview,
        symbolRule: symbolRule ?? undefined,
        marketPrice,
        exchangeOrderId: placement.exchangeOrderId,
        exchangePositionId: placement.exchangePositionId,
        stateMachine: steps.items(),
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        createdAt: new Date().toISOString()
      };
      await this.executions.insert(decision, account.id);
      await this.publishExecution(decision, account.id, position);
      return decision;
    } catch (error) {
      await this.incidents.create({ incidentType: "EXECUTION_FAILED", severity: "critical", userId, accountId: account.id, message: error instanceof Error ? error.message : "Unknown execution error", metadata: { transactionId: signal.transactionId, pair: signal.pair } });
      return this.reject(executionId, userId, account.exchangeName, signal, "FAILED_EXCHANGE", error instanceof Error ? error.message : "Unknown execution failure", startedAt, account.id, steps.items());
    }
  }

  private toIncomingSignal(signal: TradeSignal): IncomingSignalPayload {
    if (signal.action !== "LONG" && signal.action !== "SHORT") {
      throw new Error("Signal action cannot be converted to executable direction");
    }
    return IncomingSignalPayloadSchema.parse({
      transactionId: signal.transactionId,
      timestamp: signal.createdAt,
      pair: signal.pair,
      direction: signal.action,
      leverage: signal.leverage,
      entryPriceRange: signal.entryPriceRange,
      suggestedStopLoss: signal.suggestedStopLoss,
      suggestedTakeProfit: signal.suggestedTakeProfit,
      confidenceScore: signal.confidenceScore,
      strategySource: signal.strategySource
    });
  }

  private async reject(executionId: string, userId: string, exchange: "BINANCE" | "BYBIT", signal: IncomingSignalPayload, status: ExecutionStatus, reason: string, startedAt: number, accountId: string | null, steps: readonly ExecutionStep[], availableBalanceUsdt?: number, equityUsdt?: number, marketPrice?: number): Promise<ExecutionDecision> {
    const decision: ExecutionDecision = {
      id: executionId,
      transactionId: signal.transactionId,
      userId,
      exchange,
      signal,
      status,
      availableBalanceUsdt,
      equityUsdt,
      marketPrice,
      rejectionReason: reason,
      stateMachine: [...steps, makeStep(status, "REJECTED", reason)],
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      createdAt: new Date().toISOString()
    };
    await this.executions.insert(decision, accountId);
    await this.publishStatus(decision, reason);
    return decision;
  }

  private async publishExecution(decision: ExecutionDecision, accountId: string, _position: Position): Promise<void> {
    await this.publishStatus(decision, `Ордер ${decision.status}: ${decision.signal.pair} ${decision.signal.direction}, qty=${decision.order?.qty ?? 0}.`);
    if (!decision.order) return;
    const envelope = ExecutionOrderEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: decision.transactionId, senderAgent: "Agent_3_Executor", channel: "agent.execution.order", pipelineStage: "order_execution", idempotencyScope: `${decision.id}:order`, agentLog: `Исполнение ${decision.status} на ${decision.exchange}: ${decision.signal.pair}.`, userId: decision.userId }),
      payload: { executionId: decision.id, accountId, userId: decision.userId, exchange: decision.exchange, order: decision.order, status: decision.status === "PAPER_OPENED" ? "PAPER_OPENED" : "OPENED", exchangeOrderId: decision.exchangeOrderId, exchangePositionId: decision.exchangePositionId, latencyMs: decision.latencyMs }
    });
    await this.events.insert(envelope, decision.userId, "user");
    await this.outbox.enqueue(envelope, decision.userId);
  }

  private async publishStatus(decision: ExecutionDecision, log: string): Promise<void> {
    const envelope = ExecutionStatusEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: decision.transactionId, senderAgent: "Agent_3_Executor", channel: "agent.execution.status", pipelineStage: "order_execution", idempotencyScope: `${decision.id}:${decision.status}`, agentLog: log, userId: decision.userId }),
      payload: decision
    });
    await this.events.insert(envelope, decision.userId, "user");
    await this.outbox.enqueue(envelope, decision.userId);
  }

  private async publishLog(severity: "debug" | "info" | "warn" | "error", message: string, userId?: string): Promise<void> {
    const envelope = LiveLogEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_3_Executor", channel: "agent.live.log", pipelineStage: "live_log", idempotencyScope: `executor-log:${message}:${userId ?? "global"}`, agentLog: message, userId }),
      payload: { severity, message }
    });
    await this.events.insert(envelope, userId, userId ? "user" : "global");
    await this.outbox.enqueue(envelope, userId ?? null);
  }

  private async loadCredentials(account: TradingAccountRecord): Promise<ExchangeSecretPayload> {
    const stored = await this.apiKeys.find(account.userId, account.exchangeName);
    if (!stored) {
      throw new Error(`Encrypted API key for ${account.exchangeName} not found`);
    }
    return this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName });
  }
}

class StepRecorder {
  private readonly steps: ExecutionStep[] = [];

  public pass(name: ExecutionStatus, message: string, metadata: Record<string, string | number | boolean | null>): void {
    this.steps.push(makeStep(name, "PASSED", message, metadata));
  }

  public items(): ExecutionStep[] {
    return [...this.steps];
  }
}

function makeStep(name: ExecutionStatus, status: ExecutionStep["status"], message: string, metadata: Record<string, string | number | boolean | null> = {}): ExecutionStep {
  const now = new Date().toISOString();
  return { name, status, startedAt: now, finishedAt: now, latencyMs: 0, message, metadata };
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
