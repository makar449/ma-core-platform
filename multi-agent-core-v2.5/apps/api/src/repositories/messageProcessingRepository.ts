import type { Database } from "../infrastructure/db.js";

export type MessageProcessingStatus = "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD_LETTER";

export class MessageProcessingRepository {
  public constructor(private readonly db: Database) {}

  public async begin(input: { idempotencyKey: string; streamName: string; redisMessageId: string; handlerName: string }): Promise<boolean> {
    const result = await this.db.query<{ inserted: boolean }>(
      `INSERT INTO processed_agent_messages (idempotency_key, stream_name, redis_message_id, handler_name, status, attempt_count)
       VALUES ($1, $2, $3, $4, 'PROCESSING', 1)
       ON CONFLICT (idempotency_key) DO UPDATE
       SET status = CASE WHEN processed_agent_messages.status IN ('FAILED','PROCESSING') THEN 'PROCESSING' ELSE processed_agent_messages.status END,
           attempt_count = CASE WHEN processed_agent_messages.status = 'PROCESSED' THEN processed_agent_messages.attempt_count ELSE processed_agent_messages.attempt_count + 1 END,
           redis_message_id = EXCLUDED.redis_message_id,
           updated_at = now()
       WHERE processed_agent_messages.status <> 'PROCESSED'
       RETURNING status <> 'PROCESSED' AS inserted`,
      [input.idempotencyKey, input.streamName, input.redisMessageId, input.handlerName]
    );
    return result.rows[0]?.inserted ?? false;
  }

  public async markProcessed(idempotencyKey: string): Promise<void> {
    await this.db.query(`UPDATE processed_agent_messages SET status = 'PROCESSED', last_error = NULL, updated_at = now() WHERE idempotency_key = $1`, [idempotencyKey]);
  }

  public async markFailed(idempotencyKey: string, error: string, deadLetter: boolean): Promise<void> {
    await this.db.query(
      `UPDATE processed_agent_messages SET status = $2, last_error = $3, updated_at = now() WHERE idempotency_key = $1`,
      [idempotencyKey, deadLetter ? "DEAD_LETTER" : "FAILED", error.slice(0, 1200)]
    );
  }

  public async listDeadLetters(limit: number): Promise<ReadonlyArray<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT * FROM processed_agent_messages WHERE status = 'DEAD_LETTER' ORDER BY updated_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows;
  }
}
