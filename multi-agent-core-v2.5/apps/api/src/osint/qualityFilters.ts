import type { EvidenceScore, StrategyReviewStatus } from "@ma-core/shared";

const scamPatterns = [/\b100x\b/i, /guaranteed/i, /\bmoon\b/i, /send\s*it/i, /referral/i, /promo\s*code/i, /risk[-\s]?free/i, /profit\s*guaranteed/i];

export interface SourceQualityReview {
  status: StrategyReviewStatus;
  reason: string;
  evidence: EvidenceScore;
  penalty: number;
}

export function reviewTradingText(text: string): SourceQualityReview {
  const normalized = text.toLowerCase();
  const scamHits = scamPatterns.filter((pattern) => pattern.test(text)).length;
  const trigger = /rsi|ema|vwap|macd|breakout|support|resistance|bollinger|orderbook|funding|oi|open interest/i.test(text) ? 1 : 0.25;
  const invalidation = /invalid|invalidation|close below|close above|слом|отмена/i.test(text) ? 1 : 0;
  const stopLoss = /stop|sl\b|стоп/i.test(text) ? 1 : 0;
  const timeframe = /\b(1m|5m|15m|1h|4h|daily)\b|таймфрейм|свеч/i.test(text) ? 1 : 0.35;
  const riskReward = /risk.?reward|r:r|rr|take.?profit|tp\b|цель/i.test(text) ? 1 : 0.15;
  const aggregate = Number(((trigger + invalidation + stopLoss + timeframe + riskReward) / 5).toFixed(2));
  if (scamHits >= 2) {
    return { status: "REJECTED", reason: "Источник отклонен анти-памп фильтром: обнаружены агрессивные промо/гарантии доходности.", evidence: { trigger, invalidation, stopLoss, timeframe, riskReward, aggregate }, penalty: 0.4 };
  }
  if (scamHits === 1 || aggregate < 0.35) {
    return { status: "QUARANTINED", reason: scamHits === 1 ? "Стратегия помещена в quarantine: обнаружен один манипулятивный промо-маркер." : "Стратегия помещена в quarantine: недостаточно evidence для безопасного сигнала.", evidence: { trigger, invalidation, stopLoss, timeframe, riskReward, aggregate }, penalty: 0.18 };
  }
  return { status: "ACCEPTED", reason: "Стратегия прошла анти-спам фильтр и содержит достаточные элементы evidence.", evidence: { trigger, invalidation, stopLoss, timeframe, riskReward, aggregate }, penalty: 0 };
}
