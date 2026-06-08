import type { Exchange } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type ExecutionMode = "DISABLED" | "PAPER" | "LIVE" | "BYBIT_TESTNET" | "BINANCE_FUTURES_TESTNET";

export interface TradingAccountRecord {
  id: string;
  userId: string;
  exchangeApiKeyId: string;
  exchangeName: Exchange;
  accountLabel: string;
  isActive: boolean;
  executionEnabled: boolean;
  executionMode: ExecutionMode;
  createdAt: string;
  updatedAt: string;
}

export class TradingAccountRepository {
  public constructor(private readonly db: Database) {}

  public async ensureForExchangeKey(input: { readonly userId: string; readonly exchangeApiKeyId: string; readonly exchange: Exchange; readonly executionMode: ExecutionMode }): Promise<TradingAccountRecord> {
    const result = await this.db.query(
      `INSERT INTO user_exchange_accounts (user_id, exchange_api_key_id, exchange_name, execution_enabled, execution_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, exchange_name)
       DO UPDATE SET exchange_api_key_id = EXCLUDED.exchange_api_key_id,
         is_active = true,
         execution_enabled = EXCLUDED.execution_enabled,
         execution_mode = EXCLUDED.execution_mode,
         updated_at = now()
       RETURNING *`,
      [input.userId, input.exchangeApiKeyId, input.exchange, input.executionMode !== "DISABLED", input.executionMode]
    );
    return mapTradingAccount(result.rows[0]);
  }

  public async listActiveForUser(userId: string): Promise<TradingAccountRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM user_exchange_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapTradingAccount);
  }

  public async findActiveForUser(userId: string, exchange?: Exchange): Promise<TradingAccountRecord | null> {
    const result = await this.db.query(
      exchange
        ? `SELECT * FROM user_exchange_accounts WHERE user_id = $1 AND exchange_name = $2 AND is_active = true ORDER BY updated_at DESC LIMIT 1`
        : `SELECT * FROM user_exchange_accounts WHERE user_id = $1 AND is_active = true ORDER BY updated_at DESC LIMIT 1`,
      exchange ? [userId, exchange] : [userId]
    );
    const row = result.rows[0];
    return row ? mapTradingAccount(row) : null;
  }

  public async listEnabled(): Promise<TradingAccountRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM user_exchange_accounts WHERE is_active = true AND execution_enabled = true ORDER BY updated_at DESC`,
      []
    );
    return result.rows.map(mapTradingAccount);
  }

  public async setExecutionMode(userId: string, accountId: string, mode: ExecutionMode): Promise<TradingAccountRecord> {
    const result = await this.db.query(
      `UPDATE user_exchange_accounts SET execution_mode=$3, execution_enabled=$4, updated_at=now() WHERE user_id=$1 AND id=$2 AND is_active=true RETURNING *`,
      [userId, accountId, mode, mode !== "DISABLED"]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Trading account was not found for execution mode update");
    return mapTradingAccount(row);
  }

  public async withExecutionLock<T>(key: string, operation: () => Promise<T>): Promise<T | null> {
    return this.db.tryWithAdvisoryLock(`execution:${key}`, operation);
  }
}

function mapTradingAccount(row: Record<string, unknown> | undefined): TradingAccountRecord {
  if (!row) {
    throw new Error("Trading account row is missing");
  }
  return {
    id: String(row.id),
    userId: String(row.user_id),
    exchangeApiKeyId: String(row.exchange_api_key_id),
    exchangeName: row.exchange_name as Exchange,
    accountLabel: String(row.account_label),
    isActive: row.is_active === true,
    executionEnabled: row.execution_enabled === true,
    executionMode: row.execution_mode as ExecutionMode,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
