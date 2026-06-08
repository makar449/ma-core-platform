import { RiskPolicySchema, type RiskPolicy } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface RiskPolicyPatch {
  readonly maxDailyDrawdownRatio?: number;
  readonly dailyProfitCapRatio?: number;
  readonly riskPerTradeFraction?: number;
  readonly maxOpenPositions?: number;
  readonly maxDailyTrades?: number;
  readonly maxSymbolExposureRatio?: number;
  readonly maxAccountExposureRatio?: number;
  readonly maxSpreadBps?: number;
  readonly maxOrderbookAgeMs?: number;
  readonly requirePrivateStreamForLive?: boolean;
  readonly requireSymbolRulesForLive?: boolean;
}

export class RiskPolicyRepository {
  public constructor(private readonly db: Database) {}

  public async getOrCreate(userId: string, accountId: string): Promise<RiskPolicy> {
    const result = await this.db.query(
      `INSERT INTO risk_policies (user_id, account_id) VALUES ($1,$2)
       ON CONFLICT (user_id, account_id) DO UPDATE SET updated_at = risk_policies.updated_at
       RETURNING *`,
      [userId, accountId]
    );
    return mapPolicy(result.rows[0]);
  }

  public async update(userId: string, accountId: string, patch: RiskPolicyPatch): Promise<RiskPolicy> {
    const existing = await this.getOrCreate(userId, accountId);
    const merged = RiskPolicySchema.parse({ ...existing, ...patch, updatedAt: new Date().toISOString() });
    const result = await this.db.query(
      `UPDATE risk_policies SET max_daily_drawdown_ratio=$3, daily_profit_cap_ratio=$4, risk_per_trade_fraction=$5, max_open_positions=$6,
        max_daily_trades=$7, max_symbol_exposure_ratio=$8, max_account_exposure_ratio=$9, max_spread_bps=$10, max_orderbook_age_ms=$11,
        require_private_stream_for_live=$12, require_symbol_rules_for_live=$13, updated_at=now()
       WHERE user_id=$1 AND account_id=$2 RETURNING *`,
      [userId, accountId, merged.maxDailyDrawdownRatio, merged.dailyProfitCapRatio, merged.riskPerTradeFraction, merged.maxOpenPositions, merged.maxDailyTrades, merged.maxSymbolExposureRatio, merged.maxAccountExposureRatio, merged.maxSpreadBps, merged.maxOrderbookAgeMs, merged.requirePrivateStreamForLive, merged.requireSymbolRulesForLive]
    );
    return mapPolicy(result.rows[0]);
  }
}

function mapPolicy(row: Record<string, unknown>): RiskPolicy {
  return RiskPolicySchema.parse({
    userId: String(row.user_id),
    accountId: String(row.account_id),
    maxDailyDrawdownRatio: Number(row.max_daily_drawdown_ratio),
    dailyProfitCapRatio: Number(row.daily_profit_cap_ratio),
    riskPerTradeFraction: Number(row.risk_per_trade_fraction),
    maxOpenPositions: Number(row.max_open_positions),
    maxDailyTrades: Number(row.max_daily_trades),
    maxSymbolExposureRatio: Number(row.max_symbol_exposure_ratio),
    maxAccountExposureRatio: Number(row.max_account_exposure_ratio),
    maxSpreadBps: Number(row.max_spread_bps),
    maxOrderbookAgeMs: Number(row.max_orderbook_age_ms),
    requirePrivateStreamForLive: row.require_private_stream_for_live === true,
    requireSymbolRulesForLive: row.require_symbol_rules_for_live === true,
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}
