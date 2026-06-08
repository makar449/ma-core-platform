import type { MarketVector, StrategyRule } from "@ma-core/shared";
import { deterministicEmbedding, cosineSimilarity } from "./embedding.js";
import { StrategyRepository } from "../repositories/strategyRepository.js";

export interface StrategyMatch {
  rule: StrategyRule;
  score: number;
}

export class StrategyVectorStore {
  public constructor(private readonly repository: StrategyRepository) {}

  public async upsert(rule: StrategyRule): Promise<boolean> {
    return this.repository.upsert(rule);
  }

  public async searchForMarket(vector: MarketVector, limit: number): Promise<StrategyMatch[]> {
    const indicator5m = vector.technicalSummary["5m"] ?? Object.values(vector.technicalSummary)[0];
    const rsi5m = indicator5m?.rsi ?? 50;
    const rsiZone = rsi5m < 35 ? "Oversold" : rsi5m > 70 ? "Overbought" : "Neutral";
    const queryText = `${vector.trend} ${vector.volatility} ${vector.dominantTimeframe} ${vector.anomalies.join(" ")} RSI ${rsi5m}`;
    const queryEmbedding = deterministicEmbedding(queryText, 64);
    const candidates = await this.repository.searchByVector(queryEmbedding, { timeframe: vector.dominantTimeframe, volatility: vector.volatility, rsiZone, minSourceTrustScore: 0.45, minFreshnessScore: 0.15, limit: Math.min(Math.max(limit * 4, 8), 40) })
      .catch(async () => this.repository.listRecentAccepted(160));
    return candidates.map((rule) => ({ rule, score: this.scoreRule(rule, queryEmbedding, vector) })).sort((left, right) => right.score - left.score).slice(0, Math.min(Math.max(limit, 1), 20));
  }

  private scoreRule(rule: StrategyRule, queryEmbedding: readonly number[], vector: MarketVector): number {
    const semantic = cosineSimilarity(queryEmbedding, rule.embedding);
    const timeframeBoost = rule.timeframe === vector.dominantTimeframe ? 0.14 : 0;
    const trendBoost = rule.marketRegime.trend === undefined || rule.marketRegime.trend === vector.trend ? 0.12 : -0.08;
    const volatilityBoost = rule.marketRegime.volatility === undefined || rule.marketRegime.volatility === vector.volatility ? 0.08 : -0.06;
    const rsi = (vector.technicalSummary["5m"] ?? Object.values(vector.technicalSummary)[0])?.rsi ?? 50;
    const rsiZone = rsi < 35 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral";
    const rsiBoost = rule.marketRegime.rsiZone === undefined || rule.marketRegime.rsiZone === rsiZone ? 0.1 : -0.05;
    const trustBoost = rule.sourceTrustScore * 0.1;
    const freshnessBoost = rule.freshnessScore * 0.08;
    const evidenceBoost = rule.evidenceScore.aggregate * 0.08;
    return Number((semantic * 0.5 + timeframeBoost + trendBoost + volatilityBoost + rsiBoost + trustBoost + freshnessBoost + evidenceBoost + rule.confidenceScore * 0.14).toFixed(4));
  }
}
