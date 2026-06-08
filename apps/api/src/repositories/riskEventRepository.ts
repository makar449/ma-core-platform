import type { Database } from "../infrastructure/db.js";

export type RiskEventSeverity = "info" | "warning" | "critical";

export interface RiskEventRecord {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string | null;
  readonly eventType: string;
  readonly severity: RiskEventSeverity;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export class RiskEventRepository {
  public constructor(private readonly db: Database) {}

  public async append(input: { readonly userId: string; readonly accountId: string | null; readonly eventType: string; readonly severity: RiskEventSeverity; readonly message: string; readonly metadata: Record<string, unknown> }): Promise<RiskEventRecord> {
    const latest = await this.db.query<{ hash_current: string | null }>("SELECT hash_current FROM risk_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [input.userId]);
    const prev = latest.rows[0]?.hash_current ?? null;
    const result = await this.db.query(
      `INSERT INTO risk_events (user_id, account_id, event_type, severity, message, metadata, hash_prev, hash_current)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7, encode(digest(coalesce($7,'') || $1::text || $3 || $5 || $6::text || now()::text, 'sha256'), 'hex')) RETURNING *`,
      [input.userId, input.accountId, input.eventType, input.severity, input.message, JSON.stringify(input.metadata), prev]
    );
    return mapRiskEvent(result.rows[0]);
  }

  public async listForUser(userId: string, limit: number): Promise<RiskEventRecord[]> {
    const result = await this.db.query("SELECT * FROM risk_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2", [userId, Math.min(Math.max(limit, 1), 300)]);
    return result.rows.map(mapRiskEvent);
  }
}

function mapRiskEvent(row: Record<string, unknown>): RiskEventRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    eventType: String(row.event_type),
    severity: row.severity as RiskEventSeverity,
    message: String(row.message),
    metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}
