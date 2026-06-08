import type { AdapterStatus } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export class AdapterStatusRepository {
  public constructor(private readonly db: Database) {}

  public async insertMany(statuses: readonly AdapterStatus[]): Promise<void> {
    for (const status of statuses) {
      await this.db.query(
        `INSERT INTO exchange_adapter_snapshots (
          exchange, pair, connected, reconnecting, stale, last_message_at, last_rest_backfill_at,
          missing_fields, error_reason, reconnect_attempts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)`,
        [
          status.exchange,
          status.pair,
          status.connected,
          status.reconnecting,
          status.stale,
          status.lastMessageAt,
          status.lastRestBackfillAt,
          status.missingFields,
          status.errorReason,
          status.reconnectAttempts
        ]
      );
    }
  }
}
