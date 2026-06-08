import type { Exchange } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type OrderRole = "ENTRY" | "STOP_LOSS" | "TAKE_PROFIT" | "FORCE_CLOSE" | "MANUAL_CLOSE" | "ROLLBACK_CLOSE";

export interface OrderRecord {
  readonly id: string;
  readonly executionId: string;
  readonly userId: string;
  readonly accountId: string | null;
  readonly positionId: string | null;
  readonly exchange: Exchange;
  readonly pair: string;
  readonly exchangeOrderId: string | null;
  readonly orderRole: OrderRole;
  readonly side: string;
  readonly orderType: string;
  readonly requestedQty: number;
  readonly filledQty: number;
  readonly averageFillPrice: number | null;
  readonly status: string;
  readonly submittedAt: string;
}

export interface OrderRecordInput {
  readonly executionId: string;
  readonly userId: string;
  readonly accountId: string | null;
  readonly positionId?: string;
  readonly exchange: Exchange;
  readonly pair: string;
  readonly exchangeOrderId?: string;
  readonly clientOrderId?: string;
  readonly orderRole: OrderRole;
  readonly side: string;
  readonly orderType: string;
  readonly requestedQty: number;
  readonly filledQty?: number;
  readonly requestedPrice?: number;
  readonly averageFillPrice?: number;
  readonly status: string;
  readonly rawPayload: Record<string, unknown>;
}

export class OrderRepository {
  public constructor(private readonly db: Database) {}

  public async record(input: OrderRecordInput): Promise<void> {
    const result = await this.db.query<{ id: string; status: string }>(
      `INSERT INTO orders (execution_id, user_id, account_id, position_id, exchange, pair, exchange_order_id, client_order_id, order_role, side, order_type, requested_qty, filled_qty, requested_price, average_fill_price, status, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
       ON CONFLICT (exchange, exchange_order_id) DO UPDATE SET filled_qty=EXCLUDED.filled_qty, average_fill_price=EXCLUDED.average_fill_price, status=EXCLUDED.status, raw_payload=EXCLUDED.raw_payload, last_synced_at=now()
       RETURNING id, status`,
      [input.executionId, input.userId, input.accountId, input.positionId ?? null, input.exchange, input.pair, input.exchangeOrderId ?? null, input.clientOrderId ?? null, input.orderRole, input.side, input.orderType, input.requestedQty, input.filledQty ?? 0, input.requestedPrice ?? null, input.averageFillPrice ?? null, input.status, JSON.stringify(input.rawPayload)]
    );
    const order = result.rows[0];
    if (order) {
      await this.db.query(
        `INSERT INTO order_transitions (order_id, execution_id, user_id, from_status, to_status, message, metadata)
         VALUES ($1,$2,$3,NULL,$4,$5,$6::jsonb)`,
        [order.id, input.executionId, input.userId, normalizeLifecycleStatus(order.status), `Order ${input.orderRole} recorded with status ${order.status}.`, JSON.stringify({ role: input.orderRole, pair: input.pair })]
      );
    }
  }

  public async listForUser(userId: string, limit: number): Promise<OrderRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 300)]
    );
    return result.rows.map(mapOrderRecord);
  }
}

function normalizeLifecycleStatus(status: string): string {
  const allowed = new Set(["SUBMITTED", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCEL_REQUESTED", "CANCELED", "REJECTED", "EXPIRED", "FAILED", "UNKNOWN_RECONCILIATION_REQUIRED"]);
  return allowed.has(status) ? status : status === "OPENED" ? "FILLED" : "UNKNOWN_RECONCILIATION_REQUIRED";
}

function mapOrderRecord(row: Record<string, unknown>): OrderRecord {
  return {
    id: String(row.id),
    executionId: String(row.execution_id),
    userId: String(row.user_id),
    accountId: row.account_id === null || row.account_id === undefined ? null : String(row.account_id),
    positionId: row.position_id === null || row.position_id === undefined ? null : String(row.position_id),
    exchange: row.exchange as Exchange,
    pair: String(row.pair),
    exchangeOrderId: row.exchange_order_id === null || row.exchange_order_id === undefined ? null : String(row.exchange_order_id),
    orderRole: row.order_role as OrderRole,
    side: String(row.side),
    orderType: String(row.order_type),
    requestedQty: Number(row.requested_qty),
    filledQty: Number(row.filled_qty),
    averageFillPrice: row.average_fill_price === null || row.average_fill_price === undefined ? null : Number(row.average_fill_price),
    status: String(row.status),
    submittedAt: new Date(String(row.submitted_at)).toISOString()
  };
}
