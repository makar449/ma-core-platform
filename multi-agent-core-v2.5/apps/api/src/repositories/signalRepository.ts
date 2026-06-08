import { TradeSignalSchema, type TradeSignal } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export class SignalRepository {
  public constructor(private readonly db: Database) {}

  public async insert(signal: TradeSignal, userId?: string): Promise<void> {
    const parsed = TradeSignalSchema.parse(userId ? { ...signal, userId } : signal);
    await this.db.query(
      `INSERT INTO trade_signals (id, transaction_id, user_id, pair, action, leverage, strategy_source, strategy_id, confidence_score, rationale, technical_indicators, entry_price_range, suggested_stop_loss, suggested_take_profit, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.transactionId,
        parsed.userId ?? null,
        parsed.pair,
        parsed.action,
        parsed.leverage,
        parsed.strategySource,
        parsed.strategyId,
        parsed.confidenceScore,
        parsed.rationale,
        JSON.stringify(parsed.technicalIndicators),
        parsed.entryPriceRange ? JSON.stringify(parsed.entryPriceRange) : null,
        parsed.suggestedStopLoss ?? null,
        parsed.suggestedTakeProfit ?? null,
        parsed.createdAt
      ]
    );
  }

  public async listRecentForUser(userId: string, limit: number): Promise<TradeSignal[]> {
    const result = await this.db.query(
      `SELECT * FROM trade_signals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => mapSignalRow(row));
  }

  public async listRecentGlobal(limit: number): Promise<TradeSignal[]> {
    const result = await this.db.query(
      `SELECT * FROM trade_signals WHERE user_id IS NULL ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => mapSignalRow(row));
  }
}

function mapSignalRow(row: Record<string, unknown>): TradeSignal {
  return TradeSignalSchema.parse({
    id: String(row.id),
    transactionId: String(row.transaction_id),
    userId: row.user_id === null || row.user_id === undefined ? undefined : String(row.user_id),
    pair: String(row.pair),
    action: row.action,
    leverage: Number(row.leverage),
    strategySource: String(row.strategy_source),
    strategyId: String(row.strategy_id),
    confidenceScore: Number(row.confidence_score),
    rationale: String(row.rationale),
    technicalIndicators: row.technical_indicators,
    entryPriceRange: row.entry_price_range === null || row.entry_price_range === undefined ? undefined : row.entry_price_range,
    suggestedStopLoss: row.suggested_stop_loss === null || row.suggested_stop_loss === undefined ? undefined : Number(row.suggested_stop_loss),
    suggestedTakeProfit: row.suggested_take_profit === null || row.suggested_take_profit === undefined ? undefined : Number(row.suggested_take_profit),
    createdAt: new Date(String(row.created_at)).toISOString()
  });
}
