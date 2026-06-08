import { SymbolTradingRuleSchema, type Exchange, type SymbolTradingRule } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface UpsertSymbolTradingRuleInput {
  readonly exchange: Exchange;
  readonly pair: string;
  readonly symbol: string;
  readonly minQty: number;
  readonly maxQty: number;
  readonly qtyStep: number;
  readonly tickSize: number;
  readonly minNotional: number;
  readonly maxNotional: number | null;
  readonly maxLeverage: number;
  readonly contractSize: number;
  readonly marginAsset: string;
  readonly status: "TRADING" | "SETTLING" | "DISABLED";
  readonly reduceOnlySupported: boolean;
  readonly rawPayload: Record<string, unknown>;
}

export class SymbolRulesRepository {
  public constructor(private readonly db: Database) {}

  public async find(exchange: Exchange, pair: string): Promise<SymbolTradingRule | null> {
    const result = await this.db.query("SELECT * FROM symbol_trading_rules WHERE exchange = $1 AND pair = $2 LIMIT 1", [exchange, pair]);
    const row = result.rows[0];
    return row ? mapRule(row) : null;
  }

  public async upsert(input: UpsertSymbolTradingRuleInput): Promise<SymbolTradingRule> {
    const result = await this.db.query(
      `INSERT INTO symbol_trading_rules (exchange, pair, symbol, min_qty, max_qty, qty_step, tick_size, min_notional, max_notional, max_leverage, contract_size, margin_asset, status, reduce_only_supported, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       ON CONFLICT (exchange, pair)
       DO UPDATE SET symbol = EXCLUDED.symbol, min_qty = EXCLUDED.min_qty, max_qty = EXCLUDED.max_qty, qty_step = EXCLUDED.qty_step, tick_size = EXCLUDED.tick_size,
         min_notional = EXCLUDED.min_notional, max_notional = EXCLUDED.max_notional, max_leverage = EXCLUDED.max_leverage, contract_size = EXCLUDED.contract_size,
         margin_asset = EXCLUDED.margin_asset, status = EXCLUDED.status, reduce_only_supported = EXCLUDED.reduce_only_supported, raw_payload = EXCLUDED.raw_payload, updated_at = now()
       RETURNING *`,
      [input.exchange, input.pair, input.symbol, input.minQty, input.maxQty, input.qtyStep, input.tickSize, input.minNotional, input.maxNotional, input.maxLeverage, input.contractSize, input.marginAsset, input.status, input.reduceOnlySupported, JSON.stringify(input.rawPayload)]
    );
    return mapRule(result.rows[0]);
  }
}

function mapRule(row: Record<string, unknown>): SymbolTradingRule {
  return SymbolTradingRuleSchema.parse({
    id: String(row.id),
    exchange: row.exchange,
    pair: String(row.pair),
    symbol: String(row.symbol),
    minQty: Number(row.min_qty),
    maxQty: Number(row.max_qty),
    qtyStep: Number(row.qty_step),
    tickSize: Number(row.tick_size),
    minNotional: Number(row.min_notional),
    maxNotional: row.max_notional === null || row.max_notional === undefined ? null : Number(row.max_notional),
    maxLeverage: Number(row.max_leverage),
    contractSize: Number(row.contract_size),
    marginAsset: String(row.margin_asset),
    status: row.status,
    reduceOnlySupported: row.reduce_only_supported === true,
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}
