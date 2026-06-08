import type { EventChannel, MarketVectorEnvelope, PositionTimeoutEnvelope, RiskHaltEnvelope, TradeSignalEnvelope } from "@ma-core/shared";
import type { RedisMessageBus, StreamConsumerHandle } from "../infrastructure/redisBus.js";
import type { LiveEventHub } from "../infrastructure/liveEventHub.js";
import type { StrategyAgent } from "../agents/strategyAgent.js";
import type { MarketAnalystAgent } from "../agents/marketAnalystAgent.js";
import type { OrderExecutorAgent } from "../agents/orderExecutorAgent.js";
import type { DailyDrawdownGuardAgent } from "../agents/dailyDrawdownGuardAgent.js";
import type { DailyProfitCapGuardAgent } from "../agents/dailyProfitCapGuardAgent.js";
import type { TimeHorizonGuardAgent } from "../agents/timeHorizonGuardAgent.js";
import { logger } from "../infrastructure/logger.js";
import type { AppConfig } from "../config.js";
import type { MarketDataSource } from "../data/marketDataSource.js";
import type { AdapterStatusRepository } from "../repositories/adapterStatusRepository.js";
import type { MetricsRegistry } from "../infrastructure/metricsRegistry.js";
import { ExchangeSchema, type Exchange } from "@ma-core/shared";

export interface WorkerHandles {
  stop(): void;
}

interface ScheduledPair {
  exchange: Exchange;
  pair: string;
}

export async function bootstrapWorkers(deps: {
  bus: RedisMessageBus;
  hub: LiveEventHub;
  strategyAgent: StrategyAgent;
  marketAnalyst: MarketAnalystAgent;
  orderExecutor: OrderExecutorAgent;
  drawdownGuard: DailyDrawdownGuardAgent;
  profitGuard: DailyProfitCapGuardAgent;
  timeGuard: TimeHorizonGuardAgent;
  marketDataSource: MarketDataSource;
  adapterStatuses: AdapterStatusRepository;
  metrics: MetricsRegistry;
  config: AppConfig;
}): Promise<WorkerHandles> {
  const channels: readonly EventChannel[] = ["agent.market.vector", "agent.strategy.signal", "agent.execution.order", "agent.execution.status", "agent.risk.state", "agent.risk.halt", "agent.position.timeout", "agent.strategy.feed", "agent.live.log", "security.audit"];
  for (const channel of channels) {
    await deps.bus.subscribe(channel, async (envelope) => {
      deps.hub.emit(envelope);
    });
  }
  const durableConsumers: StreamConsumerHandle[] = [
    await deps.bus.consumeDurable("agent.market.vector", "strategy-agent-v1", `strategy-${process.pid}`, async (envelope) => {
      if (envelope.channel === "agent.market.vector") {
        const marketEnvelope = envelope as MarketVectorEnvelope;
        await deps.strategyAgent.handleMarketEnvelope(marketEnvelope);
      }
    }),
    await deps.bus.consumeDurable("agent.strategy.signal", "executor-agent-v1", `executor-${process.pid}`, async (envelope) => {
      if (envelope.channel === "agent.strategy.signal") {
        await deps.orderExecutor.handleSignalEnvelope(envelope as TradeSignalEnvelope);
      }
    }),
    await deps.bus.consumeDurable("agent.risk.halt", "executor-risk-halt-v1", `executor-risk-${process.pid}`, async (envelope) => {
      if (envelope.channel === "agent.risk.halt") {
        await deps.orderExecutor.handleRiskHaltEnvelope(envelope as RiskHaltEnvelope);
      }
    }),
    await deps.bus.consumeDurable("agent.position.timeout", "executor-timeout-v1", `executor-timeout-${process.pid}`, async (envelope) => {
      if (envelope.channel === "agent.position.timeout") {
        await deps.orderExecutor.handleTimeoutEnvelope(envelope as PositionTimeoutEnvelope);
      }
    })
  ];

  await deps.strategyAgent.ingestStrategies();
  const pairs = parseMarketPairs(deps.config.MARKET_PAIRS);
  await runInitialMarketCycles(deps.marketAnalyst, pairs);

  const marketInterval = setInterval(() => {
    for (const scheduled of pairs) {
      deps.marketAnalyst.run(scheduled.exchange, scheduled.pair).catch((error: unknown) => {
        logger.error({ err: error, scheduled }, "Scheduled market analyst cycle failed");
      });
    }
  }, 60_000);
  const diagnosticsInterval = setInterval(() => {
    const statuses = deps.marketDataSource.getStatuses();
    for (const status of statuses) {
      deps.metrics.setGauge("ma_core_adapter_stale", status.stale ? 1 : 0, { exchange: status.exchange, pair: status.pair });
      deps.metrics.setGauge("ma_core_adapter_reconnect_attempts", status.reconnectAttempts, { exchange: status.exchange, pair: status.pair });
    }
    deps.adapterStatuses.insertMany(statuses).catch((error: unknown) => {
      logger.warn({ err: error }, "Adapter status persistence failed");
    });
  }, 30_000);
  const strategyInterval = setInterval(() => {
    deps.strategyAgent.ingestStrategies().catch((error: unknown) => {
      logger.error({ err: error }, "Scheduled strategy ingestion failed");
    });
  }, 15 * 60_000);
  const drawdownInterval = setInterval(() => {
    deps.drawdownGuard.runOnce().catch((error: unknown) => {
      logger.error({ err: error }, "Scheduled drawdown guard cycle failed");
    });
  }, 5_000);
  const profitInterval = setInterval(() => {
    deps.profitGuard.runOnce().catch((error: unknown) => {
      logger.error({ err: error }, "Scheduled profit cap guard cycle failed");
    });
  }, 15_000);
  const timeGuardInterval = setInterval(() => {
    deps.timeGuard.runOnce().catch((error: unknown) => {
      logger.error({ err: error }, "Scheduled time horizon guard cycle failed");
    });
  }, 60_000);
  return {
    stop(): void {
      clearInterval(marketInterval);
      clearInterval(strategyInterval);
      clearInterval(diagnosticsInterval);
      clearInterval(drawdownInterval);
      clearInterval(profitInterval);
      clearInterval(timeGuardInterval);
      for (const consumer of durableConsumers) {
        consumer.stop();
      }
    }
  };
}

function parseMarketPairs(value: string): ScheduledPair[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const [exchangeRaw, pairRaw] = item.split(":");
    const exchange = ExchangeSchema.parse(exchangeRaw);
    const pair = pairRaw && /^[A-Z0-9]{2,15}\/[A-Z0-9]{2,15}$/u.test(pairRaw) ? pairRaw : "BTC/USDT";
    return { exchange, pair };
  });
}

async function runInitialMarketCycles(agent: MarketAnalystAgent, pairs: readonly ScheduledPair[]): Promise<void> {
  for (const scheduled of pairs) {
    try {
      await agent.run(scheduled.exchange, scheduled.pair);
    } catch (error) {
      logger.warn({ err: error, scheduled }, "Initial market analyst cycle failed");
    }
  }
}
