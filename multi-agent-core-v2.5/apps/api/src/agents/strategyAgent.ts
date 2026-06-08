import { nanoid } from "nanoid";
import { LiveLogEnvelopeSchema, StrategyFeedEnvelopeSchema, TradeSignalEnvelopeSchema, type MarketVectorEnvelope, type TradeSignal } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { SignalRepository } from "../repositories/signalRepository.js";
import type { LlmJsonClient } from "../llm/llmJsonClient.js";
import type { OsintSourceClient, RawStrategySource } from "../osint/types.js";
import { seedStrategySources } from "../osint/seedStrategies.js";
import type { StrategyVectorStore } from "../strategies/vectorStore.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import type { OsintRepository } from "../repositories/osintRepository.js";

export class StrategyAgent {
  public constructor(
    private readonly sources: readonly OsintSourceClient[],
    private readonly llm: LlmJsonClient,
    private readonly vectorStore: StrategyVectorStore,
    private readonly signals: SignalRepository,
    private readonly osint: OsintRepository,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository
  ) {}

  public async ingestStrategies(): Promise<number> {
    const collected = await this.deduplicateSources([...seedStrategySources()]);
    for (const source of this.sources) {
      try {
        collected.push(...await this.deduplicateSources(await source.fetchFreshIdeas()));
      } catch (error) {
        await this.publishLog("warn", `Источник ${source.name} временно недоступен: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    let stored = 0;
    for (const item of collected) {
      const rule = await this.llm.normalizeStrategy(item);
      const changed = await this.vectorStore.upsert(rule);
      if (!changed) continue;
      stored += 1;
      const feedEnvelope = StrategyFeedEnvelopeSchema.parse({
        ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_2_Strategist", channel: "agent.strategy.feed", pipelineStage: "strategy_ingestion", idempotencyScope: `${rule.sourceType}:${rule.sourceId}:${rule.trigger}`, agentLog: `Стратег деконструировал источник ${rule.sourceType}: ${rule.sourceTitle}` }),
        payload: { sourceType: rule.sourceType, sourceTitle: rule.sourceTitle, sourceUrl: rule.sourceUrl, trigger: rule.trigger, action: rule.action, confidenceScore: rule.confidenceScore, sourceTrustScore: rule.sourceTrustScore, freshnessScore: rule.freshnessScore, evidenceScore: rule.evidenceScore.aggregate, reviewStatus: rule.reviewStatus, reviewReason: rule.reviewReason }
      });
      await this.events.insert(feedEnvelope, undefined, rule.reviewStatus === "ACCEPTED" ? "global" : "system");
      if (rule.reviewStatus === "ACCEPTED") await this.bus.publish(feedEnvelope);
    }
    return stored;
  }

  public async handleMarketEnvelope(envelope: MarketVectorEnvelope): Promise<TradeSignal | null> {
    return this.handleMarketVector(envelope.transaction_id, envelope.payload, envelope.user_id);
  }

  public async handleMarketVector(transactionId: string, vector: MarketVectorEnvelope["payload"], userId?: string): Promise<TradeSignal | null> {
    const matches = await this.vectorStore.searchForMarket(vector, 3);
    const best = matches[0];
    if (!best || best.score < 0.28) {
      await this.publishLog("info", `Стратег не нашел подходящую стратегию для ${vector.pair}; сигнал не создан.`, userId);
      return null;
    }
    const action = best.rule.action === "NO_TRADE" ? "NO_TRADE" : best.rule.action;
    const indicator5m = vector.technicalSummary["5m"] ?? Object.values(vector.technicalSummary)[0];
    if (!indicator5m) {
      await this.publishLog("warn", `Стратег не получил технические индикаторы для ${vector.pair}; сигнал не создан.`, userId);
      return null;
    }
    const confidenceScore = Math.max(0, Math.min(1, Number(((best.score + best.rule.confidenceScore + best.rule.sourceTrustScore * 0.22 + best.rule.evidenceScore.aggregate * 0.18) / 2.4).toFixed(2))));
    const executionLevels = this.deriveExecutionLevels(action, vector.keyLevels.support, vector.keyLevels.resistance);
    const signal = {
      id: `sig_${nanoid(18)}`,
      transactionId,
      ...(userId ? { userId } : {}),
      pair: vector.pair,
      action,
      leverage: this.calculateLeverage(confidenceScore, vector.volatility),
      strategySource: `${best.rule.sourceType}:${best.rule.sourceTitle}`,
      strategyId: best.rule.id,
      confidenceScore,
      rationale: `Совпадение режима ${vector.trend}/${vector.volatility} с правилом "${best.rule.trigger}". Trust=${best.rule.sourceTrustScore}, freshness=${best.rule.freshnessScore}, evidence=${best.rule.evidenceScore.aggregate}. Источник: ${best.rule.sourceTitle}.`,
      technicalIndicators: { rsi5m: indicator5m.rsi, fundingRate: vector.fundingRate, orderbookImbalance: vector.orderbookImbalance },
      ...(executionLevels ? executionLevels : {}),
      createdAt: new Date().toISOString()
    } satisfies TradeSignal;
    await this.signals.insert(signal, userId);
    const envelopeOut = TradeSignalEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId, senderAgent: "Agent_2_Strategist", targetAgent: "Agent_3_Executor", channel: "agent.strategy.signal", pipelineStage: "signal_generation", idempotencyScope: `${transactionId}:${signal.strategyId}:${signal.action}:${userId ?? "global"}`, agentLog: `Стратег сформировал сигнал ${signal.action} по ${signal.pair} с уверенностью ${signal.confidenceScore}.`, userId }),
      payload: signal
    });
    await this.events.insert(envelopeOut, userId, userId ? "user" : "global");
    await this.bus.publish(envelopeOut);
    return signal;
  }

  private async deduplicateSources(items: readonly RawStrategySource[]): Promise<RawStrategySource[]> {
    const result: RawStrategySource[] = [];
    for (const item of items) {
      const decision = await this.osint.registerSeen(item);
      if (!decision.duplicate) result.push(item);
    }
    return result;
  }

  private deriveExecutionLevels(action: TradeSignal["action"], support: number, resistance: number): Pick<TradeSignal, "entryPriceRange" | "suggestedStopLoss" | "suggestedTakeProfit"> | null {
    if (action !== "LONG" && action !== "SHORT") {
      return null;
    }
    const spread = Math.max(Math.abs(resistance - support), support * 0.004);
    const center = action === "LONG" ? support + spread * 0.28 : resistance - spread * 0.28;
    const halfRange = center * 0.0015;
    if (action === "LONG") {
      return {
        entryPriceRange: { min: Number((center - halfRange).toFixed(6)), max: Number((center + halfRange).toFixed(6)) },
        suggestedStopLoss: Number((support - spread * 0.16).toFixed(6)),
        suggestedTakeProfit: Number((resistance - spread * 0.05).toFixed(6))
      };
    }
    return {
      entryPriceRange: { min: Number((center - halfRange).toFixed(6)), max: Number((center + halfRange).toFixed(6)) },
      suggestedStopLoss: Number((resistance + spread * 0.16).toFixed(6)),
      suggestedTakeProfit: Number((support + spread * 0.05).toFixed(6))
    };
  }

  private calculateLeverage(confidence: number, volatility: MarketVectorEnvelope["payload"]["volatility"]): number {
    const raw = confidence >= 0.82 ? 5 : confidence >= 0.68 ? 3 : 1;
    return volatility === "High" ? Math.max(1, raw - 1) : raw;
  }

  private async publishLog(severity: "debug" | "info" | "warn" | "error", message: string, userId?: string): Promise<void> {
    const envelope = LiveLogEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_2_Strategist", channel: "agent.live.log", pipelineStage: "live_log", idempotencyScope: `strategy-log:${message}:${userId ?? "global"}`, agentLog: message, userId }),
      payload: { severity, message }
    });
    await this.events.insert(envelope, userId, userId ? "user" : "global");
    await this.bus.publish(envelope);
  }
}
