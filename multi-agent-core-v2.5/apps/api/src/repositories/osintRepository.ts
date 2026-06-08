import { createHash } from "node:crypto";
import type { SourceType } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";
import type { RawStrategySource } from "../osint/types.js";

export interface DedupeDecision {
  duplicate: boolean;
  contentHash: string;
}

export class OsintRepository {
  public constructor(private readonly db: Database) {}

  public async registerSeen(source: RawStrategySource): Promise<DedupeDecision> {
    const contentHash = hashSource(source);
    const result = await this.db.query<{ inserted: boolean }>(
      `INSERT INTO osint_dedupe (content_hash, source_type, source_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (content_hash)
       DO UPDATE SET last_seen_at = now(), seen_count = osint_dedupe.seen_count + 1
       RETURNING xmax = 0 AS inserted`,
      [contentHash, source.sourceType, source.sourceId]
    );
    return { duplicate: result.rows[0]?.inserted !== true, contentHash };
  }

  public async upsertSource(input: { id: string; sourceType: SourceType; handle: string; displayName: string; trustScore: number; allowlisted: boolean; quarantined: boolean; reason: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO osint_sources (id, source_type, handle, display_name, trust_score, allowlisted, quarantined, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET source_type = EXCLUDED.source_type, handle = EXCLUDED.handle, display_name = EXCLUDED.display_name, trust_score = EXCLUDED.trust_score, allowlisted = EXCLUDED.allowlisted, quarantined = EXCLUDED.quarantined, reason = EXCLUDED.reason, updated_at = now()`,
      [input.id, input.sourceType, input.handle, input.displayName, input.trustScore, input.allowlisted, input.quarantined, input.reason]
    );
  }
}

function hashSource(source: RawStrategySource): string {
  const normalized = `${source.sourceType}:${source.sourceId}:${source.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
  return createHash("sha256").update(normalized).digest("hex");
}
