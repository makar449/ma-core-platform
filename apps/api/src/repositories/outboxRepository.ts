import { AgentEnvelopeSchema, type AgentEnvelope, type EventChannel } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export interface OutboxRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly channel: EventChannel;
  readonly payload: AgentEnvelope;
  readonly idempotencyKey: string;
  readonly attempts: number;
  readonly lastError: string | null;
}

export class OutboxRepository {
  public constructor(private readonly db: Database) {}

  public async enqueue(envelope: AgentEnvelope, userId: string | null = envelope.user_id ?? null): Promise<void> {
    const parsed = AgentEnvelopeSchema.parse(envelope);
    await this.db.query(
      `INSERT INTO event_outbox (user_id, channel, payload, idempotency_key)
       VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [userId, parsed.channel, JSON.stringify(parsed), parsed.idempotency_key]
    );
  }

  public async claimBatch(limit: number): Promise<OutboxRecord[]> {
    const result = await this.db.query(
      `UPDATE event_outbox SET status='PENDING'
       WHERE id IN (
         SELECT id FROM event_outbox
         WHERE status IN ('PENDING','FAILED') AND next_attempt_at <= now() AND attempts < 8
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map(mapOutbox);
  }

  public async markPublished(id: string): Promise<void> {
    await this.db.query("UPDATE event_outbox SET status='PUBLISHED', published_at=now(), last_error=NULL WHERE id=$1", [id]);
  }

  public async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `UPDATE event_outbox
       SET status=CASE WHEN attempts + 1 >= 8 THEN 'DEAD_LETTER' ELSE 'FAILED' END,
           attempts=attempts + 1,
           next_attempt_at=now() + ((LEAST(60, POWER(2, attempts + 1)))::text || ' seconds')::interval,
           last_error=$2
       WHERE id=$1`,
      [id, errorMessage.slice(0, 1000)]
    );
    await this.db.query(
      `INSERT INTO event_outbox_dead_letters (outbox_id, user_id, channel, payload, idempotency_key, attempts, last_error)
       SELECT id, user_id, channel, payload, idempotency_key, attempts, COALESCE(last_error, $2)
       FROM event_outbox WHERE id=$1 AND status='DEAD_LETTER'
       ON CONFLICT DO NOTHING`,
      [id, errorMessage.slice(0, 1000)]
    );
  }

  public async list(limit: number): Promise<OutboxRecord[]> {
    const result = await this.db.query("SELECT * FROM event_outbox ORDER BY created_at DESC LIMIT $1", [Math.min(Math.max(limit, 1), 200)]);
    return result.rows.map(mapOutbox);
  }
}

function mapOutbox(row: Record<string, unknown>): OutboxRecord {
  return {
    id: String(row.id),
    userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    channel: row.channel as EventChannel,
    payload: AgentEnvelopeSchema.parse(row.payload),
    idempotencyKey: String(row.idempotency_key),
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error)
  };
}
