import type { Database } from "../infrastructure/db.js";

export interface ProtectionRunInput {
  readonly userId: string;
  readonly accountId: string;
  readonly status: "MATCHED" | "PROTECTION_MISSING" | "RESTORED" | "POSITION_CLOSED" | "FAILED";
  readonly checkedPositions: number;
  readonly repairedPositions: number;
  readonly closedPositions: number;
  readonly metadata?: Record<string, unknown>;
  readonly startedAt: string;
}

export interface ProtectionCheckInput {
  readonly runId: string;
  readonly positionId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly hasStopLoss: boolean;
  readonly hasTakeProfit: boolean;
  readonly qtyMatches: boolean;
  readonly sideMatches: boolean;
  readonly triggerPriceMatches: boolean;
  readonly status: "MATCHED" | "PROTECTION_MISSING" | "REPAIR_REQUESTED" | "REPAIR_FAILED" | "POSITION_CLOSE_REQUESTED";
  readonly metadata?: Record<string, unknown>;
}

export class ProtectionSupervisorRepository {
  public constructor(private readonly db: Database) {}

  public async createRun(input: ProtectionRunInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO protection_supervisor_runs (user_id, account_id, status, checked_positions, repaired_positions, closed_positions, metadata, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now()) RETURNING id`,
      [input.userId, input.accountId, input.status, input.checkedPositions, input.repairedPositions, input.closedPositions, JSON.stringify(input.metadata ?? {}), input.startedAt]
    );
    return result.rows[0]?.id ?? "";
  }

  public async createCheck(input: ProtectionCheckInput): Promise<void> {
    await this.db.query(
      `INSERT INTO protection_order_checks (run_id, position_id, user_id, account_id, has_stop_loss, has_take_profit, qty_matches, side_matches, trigger_price_matches, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [input.runId, input.positionId, input.userId, input.accountId, input.hasStopLoss, input.hasTakeProfit, input.qtyMatches, input.sideMatches, input.triggerPriceMatches, input.status, JSON.stringify(input.metadata ?? {})]
    );
  }
}
