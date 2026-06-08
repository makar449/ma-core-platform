import type { AgentEnvelope } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type EventVisibility = "global" | "user" | "system";

export class EventLogRepository {
  public constructor(private readonly db: Database) {}

  public async insert(envelope: AgentEnvelope, userId?: string, visibility: EventVisibility = userId ? "user" : "global"): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_events (schema_version, transaction_id, trace_id, channel, pipeline_stage, sender_agent, target_agent, idempotency_key, user_id, visibility, agent_log, payload, raw_envelope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        envelope.schema_version,
        envelope.transaction_id,
        envelope.trace_id,
        envelope.channel,
        envelope.pipeline_stage,
        envelope.sender_agent,
        envelope.target_agent ?? null,
        envelope.idempotency_key,
        userId ?? inferUserId(envelope) ?? null,
        visibility,
        envelope.agent_log,
        JSON.stringify(envelope.payload),
        JSON.stringify(envelope)
      ]
    );
  }

  public async listRecent(limit: number, channel?: string, userId?: string): Promise<ReadonlyArray<Record<string, unknown>>> {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const select = `SELECT id, schema_version, transaction_id, trace_id, channel, pipeline_stage, sender_agent, target_agent, idempotency_key, user_id, visibility, agent_log, payload, created_at FROM agent_events`;
    if (channel && userId) {
      const result = await this.db.query(
        `${select} WHERE channel = $1 AND (visibility = 'global' OR user_id = $2) ORDER BY created_at DESC LIMIT $3`,
        [channel, userId, safeLimit]
      );
      return result.rows;
    }
    if (channel) {
      const result = await this.db.query(
        `${select} WHERE channel = $1 AND visibility = 'global' ORDER BY created_at DESC LIMIT $2`,
        [channel, safeLimit]
      );
      return result.rows;
    }
    if (userId) {
      const result = await this.db.query(
        `${select} WHERE visibility = 'global' OR user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, safeLimit]
      );
      return result.rows;
    }
    const result = await this.db.query(`${select} WHERE visibility = 'global' ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
    return result.rows;
  }
}

function inferUserId(envelope: AgentEnvelope): string | undefined {
  if (envelope.channel === "security.audit") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.strategy.signal") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.execution.status") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.execution.order") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.risk.state") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.risk.halt") {
    return envelope.payload.userId;
  }
  if (envelope.channel === "agent.position.timeout") {
    return envelope.payload.position.userId;
  }
  return undefined;
}
