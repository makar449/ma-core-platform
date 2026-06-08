import type { Database } from "../infrastructure/db.js";

export interface RealizedPnlSnapshot {
  readonly internalRealizedPnl: number;
  readonly closedTrades: number;
}

export class PnlRepository {
  public constructor(private readonly db: Database) {}

  public async realizedForUtcDay(accountId: string, at: Date = new Date()): Promise<RealizedPnlSnapshot> {
    const day = at.toISOString().slice(0, 10);
    const result = await this.db.query<{ pnl: string | number | null; trades: string | number }>(
      `SELECT COALESCE(SUM(realized_pnl), 0) AS pnl, COUNT(*) AS trades
       FROM active_positions
       WHERE account_id = $1 AND closed_at >= ($2::date AT TIME ZONE 'UTC') AND closed_at < (($2::date + INTERVAL '1 day') AT TIME ZONE 'UTC')
         AND status IN ('CLOSED_BY_TP','CLOSED_BY_SL','CLOSED_BY_TIMEOUT','CLOSED_BY_RISK_HALT','CLOSED_MANUALLY','CLOSE_CONFIRMED')`,
      [accountId, day]
    );
    const row = result.rows[0];
    return { internalRealizedPnl: Number(row?.pnl ?? 0), closedTrades: Number(row?.trades ?? 0) };
  }

  public async recordReconciliation(input: { readonly userId: string; readonly accountId: string; readonly internalRealizedPnl: number; readonly exchangeRealizedPnl: number | null; readonly status: "MATCHED" | "MISMATCH" | "EXCHANGE_UNAVAILABLE" | "INTERNAL_ONLY"; readonly metadata: Record<string, unknown> }): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const difference = input.exchangeRealizedPnl === null ? null : input.exchangeRealizedPnl - input.internalRealizedPnl;
    await this.db.query(
      `INSERT INTO pnl_reconciliation_runs (user_id, account_id, trading_date, internal_realized_pnl, exchange_realized_pnl, difference, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [input.userId, input.accountId, day, input.internalRealizedPnl, input.exchangeRealizedPnl, difference, input.status, JSON.stringify(input.metadata)]
    );
  }
}
