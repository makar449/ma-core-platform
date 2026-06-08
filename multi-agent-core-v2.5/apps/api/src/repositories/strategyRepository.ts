import { StrategyRuleSchema, type StrategyRule, type Timeframe, type Trend, type Volatility } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface StrategySearchFilters {
  timeframe?: Timeframe;
  trend?: Trend;
  volatility?: Volatility;
  rsiZone?: "Oversold" | "Neutral" | "Overbought";
  sourceType?: StrategyRule["sourceType"];
  minSourceTrustScore?: number;
  minFreshnessScore?: number;
  limit: number;
}

export class StrategyRepository {
  public constructor(private readonly db: Database) {}

  public async upsert(rule: StrategyRule): Promise<boolean> {
    const parsed = StrategyRuleSchema.parse(rule);
    const vector = toVector(parsed.embedding, parsed.embeddingDimensions);
    const result = await this.db.query(
      `INSERT INTO strategy_rules (
        id, source_type, source_id, source_url, source_title, extracted_text, trigger, action, target, timeframe,
        market_regime, risk_notes, confidence_score, source_trust_score, freshness_score, evidence_score,
        review_status, review_reason, embedding, embedding_vector, embedding_model, embedding_dimensions, embedding_created_at, created_at, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb, $17, $18, $19::jsonb, $20::vector, $21, $22, now(), $23, $24)
       ON CONFLICT (source_type, source_id, trigger)
       DO UPDATE SET source_title = EXCLUDED.source_title,
         extracted_text = EXCLUDED.extracted_text,
         action = EXCLUDED.action,
         target = EXCLUDED.target,
         timeframe = EXCLUDED.timeframe,
         market_regime = EXCLUDED.market_regime,
         risk_notes = EXCLUDED.risk_notes,
         confidence_score = EXCLUDED.confidence_score,
         source_trust_score = EXCLUDED.source_trust_score,
         freshness_score = EXCLUDED.freshness_score,
         evidence_score = EXCLUDED.evidence_score,
         review_status = EXCLUDED.review_status,
         review_reason = EXCLUDED.review_reason,
         embedding = EXCLUDED.embedding,
         embedding_vector = EXCLUDED.embedding_vector,
         embedding_model = EXCLUDED.embedding_model,
         embedding_dimensions = EXCLUDED.embedding_dimensions,
         embedding_created_at = now(),
         last_seen_at = EXCLUDED.last_seen_at
       RETURNING xmax = 0 AS inserted`,
      [
        parsed.id,
        parsed.sourceType,
        parsed.sourceId,
        parsed.sourceUrl ?? null,
        parsed.sourceTitle,
        parsed.extractedText,
        parsed.trigger,
        parsed.action,
        parsed.target,
        parsed.timeframe,
        JSON.stringify(parsed.marketRegime),
        JSON.stringify(parsed.riskNotes),
        parsed.confidenceScore,
        parsed.sourceTrustScore,
        parsed.freshnessScore,
        JSON.stringify(parsed.evidenceScore),
        parsed.reviewStatus,
        parsed.reviewReason,
        JSON.stringify(parsed.embedding),
        vector,
        parsed.embeddingModel,
        parsed.embeddingDimensions,
        parsed.createdAt,
        parsed.lastSeenAt
      ]
    );
    const row = result.rows[0] as { inserted?: unknown } | undefined;
    return row?.inserted === true || row?.inserted === "t";
  }

  public async listRecentAccepted(limit: number): Promise<StrategyRule[]> {
    const result = await this.db.query(
      `SELECT * FROM strategy_rules WHERE review_status = 'ACCEPTED' ORDER BY last_seen_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map((row) => mapStrategyRow(row));
  }

  public async listRecent(limit: number): Promise<StrategyRule[]> {
    const result = await this.db.query(
      `SELECT * FROM strategy_rules ORDER BY last_seen_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map((row) => mapStrategyRow(row));
  }

  public async searchByVector(queryEmbedding: readonly number[], filters: StrategySearchFilters): Promise<StrategyRule[]> {
    const params: unknown[] = [toVector(queryEmbedding, queryEmbedding.length)];
    const clauses = ["review_status = 'ACCEPTED'"];
    if (filters.timeframe) {
      params.push(filters.timeframe);
      clauses.push(`timeframe = $${params.length}`);
    }
    if (filters.trend) {
      params.push(filters.trend);
      clauses.push(`market_regime->>'trend' = $${params.length}`);
    }
    if (filters.volatility) {
      params.push(filters.volatility);
      clauses.push(`(market_regime->>'volatility' = $${params.length} OR market_regime->>'volatility' IS NULL)`);
    }
    if (filters.rsiZone) {
      params.push(filters.rsiZone);
      clauses.push(`market_regime->>'rsiZone' = $${params.length}`);
    }
    if (filters.sourceType) {
      params.push(filters.sourceType);
      clauses.push(`source_type = $${params.length}`);
    }
    if (filters.minSourceTrustScore !== undefined) {
      params.push(filters.minSourceTrustScore);
      clauses.push(`source_trust_score >= $${params.length}`);
    }
    if (filters.minFreshnessScore !== undefined) {
      params.push(filters.minFreshnessScore);
      clauses.push(`freshness_score >= $${params.length}`);
    }
    params.push(Math.min(Math.max(filters.limit, 1), 50));
    const sql = `SELECT *, (embedding_vector <=> $1::vector) AS distance
      FROM strategy_rules
      WHERE ${clauses.join(" AND ")}
      ORDER BY (embedding_vector <=> $1::vector) ASC,
        source_trust_score DESC,
        freshness_score DESC,
        (evidence_score->>'aggregate')::double precision DESC
      LIMIT $${params.length}`;
    const result = await this.db.query(sql, params);
    return result.rows.map((row) => mapStrategyRow(row));
  }
}

function toVector(values: readonly number[], dimensions: number): string {
  const normalized = [...values].slice(0, dimensions).map((value) => Number.isFinite(value) ? Number(value.toFixed(8)) : 0);
  while (normalized.length < dimensions) {
    normalized.push(0);
  }
  return `[${normalized.join(",")}]`;
}

function mapStrategyRow(row: Record<string, unknown>): StrategyRule {
  return StrategyRuleSchema.parse({
    id: String(row.id),
    sourceType: row.source_type,
    sourceId: String(row.source_id),
    sourceUrl: row.source_url === null || row.source_url === undefined ? undefined : String(row.source_url),
    sourceTitle: String(row.source_title),
    extractedText: String(row.extracted_text),
    trigger: String(row.trigger),
    action: row.action,
    target: String(row.target),
    timeframe: row.timeframe,
    marketRegime: row.market_regime,
    riskNotes: row.risk_notes,
    confidenceScore: Number(row.confidence_score),
    sourceTrustScore: Number(row.source_trust_score),
    freshnessScore: Number(row.freshness_score),
    evidenceScore: row.evidence_score,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    embedding: row.embedding,
    embeddingModel: String(row.embedding_model ?? "deterministic-local-v1"),
    embeddingDimensions: Number(row.embedding_dimensions ?? 64),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString()
  });
}
