import { DailyRiskStateSchema, type DailyRiskState, type SystemHealth } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface EquitySnapshotInput {
  readonly accountId: string;
  readonly userId: string;
  readonly currentEquity: number;
  readonly realizedPnlToday: number;
  readonly unrealizedPnlToday: number;
}

export class DailyRiskRepository {
  public constructor(private readonly db: Database) {}

  public async upsertEquitySnapshot(input: EquitySnapshotInput): Promise<DailyRiskState> {
    const result = await this.db.query(
      `INSERT INTO daily_trading_stats (account_id, trading_date, equity_at_start, highest_equity, lowest_equity, current_equity, current_realized_pnl, current_unrealized_pnl, equity_start_source, equity_start_captured_at)
       VALUES ($1, (timezone('UTC', now()))::date, GREATEST($2, 1), GREATEST($2, 1), GREATEST($2, 1), GREATEST($2, 0), $3, $4, 'FIRST_SNAPSHOT', now())
       ON CONFLICT (account_id, trading_date)
       DO UPDATE SET current_equity = EXCLUDED.current_equity,
         highest_equity = GREATEST(daily_trading_stats.highest_equity, EXCLUDED.current_equity),
         lowest_equity = LEAST(daily_trading_stats.lowest_equity, EXCLUDED.current_equity),
         current_realized_pnl = EXCLUDED.current_realized_pnl,
         current_unrealized_pnl = EXCLUDED.current_unrealized_pnl,
         updated_at = now()
       RETURNING daily_trading_stats.*`,
      [input.accountId, input.currentEquity, input.realizedPnlToday, input.unrealizedPnlToday]
    );
    return this.mapDailyRiskState(result.rows[0], input.userId);
  }

  public async markRiskLocked(accountId: string, userId: string, lockUntil: string): Promise<DailyRiskState> {
    const result = await this.db.query(
      `UPDATE daily_trading_stats SET is_locked_by_risk = true, risk_lock_until = $2, lock_until = $2, system_health = 'EMERGENCY_HALT', updated_at = now()
       WHERE account_id = $1 AND trading_date = (timezone('UTC', now()))::date RETURNING *`,
      [accountId, lockUntil]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Daily risk state is missing for risk lock");
    }
    return this.mapDailyRiskState(row, userId);
  }

  public async markProfitLocked(accountId: string, userId: string, lockUntil: string): Promise<DailyRiskState> {
    const result = await this.db.query(
      `UPDATE daily_trading_stats SET is_locked_by_profit = true, profit_lock_until = $2, lock_until = COALESCE(risk_lock_until, $2),
         system_health = CASE WHEN is_locked_by_risk THEN 'EMERGENCY_HALT' ELSE 'PROFIT_CAP_LOCK' END, updated_at = now()
       WHERE account_id = $1 AND trading_date = (timezone('UTC', now()))::date RETURNING *`,
      [accountId, lockUntil]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Daily risk state is missing for profit lock");
    }
    return this.mapDailyRiskState(row, userId);
  }

  public async listForUser(userId: string): Promise<DailyRiskState[]> {
    const result = await this.db.query(
      `SELECT s.*, a.user_id FROM daily_trading_stats s JOIN user_exchange_accounts a ON a.id = s.account_id
       WHERE a.user_id = $1 ORDER BY s.trading_date DESC LIMIT 30`,
      [userId]
    );
    return result.rows.map((row) => this.mapDailyRiskState(row, userId));
  }

  private mapDailyRiskState(row: Record<string, unknown> | undefined, userId: string): DailyRiskState {
    if (!row) {
      throw new Error("Daily risk row is missing");
    }
    const equityAtStart = Math.max(1, Number(row.equity_at_start));
    const currentEquity = Math.max(0, Number(row.current_equity ?? equityAtStart));
    const realized = Number(row.current_realized_pnl);
    const unrealized = Number(row.current_unrealized_pnl);
    const drawdownRatio = Math.max(0, (equityAtStart - currentEquity) / equityAtStart);
    const profitRatio = realized / equityAtStart;
    const riskLocked = row.is_locked_by_risk === true;
    const profitLocked = row.is_locked_by_profit === true;
    const systemHealth: SystemHealth = riskLocked ? "EMERGENCY_HALT" : profitLocked ? "PROFIT_CAP_LOCK" : String(row.system_health ?? "NORMAL") as SystemHealth;
    const riskLockUntil = row.risk_lock_until === null || row.risk_lock_until === undefined ? null : new Date(String(row.risk_lock_until)).toISOString();
    const profitLockUntil = row.profit_lock_until === null || row.profit_lock_until === undefined ? null : new Date(String(row.profit_lock_until)).toISOString();
    return DailyRiskStateSchema.parse({
      userId,
      accountId: String(row.account_id),
      equityAtStartOfDay: equityAtStart,
      currentEquity,
      realizedPnLToday: realized,
      unrealizedPnLToday: unrealized,
      drawdownRatio,
      profitRatio,
      riskLockActive: riskLocked,
      profitLockActive: profitLocked,
      riskLockUntil,
      profitLockUntil,
      systemHealth,
      isLocked: riskLocked || profitLocked,
      lockReason: riskLocked ? "EMERGENCY_HALT" : profitLocked ? "PROFIT_CAP_REACHED" : "NONE",
      lockUntil: riskLocked ? riskLockUntil : profitLocked ? profitLockUntil : null,
      updatedAt: new Date(String(row.updated_at)).toISOString()
    });
  }
}
