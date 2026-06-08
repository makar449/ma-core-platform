import type { OrderLifecycleStatus } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface OrderTransitionInput {
  readonly orderId: string | null;
  readonly executionId: string;
  readonly userId: string;
  readonly fromStatus?: string | null;
  readonly toStatus: OrderLifecycleStatus;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export class OrderTransitionRepository {
  public constructor(private readonly db: Database) {}

  public async record(input: OrderTransitionInput): Promise<void> {
    await this.db.query(
      `INSERT INTO order_transitions (order_id, execution_id, user_id, from_status, to_status, message, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [input.orderId, input.executionId, input.userId, input.fromStatus ?? null, input.toStatus, input.message, JSON.stringify(input.metadata ?? {})]
    );
  }
}
