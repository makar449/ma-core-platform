import type { Database } from "../infrastructure/db.js";

export type IncidentSeverity = "info" | "warning" | "critical";

export interface IncidentRecord {
  readonly id: string;
  readonly incidentType: string;
  readonly severity: IncidentSeverity;
  readonly userId: string | null;
  readonly accountId: string | null;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
  readonly resolved: boolean;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export class IncidentRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: { readonly incidentType: string; readonly severity: IncidentSeverity; readonly userId?: string; readonly accountId?: string; readonly message: string; readonly metadata: Record<string, unknown> }): Promise<void> {
    await this.db.query(
      `INSERT INTO ops_incident_events (incident_type, severity, user_id, account_id, message, metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [input.incidentType, input.severity, input.userId ?? null, input.accountId ?? null, input.message, JSON.stringify(input.metadata)]
    );
  }

  public async listForUser(userId: string, limit: number, severity?: IncidentSeverity): Promise<IncidentRecord[]> {
    const result = await this.db.query(
      severity
        ? `SELECT * FROM ops_incident_events WHERE user_id=$1 AND severity=$3 ORDER BY created_at DESC LIMIT $2`
        : `SELECT * FROM ops_incident_events WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT $2`,
      severity ? [userId, Math.min(Math.max(limit, 1), 300), severity] : [userId, Math.min(Math.max(limit, 1), 300)]
    );
    return result.rows.map(mapIncident);
  }

  public async resolve(userId: string, incidentId: string, message: string): Promise<IncidentRecord | null> {
    const result = await this.db.query(
      `UPDATE ops_incident_events SET resolved=true, resolved_at=now(), metadata=metadata || jsonb_build_object('resolutionMessage', $3::text)
       WHERE id=$1 AND (user_id=$2 OR user_id IS NULL) RETURNING *`,
      [incidentId, userId, message]
    );
    return result.rows[0] ? mapIncident(result.rows[0]) : null;
  }
}

function mapIncident(row: Record<string, unknown>): IncidentRecord {
  return {
    id: String(row.id),
    incidentType: String(row.incident_type),
    severity: row.severity as IncidentSeverity,
    userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    message: String(row.message),
    metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    resolved: row.resolved === true,
    createdAt: new Date(String(row.created_at)).toISOString(),
    resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : new Date(String(row.resolved_at)).toISOString()
  };
}
