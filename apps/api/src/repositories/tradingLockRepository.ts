import type { RiskLockReason } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type TradingLockType = "GLOBAL_TRADING_LOCK" | "NEW_DEALS_LOCK";

export interface TradingLockRecord {
  id: string;
  userId: string;
  accountId: string | null;
  lockType: TradingLockType;
  reason: RiskLockReason;
  active: boolean;
  lockUntil: string;
  createdAt: string;
}

export class TradingLockRepository {
  public constructor(private readonly db: Database) {}

  public async activate(input: { readonly userId: string; readonly accountId: string | null; readonly lockType: TradingLockType; readonly reason: Exclude<RiskLockReason, "NONE">; readonly lockUntil: string; readonly metadata: Record<string, unknown> }): Promise<TradingLockRecord> {
    await this.releaseExpired(input.userId);
    const existing = await this.db.query(
      `UPDATE trading_locks SET reason = $4, lock_until = $5, metadata = $6::jsonb, released_at = NULL
       WHERE user_id = $1 AND active = true AND lock_type = $3 AND ((account_id = $2) OR (account_id IS NULL AND $2 IS NULL))
       RETURNING *`,
      [input.userId, input.accountId, input.lockType, input.reason, input.lockUntil, JSON.stringify(input.metadata)]
    );
    const existingRow = existing.rows[0];
    if (existingRow) {
      return mapTradingLock(existingRow);
    }
    const result = await this.db.query(
      `INSERT INTO trading_locks (user_id, account_id, lock_type, reason, active, lock_until, metadata)
       VALUES ($1,$2,$3,$4,true,$5,$6::jsonb)
       RETURNING *`,
      [input.userId, input.accountId, input.lockType, input.reason, input.lockUntil, JSON.stringify(input.metadata)]
    );
    return mapTradingLock(result.rows[0]);
  }

  public async hasActiveLock(userId: string, accountId: string | null, type: TradingLockType): Promise<boolean> {
    await this.releaseExpired(userId);
    const result = await this.db.query(
      `SELECT 1 FROM trading_locks WHERE user_id = $1 AND active = true AND lock_type = $2 AND lock_until > now() AND (account_id = $3 OR account_id IS NULL) LIMIT 1`,
      [userId, type, accountId]
    );
    return result.rowCount > 0;
  }

  public async releaseExpired(userId?: string): Promise<void> {
    await this.db.query(
      userId
        ? `UPDATE trading_locks SET active = false, released_at = now() WHERE user_id = $1 AND active = true AND lock_until <= now()`
        : `UPDATE trading_locks SET active = false, released_at = now() WHERE active = true AND lock_until <= now()`,
      userId ? [userId] : []
    );
  }

  public async listActiveForUser(userId: string): Promise<TradingLockRecord[]> {
    await this.releaseExpired(userId);
    const result = await this.db.query(
      `SELECT * FROM trading_locks WHERE user_id = $1 AND active = true AND lock_until > now() ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapTradingLock);
  }

  public async releaseById(userId: string, lockId: string, reason: string): Promise<TradingLockRecord | null> {
    const result = await this.db.query(
      `UPDATE trading_locks SET active=false, released_at=now(), metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{releaseReason}', to_jsonb($3::text), true)
       WHERE user_id=$1 AND id=$2 AND active=true
       RETURNING *`,
      [userId, lockId, reason]
    );
    const row = result.rows[0];
    return row ? mapTradingLock(row) : null;
  }
}

function mapTradingLock(row: Record<string, unknown> | undefined): TradingLockRecord {
  if (!row) {
    throw new Error("Trading lock row is missing");
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    lockType: row.lock_type as TradingLockType,
    reason: row.reason as RiskLockReason,
    active: row.active === true,
    lockUntil: new Date(String(row.lock_until)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}
