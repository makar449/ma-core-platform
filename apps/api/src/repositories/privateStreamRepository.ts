import { createHash } from "node:crypto";
import type { Exchange, PrivateStreamStatus } from "@ma-core/shared";
import { PrivateStreamStatusSchema } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type PrivateStreamType = "ORDER" | "EXECUTION" | "POSITION" | "COMBINED";
export type PrivateStreamHealth = PrivateStreamStatus["status"];

export interface PrivateStreamStatusInput {
  readonly userId: string;
  readonly accountId: string;
  readonly exchange: Exchange;
  readonly apiKeyFingerprint: string;
  readonly streamType: PrivateStreamType;
  readonly status: PrivateStreamHealth;
  readonly lastMessageAt?: string | null;
  readonly lastHeartbeatAt?: string | null;
  readonly reconnectAttempts?: number;
  readonly errorReason?: string | null;
  readonly rawPayload?: Record<string, unknown>;
}

export class PrivateStreamRepository {
  public constructor(private readonly db: Database) {}

  public async upsert(input: PrivateStreamStatusInput): Promise<PrivateStreamStatus> {
    const result = await this.db.query(
      `INSERT INTO private_stream_statuses (user_id, account_id, exchange, api_key_fingerprint, stream_type, status, last_message_at, last_heartbeat_at, reconnect_attempts, error_reason, raw_payload, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())
       ON CONFLICT (account_id, stream_type) DO UPDATE SET status=EXCLUDED.status, api_key_fingerprint=EXCLUDED.api_key_fingerprint, last_message_at=EXCLUDED.last_message_at, last_heartbeat_at=EXCLUDED.last_heartbeat_at, reconnect_attempts=EXCLUDED.reconnect_attempts, error_reason=EXCLUDED.error_reason, raw_payload=EXCLUDED.raw_payload, updated_at=now()
       RETURNING *`,
      [input.userId, input.accountId, input.exchange, input.apiKeyFingerprint, input.streamType, input.status, input.lastMessageAt ?? null, input.lastHeartbeatAt ?? null, input.reconnectAttempts ?? 0, input.errorReason ?? null, JSON.stringify(input.rawPayload ?? {})]
    );
    return mapStatus(result.rows[0]);
  }

  public async markStale(staleAfterMs: number): Promise<number> {
    const result = await this.db.query(
      `UPDATE private_stream_statuses
       SET status='STALE', error_reason='Private stream heartbeat/message deadline exceeded', updated_at=now()
       WHERE status IN ('HEALTHY','CONNECTING')
         AND COALESCE(last_message_at, last_heartbeat_at, updated_at) < now() - ($1::text || ' milliseconds')::interval`,
      [String(staleAfterMs)]
    );
    return result.rowCount;
  }

  public async getHealth(exchange: Exchange, apiKeyFingerprint: string, staleAfterMs: number): Promise<PrivateStreamStatus | null> {
    const result = await this.db.query(
      `SELECT * FROM private_stream_statuses
       WHERE exchange=$1 AND api_key_fingerprint=$2 AND stream_type='COMBINED'
       ORDER BY updated_at DESC LIMIT 1`,
      [exchange, apiKeyFingerprint]
    );
    const row = result.rows[0];
    if (!row) return null;
    const status = mapStatus(row);
    const latest = status.lastMessageAt ?? status.lastHeartbeatAt ?? status.updatedAt;
    if (Date.now() - Date.parse(latest) > staleAfterMs) {
      return { ...status, status: "STALE", errorReason: "Private stream status is stale." };
    }
    return status;
  }

  public async listForUser(userId: string): Promise<PrivateStreamStatus[]> {
    const result = await this.db.query("SELECT * FROM private_stream_statuses WHERE user_id=$1 ORDER BY updated_at DESC", [userId]);
    return result.rows.map(mapStatus);
  }

  public async listUnhealthy(limit: number): Promise<PrivateStreamStatus[]> {
    const result = await this.db.query("SELECT * FROM private_stream_statuses WHERE status IN ('STALE','RECONNECTING','DISCONNECTED','FAILED') ORDER BY updated_at DESC LIMIT $1", [Math.min(Math.max(limit, 1), 500)]);
    return result.rows.map(mapStatus);
  }
}

export function fingerprintApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function mapStatus(row: Record<string, unknown>): PrivateStreamStatus {
  return PrivateStreamStatusSchema.parse({
    userId: String(row.user_id),
    accountId: String(row.account_id),
    exchange: row.exchange,
    streamType: row.stream_type,
    status: row.status,
    lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)).toISOString() : null,
    lastHeartbeatAt: row.last_heartbeat_at ? new Date(String(row.last_heartbeat_at)).toISOString() : null,
    reconnectAttempts: Number(row.reconnect_attempts ?? 0),
    errorReason: row.error_reason === null || row.error_reason === undefined ? null : String(row.error_reason),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}
