import { ExecutionDecisionSchema, ExecutionStepSchema, type ExecutionDecision, type ExecutionStep } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export class ExecutionRepository {
  public constructor(private readonly db: Database) {}

  public async insert(decision: ExecutionDecision, accountId: string | null): Promise<void> {
    const parsed = ExecutionDecisionSchema.parse(decision);
    await this.db.query(
      `INSERT INTO execution_decisions (id, transaction_id, user_id, account_id, exchange, signal_payload, calculated_order, status,
        available_balance_usdt, equity_usdt, risk_amount_usdt, market_price, exchange_order_id, exchange_position_id, rejection_reason, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.transactionId,
        parsed.userId,
        accountId,
        parsed.exchange,
        JSON.stringify(parsed.signal),
        parsed.order ? JSON.stringify(parsed.order) : null,
        parsed.status,
        parsed.availableBalanceUsdt ?? null,
        parsed.equityUsdt ?? null,
        parsed.riskAmountUsdt ?? null,
        parsed.marketPrice ?? null,
        parsed.exchangeOrderId ?? null,
        parsed.exchangePositionId ?? null,
        parsed.rejectionReason ?? null,
        parsed.latencyMs,
        parsed.createdAt
      ]
    );
    await this.insertSteps(parsed.id, parsed.userId, accountId, parsed.stateMachine);
  }

  public async insertSteps(executionId: string, userId: string, accountId: string | null, steps: readonly ExecutionStep[]): Promise<void> {
    for (const step of steps) {
      const parsed = ExecutionStepSchema.parse(step);
      await this.db.query(
        `INSERT INTO execution_steps (execution_id, user_id, account_id, step_name, step_status, message, metadata, started_at, finished_at, latency_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [executionId, userId, accountId, parsed.name, parsed.status, parsed.message, JSON.stringify(parsed.metadata), parsed.startedAt, parsed.finishedAt, parsed.latencyMs]
      );
    }
  }

  public async isDuplicateSignal(userId: string, transactionId: string): Promise<boolean> {
    const result = await this.db.query("SELECT 1 FROM execution_decisions WHERE user_id=$1 AND transaction_id=$2 LIMIT 1", [userId, transactionId]);
    return result.rowCount > 0;
  }

  public async countToday(userId: string, accountId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM execution_decisions WHERE user_id=$1 AND account_id=$2 AND created_at >= (timezone('UTC', now()))::date AND status IN ('OPENED','PAPER_OPENED','SUBMITTED')`,
      [userId, accountId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async listRecentForUser(userId: string, limit: number): Promise<ExecutionDecision[]> {
    const result = await this.db.query(
      `SELECT * FROM execution_decisions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map(mapDecision);
  }

  public async findForUser(userId: string, executionId: string): Promise<ExecutionDecision | null> {
    const result = await this.db.query("SELECT * FROM execution_decisions WHERE user_id=$1 AND id=$2 LIMIT 1", [userId, executionId]);
    return result.rows[0] ? mapDecision(result.rows[0]) : null;
  }
}

function mapDecision(row: Record<string, unknown>): ExecutionDecision {
  return ExecutionDecisionSchema.parse({
    id: String(row.id),
    transactionId: String(row.transaction_id),
    userId: String(row.user_id),
    exchange: row.exchange,
    signal: row.signal_payload,
    status: row.status,
    order: row.calculated_order === null || row.calculated_order === undefined ? undefined : row.calculated_order,
    availableBalanceUsdt: row.available_balance_usdt === null || row.available_balance_usdt === undefined ? undefined : Number(row.available_balance_usdt),
    equityUsdt: row.equity_usdt === null || row.equity_usdt === undefined ? undefined : Number(row.equity_usdt),
    riskAmountUsdt: row.risk_amount_usdt === null || row.risk_amount_usdt === undefined ? undefined : Number(row.risk_amount_usdt),
    marketPrice: row.market_price === null || row.market_price === undefined ? undefined : Number(row.market_price),
    exchangeOrderId: row.exchange_order_id === null || row.exchange_order_id === undefined ? undefined : String(row.exchange_order_id),
    exchangePositionId: row.exchange_position_id === null || row.exchange_position_id === undefined ? undefined : String(row.exchange_position_id),
    rejectionReason: row.rejection_reason === null || row.rejection_reason === undefined ? undefined : String(row.rejection_reason),
    latencyMs: Number(row.latency_ms),
    createdAt: new Date(String(row.created_at)).toISOString(),
    stateMachine: []
  });
}
