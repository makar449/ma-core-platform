import { describe, expect, it } from "vitest";
import type { MarketVector, StrategyRule } from "@ma-core/shared";
import { StrategyVectorStore } from "../vectorStore.js";
import { deterministicEmbedding } from "../embedding.js";

class MemoryRepository {
  public readonly rules: StrategyRule[] = [];
  public async upsert(rule: StrategyRule): Promise<boolean> {
    this.rules.push(rule);
    return true;
  }
  public async listRecentAccepted(): Promise<StrategyRule[]> {
    return this.rules;
  }
  public async searchByVector(): Promise<StrategyRule[]> {
    return this.rules;
  }
}

const now = new Date().toISOString();

describe("StrategyVectorStore", () => {
  it("prioritizes matching timeframe and RSI regime", async () => {
    const repository = new MemoryRepository();
    const store = new StrategyVectorStore(repository as never);
    const rule: StrategyRule = {
      id: "str_test_123",
      sourceType: "INTERNAL_SEED",
      sourceId: "seed",
      sourceTitle: "Mean reversion",
      extractedText: "RSI oversold mean reversion",
      trigger: "RSI < 35 and price near lower Bollinger Band",
      action: "LONG",
      target: "mid band",
      timeframe: "5m",
      marketRegime: { trend: "Sideways", volatility: "Low", rsiZone: "Oversold" },
      riskNotes: [],
      confidenceScore: 0.72,
      sourceTrustScore: 0.92,
      freshnessScore: 0.9,
      evidenceScore: { trigger: 1, invalidation: 0, stopLoss: 0, timeframe: 1, riskReward: 0.5, aggregate: 0.5 },
      reviewStatus: "ACCEPTED",
      reviewReason: "test accepted",
      embeddingModel: "deterministic-local-v1",
      embeddingDimensions: 64,
      embedding: deterministicEmbedding("RSI oversold mean reversion"),
      createdAt: now,
      lastSeenAt: now
    };
    await store.upsert(rule);
    const vector: MarketVector = {
      exchange: "BINANCE",
      pair: "BTC/USDT",
      trend: "Sideways",
      volatility: "Low",
      anomalies: ["RSI oversold"],
      keyLevels: { support: 100, resistance: 120 },
      fundingRate: 0,
      orderbookImbalance: 0.1,
      dominantTimeframe: "5m",
      technicalSummary: {
        "1m": flatIndicators(105),
        "5m": { ...flatIndicators(105), rsi: 31 },
        "15m": flatIndicators(106),
        "1h": flatIndicators(107)
      },
      confidenceScore: 0.7,
      generatedAt: now
    };
    const matches = await store.searchForMarket(vector, 1);
    expect(matches[0]?.rule.id).toBe(rule.id);
    expect(matches[0]?.score).toBeGreaterThan(0.2);
  });
});

function flatIndicators(price: number) {
  return { rsi: 50, macd: 0, macdSignal: 0, ema20: price, ema50: price, ema200: price, bollingerUpper: price + 5, bollingerMiddle: price, bollingerLower: price - 5 };
}
