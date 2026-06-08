import { nanoid } from "nanoid";
import { MarketVectorEnvelopeSchema, type Exchange } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { MarketDataSource } from "../data/marketDataSource.js";
import type { LlmJsonClient } from "../llm/llmJsonClient.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";

export class MarketAnalystAgent {
  public constructor(
    private readonly dataSource: MarketDataSource,
    private readonly llm: LlmJsonClient,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository
  ) {}

  public async run(exchange: Exchange, pair: string, userId?: string): Promise<string> {
    const transactionId = `tx_${nanoid(18)}`;
    const traceId = `trace_${nanoid(18)}`;
    const snapshot = await this.dataSource.getSnapshot(exchange, pair);
    const vector = await this.llm.buildMarketVector(snapshot);
    const envelope = MarketVectorEnvelopeSchema.parse({
      ...buildEnvelopeBase({
        transactionId,
        traceId,
        senderAgent: "Agent_1_Market_Analyst",
        targetAgent: "Agent_2_Strategist",
        channel: "agent.market.vector",
        pipelineStage: "market_analysis",
        idempotencyScope: `${exchange}:${pair}:${snapshot.observedAt}:${userId ?? "global"}`,
        agentLog: `Аналитик сформировал вектор рынка ${exchange} ${pair}: ${vector.trend}, волатильность ${vector.volatility}, качество данных ${vector.dataQuality?.source ?? "unknown"}.`,
        userId
      }),
      payload: vector
    });
    await this.events.insert(envelope, userId, userId ? "user" : "global");
    await this.bus.publish(envelope);
    return transactionId;
  }
}
