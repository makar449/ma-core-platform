import { PositionSchema, type Position, type PositionStatus, type TradeDirection } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface OpenPositionInput {
  readonly accountId: string;
  readonly userId: string;
  readonly exchangePositionId: string;
  readonly pair: string;
  readonly direction: TradeDirection;
  readonly leverage: number;
  readonly volume: number;
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly takeProfitPrice: number;
}

export interface TimeoutCandidate {
  readonly position: Position;
  readonly warningSent: boolean;
  readonly forceCloseRequested: boolean;
}

export class PositionRepository {
  public constructor(private readonly db: Database) {}

  public async open(input: OpenPositionInput): Promise<Position> {
    const result = await this.db.query(
      `INSERT INTO active_positions (account_id, user_id, exchange_position_id, pair, direction, leverage, volume, entry_price, stop_loss_price, take_profit_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPENED')
       ON CONFLICT (account_id, exchange_position_id)
       DO UPDATE SET status = 'OPENED', volume = EXCLUDED.volume, entry_price = EXCLUDED.entry_price, stop_loss_price = EXCLUDED.stop_loss_price,
         take_profit_price = EXCLUDED.take_profit_price, updated_at = now()
       RETURNING active_positions.*, (SELECT exchange_name FROM user_exchange_accounts WHERE id = active_positions.account_id) AS exchange_name`,
      [input.accountId, input.userId, input.exchangePositionId, input.pair, input.direction, input.leverage, input.volume, input.entryPrice, input.stopLossPrice, input.takeProfitPrice]
    );
    const position = mapPosition(result.rows[0]);
    await this.appendEvent(position, "POSITION_OPENED", "PASSED", `Position ${position.pair} opened at ${position.entryPrice}.`, { volume: position.volume, leverage: position.leverage });
    return position;
  }

  public async listOpenForUser(userId: string, limit: number): Promise<Position[]> {
    const result = await this.db.query(
      `SELECT p.*, a.exchange_name AS exchange_name FROM active_positions p JOIN user_exchange_accounts a ON a.id = p.account_id
       WHERE p.user_id = $1 AND p.status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_SUBMITTED','CLOSE_FAILED_RETRYING') ORDER BY p.opened_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map(mapPosition);
  }

  public async listOpenByAccount(accountId: string, limit = 200): Promise<Position[]> {
    const result = await this.db.query(
      `SELECT p.*, a.exchange_name AS exchange_name FROM active_positions p JOIN user_exchange_accounts a ON a.id = p.account_id
       WHERE p.account_id = $1 AND p.status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_SUBMITTED','CLOSE_FAILED_RETRYING') ORDER BY p.opened_at ASC LIMIT $2`,
      [accountId, Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map(mapPosition);
  }

  public async countOpenByAccount(accountId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM active_positions WHERE account_id=$1 AND status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_SUBMITTED','CLOSE_FAILED_RETRYING')`,
      [accountId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async hasOpenSymbol(accountId: string, pair: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM active_positions WHERE account_id=$1 AND pair=$2 AND status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_SUBMITTED','CLOSE_FAILED_RETRYING') LIMIT 1`,
      [accountId, pair]
    );
    return result.rowCount > 0;
  }

  public async listTimeoutCandidates(minutes: number): Promise<TimeoutCandidate[]> {
    const result = await this.db.query(
      `SELECT p.*, a.exchange_name AS exchange_name,
         EXISTS (SELECT 1 FROM position_timeout_events e WHERE e.position_id = p.id AND e.event_type = 'POSITION_TIMEOUT_WARNING') AS warning_sent,
         EXISTS (SELECT 1 FROM position_timeout_events e WHERE e.position_id = p.id AND e.event_type = 'FORCE_CLOSE_TIMEOUT') AS force_requested
       FROM active_positions p JOIN user_exchange_accounts a ON a.id = p.account_id
       WHERE p.status IN ('OPENED','CLOSE_FAILED_RETRYING') AND p.opened_at <= now() - ($1::TEXT || ' minutes')::interval
       ORDER BY p.opened_at ASC LIMIT 500`,
      [String(minutes)]
    );
    return result.rows.map((row) => ({ position: mapPosition(row), warningSent: row.warning_sent === true, forceCloseRequested: row.force_requested === true }));
  }

  public async recordTimeoutEvent(positionId: string, eventType: "POSITION_TIMEOUT_WARNING" | "FORCE_CLOSE_TIMEOUT", elapsedMinutes: number): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO position_timeout_events (position_id, event_type, elapsed_minutes) VALUES ($1,$2,$3)
       ON CONFLICT (position_id, event_type) DO NOTHING RETURNING id`,
      [positionId, eventType, elapsedMinutes]
    );
    if (eventType === "POSITION_TIMEOUT_WARNING" && result.rowCount > 0) {
      await this.db.query("UPDATE active_positions SET warning_sent_at = now(), updated_at = now() WHERE id = $1", [positionId]);
    }
    if (eventType === "FORCE_CLOSE_TIMEOUT" && result.rowCount > 0) {
      await this.db.query("UPDATE active_positions SET force_close_requested_at = now(), status = 'FORCE_CLOSE_REQUESTED', updated_at = now() WHERE id = $1 AND status IN ('OPENED','CLOSE_FAILED_RETRYING')", [positionId]);
    }
    return result.rowCount > 0;
  }

  public async requestClose(positionId: string, status: Extract<PositionStatus, "FORCE_CLOSE_REQUESTED" | "CLOSE_SUBMITTED">, message: string): Promise<Position | null> {
    const result = await this.db.query(
      `UPDATE active_positions SET status=$2, close_requested_at=COALESCE(close_requested_at, now()), close_attempts=close_attempts+1, updated_at=now()
       WHERE id=$1 AND status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_FAILED_RETRYING')
       RETURNING active_positions.*, (SELECT exchange_name FROM user_exchange_accounts WHERE id = active_positions.account_id) AS exchange_name`,
      [positionId, status]
    );
    const row = result.rows[0];
    if (!row) return null;
    const position = mapPosition(row);
    await this.appendEvent(position, status, "RUNNING", message, { attempts: row.close_attempts });
    return position;
  }

  public async close(positionId: string, status: Extract<PositionStatus, "CLOSED_BY_TP" | "CLOSED_BY_SL" | "CLOSED_BY_TIMEOUT" | "CLOSED_BY_RISK_HALT" | "CLOSED_MANUALLY" | "CLOSE_CONFIRMED">, realizedPnl: number | null): Promise<Position | null> {
    const result = await this.db.query(
      `UPDATE active_positions SET status = $2, realized_pnl = $3, closed_at = COALESCE(closed_at, now()), close_confirmed_at = now(), force_close_confirmed_at = CASE WHEN $2 = 'CLOSED_BY_TIMEOUT' THEN now() ELSE force_close_confirmed_at END, updated_at = now()
       WHERE id = $1 AND status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_SUBMITTED','CLOSE_FAILED_RETRYING')
       RETURNING active_positions.*, (SELECT exchange_name FROM user_exchange_accounts WHERE id = active_positions.account_id) AS exchange_name`,
      [positionId, status, realizedPnl]
    );
    const row = result.rows[0];
    if (!row) return null;
    const position = mapPosition(row);
    await this.appendEvent(position, status, "PASSED", `Position ${position.pair} closed with status ${status}.`, { realizedPnl });
    return position;
  }

  public async markCloseFailed(positionId: string, message: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE active_positions SET status='CLOSE_FAILED_RETRYING', updated_at=now() WHERE id=$1
       RETURNING active_positions.*, (SELECT exchange_name FROM user_exchange_accounts WHERE id = active_positions.account_id) AS exchange_name`,
      [positionId]
    );
    const row = result.rows[0];
    if (row) {
      await this.appendEvent(mapPosition(row), "CLOSE_FAILED_RETRYING", "FAILED", message, {});
    }
  }

  public async appendEvent(position: Position, eventType: string, eventStatus: string, message: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO position_events (position_id, user_id, account_id, event_type, event_status, message, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [position.id, position.userId, position.accountId, eventType, eventStatus, message, JSON.stringify(metadata)]
    );
  }
}

function mapPosition(row: Record<string, unknown> | undefined): Position {
  if (!row) {
    throw new Error("Position row is missing");
  }
  return PositionSchema.parse({
    id: String(row.id),
    accountId: String(row.account_id),
    userId: String(row.user_id),
    exchange: row.exchange_name,
    exchangePositionId: String(row.exchange_position_id),
    pair: String(row.pair),
    direction: row.direction,
    leverage: Number(row.leverage),
    volume: Number(row.volume),
    entryPrice: Number(row.entry_price),
    stopLossPrice: Number(row.stop_loss_price),
    takeProfitPrice: Number(row.take_profit_price),
    status: row.status,
    openedAt: new Date(String(row.opened_at)).toISOString(),
    closedAt: row.closed_at === null || row.closed_at === undefined ? null : new Date(String(row.closed_at)).toISOString(),
    realizedPnL: row.realized_pnl === null || row.realized_pnl === undefined ? null : Number(row.realized_pnl),
    closeRequestedAt: row.close_requested_at === null || row.close_requested_at === undefined ? null : new Date(String(row.close_requested_at)).toISOString(),
    closeConfirmedAt: row.close_confirmed_at === null || row.close_confirmed_at === undefined ? null : new Date(String(row.close_confirmed_at)).toISOString(),
    warningSentAt: row.warning_sent_at === null || row.warning_sent_at === undefined ? null : new Date(String(row.warning_sent_at)).toISOString(),
    forceCloseRequestedAt: row.force_close_requested_at === null || row.force_close_requested_at === undefined ? null : new Date(String(row.force_close_requested_at)).toISOString(),
    forceCloseConfirmedAt: row.force_close_confirmed_at === null || row.force_close_confirmed_at === undefined ? null : new Date(String(row.force_close_confirmed_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}
