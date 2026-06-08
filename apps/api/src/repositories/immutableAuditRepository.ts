import { createHash } from "node:crypto";
import type { Database } from "../infrastructure/db.js";

export interface ImmutableRiskEventInput {
  readonly userId: string;
  readonly accountId?: string | null;
  readonly eventType: string;
  readonly severity: "info" | "warning" | "critical";
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly scope?: string;
}

export class ImmutableAuditRepository {
  public constructor(private readonly db: Database) {}

  public async appendRiskEvent(input: ImmutableRiskEventInput): Promise<void> {
    const scope = input.scope ?? `${input.userId}:${input.accountId ?? "global"}:risk`;
    await this.db.withTransaction(async (tx) => {
      const previous = await tx.query<{ hash_current: string }>("SELECT hash_current FROM audit_hash_state WHERE scope=$1 FOR UPDATE", [scope]);
      const hashPrev = previous.rows[0]?.hash_current ?? null;
      const canonical = canonicalJson({ userId: input.userId, accountId: input.accountId ?? null, eventType: input.eventType, severity: input.severity, message: input.message, metadata: input.metadata ?? {} });
      const hashCurrent = createHash("sha256").update(`${hashPrev ?? "GENESIS"}:${canonical}`).digest("hex");
      await tx.query(
        `INSERT INTO risk_events (user_id, account_id, event_type, severity, message, metadata, hash_prev, hash_current, immutable_scope)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
        [input.userId, input.accountId ?? null, input.eventType, input.severity, input.message, JSON.stringify(input.metadata ?? {}), hashPrev, hashCurrent, scope]
      );
      await tx.query(
        `INSERT INTO audit_hash_state (scope, hash_current, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (scope) DO UPDATE SET hash_current=EXCLUDED.hash_current, updated_at=now()`,
        [scope, hashCurrent]
      );
    });
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
