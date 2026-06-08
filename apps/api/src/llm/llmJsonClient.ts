import { MarketVectorSchema, StrategyRuleSchema, type MarketSnapshot, type MarketVector, type StrategyRule } from "@ma-core/shared";
import type { AppConfig } from "../config.js";
import { buildEmbedding } from "../strategies/embedding.js";
import { nanoid } from "nanoid";
import { computeFreshnessScore } from "../osint/trustedSources.js";
import { reviewTradingText } from "../osint/qualityFilters.js";
import type { LlmFailureRepository } from "../repositories/llmFailureRepository.js";

interface ChatMessage { role: "system" | "user"; content: string }
interface ChatCompletionChoice { message?: { content?: string } }
interface ChatCompletionResponse { choices?: readonly ChatCompletionChoice[] }

export class LlmJsonClient {
  public constructor(private readonly config: AppConfig, private readonly failures?: LlmFailureRepository) {}

  public async buildMarketVector(snapshot: MarketSnapshot): Promise<MarketVector> {
    if (!this.config.LLM_API_KEY) return this.buildDeterministicMarketVector(snapshot);
    const system = "Ты — ведущий квантовый аналитик криптовалютного рынка. Игнорируй эмоции. Верни только валидный JSON с trend, volatility, anomalies, keyLevels, dominantTimeframe и confidenceScore. Не добавляй Markdown.";
    try {
      const raw = await this.requestJson("market_vector_v1.3", [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(snapshot) }
      ]);
      const parsed = MarketVectorSchema.partial({ exchange: true, pair: true, technicalSummary: true, generatedAt: true, fundingRate: true, orderbookImbalance: true }).safeParse(raw);
      if (!parsed.success) return this.buildDeterministicMarketVector(snapshot);
      return MarketVectorSchema.parse({ ...parsed.data, exchange: snapshot.exchange, pair: snapshot.pair, technicalSummary: snapshot.indicators, fundingRate: snapshot.fundingRate, orderbookImbalance: snapshot.orderbookImbalance, dataQuality: snapshot.dataQuality, generatedAt: new Date().toISOString() });
    } catch (error) {
      await this.recordFailure("market_vector_v1.3", "market_vector", error, { exchange: snapshot.exchange, pair: snapshot.pair });
      return this.buildDeterministicMarketVector(snapshot);
    }
  }

  public async normalizeStrategy(source: { sourceType: StrategyRule["sourceType"]; sourceId: string; sourceUrl?: string; sourceTitle: string; text: string; publishedAt?: string; sourceTrustScore?: number }): Promise<StrategyRule> {
    const review = reviewTradingText(source.text);
    if (!this.config.LLM_API_KEY) return this.buildRuleFromText(source);
    try {
      const system = "Ты переводишь человеческую торговую идею в формализованное правило. Верни только JSON: trigger, action, target, timeframe, marketRegime, riskNotes, confidenceScore. Не добавляй Markdown.";
      const raw = await this.requestJson("strategy_normalization_v1.3", [
        { role: "system", content: system },
        { role: "user", content: this.redact(source.text) }
      ]);
      const partial = StrategyRuleSchema.omit({ id: true, sourceType: true, sourceId: true, sourceUrl: true, sourceTitle: true, extractedText: true, sourceTrustScore: true, freshnessScore: true, evidenceScore: true, reviewStatus: true, reviewReason: true, embedding: true, embeddingModel: true, embeddingDimensions: true, createdAt: true, lastSeenAt: true }).safeParse(raw);
      if (!partial.success) return this.buildRuleFromText(source);
      const normalizedText = `${partial.data.trigger} ${partial.data.action} ${partial.data.target} ${source.text}`;
      const embedding = await buildEmbedding(normalizedText, this.config);
      return StrategyRuleSchema.parse({
        id: `str_${nanoid(18)}`,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourceUrl: source.sourceUrl,
        sourceTitle: source.sourceTitle,
        extractedText: source.text,
        ...partial.data,
        confidenceScore: clampScore(partial.data.confidenceScore - review.penalty),
        sourceTrustScore: source.sourceTrustScore ?? this.scoreSourceTrust(source.sourceType),
        freshnessScore: computeFreshnessScore(source.publishedAt),
        evidenceScore: review.evidence,
        reviewStatus: review.status,
        reviewReason: review.reason,
        embedding: embedding.values,
        embeddingModel: embedding.model,
        embeddingDimensions: embedding.dimensions,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });
    } catch (error) {
      await this.recordFailure("strategy_normalization_v1.3", "strategy_normalization", error, { sourceType: source.sourceType, sourceId: source.sourceId });
      return this.buildRuleFromText(source);
    }
  }

  private async requestJson(promptVersion: string, messages: readonly ChatMessage[]): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.LLM_MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.LLM_TIMEOUT_MS);
      try {
        const response = await fetch(new URL("/chat/completions", this.config.LLM_BASE_URL), {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.config.LLM_API_KEY ?? ""}` },
          body: JSON.stringify({ model: this.config.LLM_MODEL, messages, temperature: 0.1, response_format: { type: "json_object" } }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`LLM ${promptVersion} failed with status ${response.status}`);
        const body = await response.json() as ChatCompletionResponse;
        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new Error("LLM returned an empty response");
        return this.parseJsonSafely(content);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`LLM ${promptVersion} failed`);
  }


  private async recordFailure(promptVersion: string, operation: string, error: unknown, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    if (!this.failures) return;
    const message = error instanceof Error ? error.message : "Unknown LLM failure";
    const failureType = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "PROVIDER_OR_SCHEMA_ERROR";
    try {
      await this.failures.insert({
        promptVersion,
        model: this.config.LLM_MODEL,
        operation,
        failureType,
        message: this.redact(message),
        metadata
      });
    } catch {
      return;
    }
  }

  private parseJsonSafely(content: string): unknown {
    try { return JSON.parse(content) as unknown; } catch {}
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1)) as unknown;
    throw new Error("LLM response was not JSON");
  }

  private buildDeterministicMarketVector(snapshot: MarketSnapshot): MarketVector {
    const indicator5m = snapshot.indicators["5m"] ?? Object.values(snapshot.indicators)[0];
    const indicator15m = snapshot.indicators["15m"] ?? indicator5m;
    if (!indicator5m || !indicator15m) throw new Error("Market snapshot contains no technical indicators");
    const trend = indicator15m.ema20 > indicator15m.ema50 && indicator15m.ema50 > indicator15m.ema200 ? "Bullish" : indicator15m.ema20 < indicator15m.ema50 && indicator15m.ema50 < indicator15m.ema200 ? "Bearish" : "Sideways";
    const volatility = snapshot.spreadBps > 4.5 || snapshot.liquidations1h > 14_000_000 ? "High" : "Low";
    const anomalies: string[] = [];
    if (Math.abs(snapshot.orderbookImbalance) > 0.55) anomalies.push("Выраженный дисбаланс стакана указывает на агрессивное давление одной стороны.");
    if (Math.abs(snapshot.fundingRate) > 0.012) anomalies.push("Funding rate вышел за нейтральный диапазон и может усиливать squeeze-risk.");
    if (indicator5m.rsi < 35 && trend === "Sideways") anomalies.push("RSI 5m находится в зоне перепроданности при боковом режиме рынка.");
    if (indicator5m.rsi > 70 && trend === "Sideways") anomalies.push("RSI 5m находится в зоне перекупленности при боковом режиме рынка.");
    return MarketVectorSchema.parse({ exchange: snapshot.exchange, pair: snapshot.pair, trend, volatility, anomalies, keyLevels: { support: Number(Math.min(indicator5m.bollingerLower, indicator15m.bollingerLower).toFixed(2)), resistance: Number(Math.max(indicator5m.bollingerUpper, indicator15m.bollingerUpper).toFixed(2)) }, fundingRate: snapshot.fundingRate, orderbookImbalance: snapshot.orderbookImbalance, dominantTimeframe: volatility === "High" ? "1m" : "5m", technicalSummary: snapshot.indicators, confidenceScore: Number((0.68 + Math.min(anomalies.length * 0.06, 0.18)).toFixed(2)), dataQuality: snapshot.dataQuality, generatedAt: new Date().toISOString() });
  }

  private async buildRuleFromText(source: { sourceType: StrategyRule["sourceType"]; sourceId: string; sourceUrl?: string; sourceTitle: string; text: string; publishedAt?: string; sourceTrustScore?: number }): Promise<StrategyRule> {
    const review = reviewTradingText(source.text);
    const normalized = source.text.toLowerCase();
    const action = normalized.includes("short") || normalized.includes("шорт") ? "SHORT" : normalized.includes("flat") ? "NO_TRADE" : "LONG";
    const timeframe = normalized.includes("15m") || normalized.includes("15 м") ? "15m" : normalized.includes("1h") || normalized.includes("1 час") ? "1h" : normalized.includes("1m") ? "1m" : "5m";
    const rsiZone = normalized.includes("oversold") || normalized.includes("перепрод") ? "Oversold" : normalized.includes("overbought") || normalized.includes("перекуп") ? "Overbought" : "Neutral";
    const trigger = normalized.includes("ema200") || normalized.includes("ema 200") ? `${timeframe}_candle_close > EMA200` : rsiZone === "Oversold" ? "RSI < 35 and price near lower Bollinger Band" : "Momentum confirmation with orderbook imbalance";
    const target = action === "SHORT" ? "Nearest support or lower Bollinger band" : "Nearest resistance or mean reversion midpoint";
    const embedding = await buildEmbedding(`${trigger} ${action} ${target} ${source.text}`, this.config);
    return StrategyRuleSchema.parse({ id: `str_${nanoid(18)}`, sourceType: source.sourceType, sourceId: source.sourceId, sourceUrl: source.sourceUrl, sourceTitle: source.sourceTitle, extractedText: source.text, trigger, action, target, timeframe, marketRegime: { trend: action === "SHORT" ? "Bearish" : undefined, volatility: undefined, rsiZone }, riskNotes: ["Сигнал должен пройти независимый risk-check до исполнения.", "Ликвидность и funding проверяются перед выставлением ордера."], confidenceScore: clampScore(this.scoreRuleConfidence(source.text) - review.penalty), sourceTrustScore: source.sourceTrustScore ?? this.scoreSourceTrust(source.sourceType), freshnessScore: computeFreshnessScore(source.publishedAt), evidenceScore: review.evidence, reviewStatus: review.status, reviewReason: review.reason, embedding: embedding.values, embeddingModel: embedding.model, embeddingDimensions: embedding.dimensions, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
  }

  private redact(value: string): string {
    return value.replace(/([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,})/g, "[REDACTED_JWT]").replace(/(api[_-]?secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
  }

  private scoreSourceTrust(sourceType: StrategyRule["sourceType"]): number {
    if (sourceType === "INTERNAL_SEED") return 0.92;
    if (sourceType === "YOUTUBE") return 0.72;
    if (sourceType === "X") return 0.64;
    return 0.58;
  }

  private scoreRuleConfidence(text: string): number {
    const normalized = text.toLowerCase();
    let score = 0.56;
    if (normalized.includes("stop") || normalized.includes("invalid")) score += 0.08;
    if (normalized.includes("rsi") || normalized.includes("ema") || normalized.includes("vwap")) score += 0.08;
    if (normalized.includes("leverage") || normalized.includes("100x")) score -= 0.12;
    return clampScore(score);
  }
}

function clampScore(value: number): number {
  return Math.max(0.05, Math.min(0.95, Number(value.toFixed(2))));
}
