import type { Database } from "../infrastructure/db.js";

export type ExchangeAuditStatus = "OK" | "ERROR" | "TIMEOUT" | "RETRY";

export interface ExchangeRequestAuditRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly accountId: string | null;
  readonly exchange: string;
  readonly endpoint: string;
  readonly method: string;
  readonly requestMetadata: Record<string, unknown>;
  readonly responseMetadata: Record<string, unknown>;
  readonly status: ExchangeAuditStatus;
  readonly exchangeErrorCode: string | null;
  readonly latencyMs: number;
  readonly correlationId: string;
  readonly createdAt: string;
}

export interface ExchangeRequestAuditInput {
  readonly userId?: string | null;
  readonly accountId?: string | null;
  readonly exchange: string;
  readonly endpoint: string;
  readonly method: string;
  readonly requestMetadata?: Record<string, unknown>;
  readonly responseMetadata?: Record<string, unknown>;
  readonly status: ExchangeAuditStatus;
  readonly exchangeErrorCode?: string | null;
  readonly latencyMs: number;
  readonly correlationId: string;
}

export class ExchangeAuditRepository {
  public constructor(private readonly db: Database) {}

  public async append(input: ExchangeRequestAuditInput): Promise<void> {
    await this.db.query(
      `INSERT INTO exchange_request_audit (user_id, account_id, exchange, endpoint, method, request_metadata, response_metadata, status, exchange_error_code, latency_ms, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
      [input.userId ?? null, input.accountId ?? null, input.exchange, input.endpoint, input.method, JSON.stringify(input.requestMetadata ?? {}), JSON.stringify(input.responseMetadata ?? {}), input.status, input.exchangeErrorCode ?? null, input.latencyMs, input.correlationId]
    );
  }

  public async listForUser(userId: string, limit: number): Promise<ExchangeRequestAuditRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM exchange_request_audit
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 300)]
    );
    return result.rows.map(mapExchangeAudit);
  }
}

function mapExchangeAudit(row: Record<string, unknown>): ExchangeRequestAuditRecord {
  return {
    id: String(row.id),
    userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    exchange: String(row.exchange),
    endpoint: String(row.endpoint),
    method: String(row.method),
    requestMetadata: recordFromJson(row.request_metadata),
    responseMetadata: recordFromJson(row.response_metadata),
    status: row.status as ExchangeAuditStatus,
    exchangeErrorCode: row.exchange_error_code === null || row.exchange_error_code === undefined ? null : String(row.exchange_error_code),
    latencyMs: Number(row.latency_ms),
    correlationId: String(row.correlation_id),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function recordFromJson(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
