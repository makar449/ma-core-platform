import type { Database } from "../infrastructure/db.js";

export interface LlmFailureInput {
  promptVersion: string;
  model: string;
  operation: string;
  failureType: string;
  message: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export class LlmFailureRepository {
  public constructor(private readonly db: Database) {}

  public async insert(input: LlmFailureInput): Promise<void> {
    await this.db.query(
      `INSERT INTO llm_failures (prompt_version, model, operation, failure_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.promptVersion,
        input.model,
        input.operation,
        input.failureType,
        input.message.slice(0, 1200),
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }
}
