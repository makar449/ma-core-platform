import pg from "pg";
import type { AppConfig } from "../config.js";

export type QueryParams = readonly unknown[];
export type Queryable = Pick<Database, "query">;

export class Database {
  private readonly pool: pg.Pool;

  public constructor(config: AppConfig) {
    this.pool = new pg.Pool({ connectionString: config.POSTGRES_URL, max: 24, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  public async query<T extends pg.QueryResultRow>(sql: string, params: QueryParams = []): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(sql, [...params]);
  }

  public async withTransaction<T>(operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new TransactionClient(client);
    try {
      await client.query("BEGIN");
      const result = await operation(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async tryWithAdvisoryLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T | null> {
    const hash = advisoryHash(lockKey);
    const locked = await this.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [hash]);
    if (locked.rows[0]?.locked !== true) {
      return null;
    }
    try {
      return await operation();
    } finally {
      await this.query("SELECT pg_advisory_unlock($1)", [hash]);
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export class TransactionClient {
  public constructor(private readonly client: pg.PoolClient) {}

  public async query<T extends pg.QueryResultRow>(sql: string, params: QueryParams = []): Promise<pg.QueryResult<T>> {
    return this.client.query<T>(sql, [...params]);
  }
}

function advisoryHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
