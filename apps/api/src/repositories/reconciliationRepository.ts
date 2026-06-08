import type { Exchange, ReconciliationMismatch, ReconciliationRun } from "@ma-core/shared";
import { ReconciliationMismatchSchema, ReconciliationRunSchema } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type ReconciliationRunStatus = "MATCHED" | "MISMATCH" | "EXCHANGE_UNAVAILABLE" | "SKIPPED_NO_CREDENTIALS";
export type ReconciliationMismatchType = "EXCHANGE_RECONCILIATION_MISMATCH" | "PROTECTION_ORDER_MISSING" | "POSITION_SIZE_MISMATCH" | "POSITION_NOT_FOUND_ON_EXCHANGE" | "UNKNOWN_EXCHANGE_POSITION" | "ORDER_NOT_FOUND_ON_EXCHANGE" | "UNKNOWN_EXCHANGE_ORDER" | "REALIZED_PNL_MISMATCH";

export interface ReconciliationRunInput {
  readonly userId: string;
  readonly accountId: string;
  readonly exchange: Exchange;
  readonly status: ReconciliationRunStatus;
  readonly internalOpenPositions: number;
  readonly exchangeOpenPositions: number;
  readonly internalOpenOrders: number;
  readonly exchangeOpenOrders: number;
  readonly realizedPnlInternal: number;
  readonly realizedPnlExchange?: number | null;
  readonly metadata?: Record<string, unknown>;
  readonly startedAt: string;
}

export interface ReconciliationMismatchInput {
  readonly runId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly mismatchType: ReconciliationMismatchType;
  readonly severity: "info" | "warning" | "critical";
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export class ReconciliationRepository {
  public constructor(private readonly db: Database) {}

  public async createRun(input: ReconciliationRunInput): Promise<ReconciliationRun> {
    const result = await this.db.query(
      `INSERT INTO exchange_reconciliation_runs (user_id, account_id, exchange, status, internal_open_positions, exchange_open_positions, internal_open_orders, exchange_open_orders, realized_pnl_internal, realized_pnl_exchange, metadata, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,now()) RETURNING *`,
      [input.userId, input.accountId, input.exchange, input.status, input.internalOpenPositions, input.exchangeOpenPositions, input.internalOpenOrders, input.exchangeOpenOrders, input.realizedPnlInternal, input.realizedPnlExchange ?? null, JSON.stringify(input.metadata ?? {}), input.startedAt]
    );
    return mapRun(result.rows[0]);
  }

  public async createMismatch(input: ReconciliationMismatchInput): Promise<ReconciliationMismatch> {
    const result = await this.db.query(
      `INSERT INTO exchange_reconciliation_mismatches (run_id, user_id, account_id, mismatch_type, severity, message, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [input.runId, input.userId, input.accountId, input.mismatchType, input.severity, input.message, JSON.stringify(input.metadata ?? {})]
    );
    return mapMismatch(result.rows[0]);
  }

  public async listRunsForUser(userId: string, limit: number): Promise<ReconciliationRun[]> {
    const result = await this.db.query("SELECT * FROM exchange_reconciliation_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT $2", [userId, Math.min(Math.max(limit, 1), 200)]);
    return result.rows.map(mapRun);
  }

  public async listMismatchesForUser(userId: string, limit: number): Promise<ReconciliationMismatch[]> {
    const result = await this.db.query("SELECT * FROM exchange_reconciliation_mismatches WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2", [userId, Math.min(Math.max(limit, 1), 200)]);
    return result.rows.map(mapMismatch);
  }

  public async listUnresolvedCritical(limit: number): Promise<ReconciliationMismatch[]> {
    const result = await this.db.query("SELECT * FROM exchange_reconciliation_mismatches WHERE resolved_at IS NULL AND severity='critical' ORDER BY created_at DESC LIMIT $1", [Math.min(Math.max(limit, 1), 500)]);
    return result.rows.map(mapMismatch);
  }
}

function mapRun(row: Record<string, unknown>): ReconciliationRun {
  return ReconciliationRunSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: String(row.account_id),
    exchange: row.exchange,
    status: row.status,
    internalOpenPositions: Number(row.internal_open_positions ?? 0),
    exchangeOpenPositions: Number(row.exchange_open_positions ?? 0),
    internalOpenOrders: Number(row.internal_open_orders ?? 0),
    exchangeOpenOrders: Number(row.exchange_open_orders ?? 0),
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt: new Date(String(row.finished_at)).toISOString()
  });
}

function mapMismatch(row: Record<string, unknown>): ReconciliationMismatch {
  return ReconciliationMismatchSchema.parse({
    id: String(row.id),
    runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
    userId: String(row.user_id),
    accountId: String(row.account_id),
    mismatchType: row.mismatch_type,
    severity: row.severity,
    message: String(row.message),
    metadata: recordFromJson(row.metadata),
    resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : new Date(String(row.resolved_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString()
  });
}


function recordFromJson(value: unknown): Record<string, string | number | boolean | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) output[key] = entry;
  }
  return output;
}
