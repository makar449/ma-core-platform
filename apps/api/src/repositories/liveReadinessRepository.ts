import { LiveReadinessCheckSchema, type LiveReadinessCheck, type LiveReadinessStatus } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface LiveReadinessInput {
  readonly userId: string;
  readonly accountId: string;
  readonly checkKey: string;
  readonly status: LiveReadinessStatus;
  readonly message: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

export class LiveReadinessRepository {
  public constructor(private readonly db: Database) {}

  public async upsert(input: LiveReadinessInput): Promise<LiveReadinessCheck> {
    const result = await this.db.query(
      `INSERT INTO live_readiness_checks (user_id, account_id, check_key, status, message, metadata, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,now())
       ON CONFLICT (account_id, check_key) DO UPDATE SET status=EXCLUDED.status, message=EXCLUDED.message, metadata=EXCLUDED.metadata, checked_at=now()
       RETURNING *`,
      [input.userId, input.accountId, input.checkKey, input.status, input.message, JSON.stringify(input.metadata ?? {})]
    );
    return mapReadiness(result.rows[0]);
  }

  public async listForAccount(userId: string, accountId: string): Promise<LiveReadinessCheck[]> {
    const result = await this.db.query("SELECT * FROM live_readiness_checks WHERE user_id=$1 AND account_id=$2 ORDER BY check_key ASC", [userId, accountId]);
    return result.rows.map(mapReadiness);
  }

  public async allRequiredPassed(userId: string, accountId: string, requiredKeys: readonly string[]): Promise<boolean> {
    const checks = await this.listForAccount(userId, accountId);
    const passed = new Set(checks.filter((check) => check.status === "PASSED" || check.status === "WAIVED").map((check) => check.checkKey));
    return requiredKeys.every((key) => passed.has(key));
  }
}

function mapReadiness(row: Record<string, unknown>): LiveReadinessCheck {
  return LiveReadinessCheckSchema.parse({
    userId: String(row.user_id),
    accountId: String(row.account_id),
    checkKey: String(row.check_key),
    status: row.status,
    message: String(row.message),
    metadata: row.metadata ?? {},
    checkedAt: new Date(String(row.checked_at)).toISOString()
  });
}
