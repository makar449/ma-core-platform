import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadConfig } from "../config.js";
import { Database } from "../infrastructure/db.js";

interface AppliedMigrationRow {
  readonly filename: string;
  readonly checksum: string;
}

const config = loadConfig();
const db = new Database(config);

try {
  await ensureMigrationTable(db);
  const migrationsDir = resolve(process.cwd(), "migrations");
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => /^\d+_[a-z0-9_\-]+\.sql$/i.test(filename))
    .sort((left, right) => left.localeCompare(right));

  if (filenames.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDir}`);
  }

  for (const filename of filenames) {
    const fullPath = resolve(migrationsDir, filename);
    const sql = await readFile(fullPath, "utf8");
    const checksum = sha256(sql);
    const applied = await findAppliedMigration(db, filename);
    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${filename}. Refusing to run because an applied migration was modified.`);
      }
      console.log(`Migration ${filename} already applied`);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        `INSERT INTO schema_migrations (filename, checksum, applied_at)
         VALUES ($1, $2, now())`,
        [basename(filename), checksum]
      );
      await db.query("COMMIT");
      console.log(`Migration ${filename} applied`);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Database migrations completed");
} finally {
  await db.close();
}

async function ensureMigrationTable(database: Database): Promise<void> {
  await database.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  );
}

async function findAppliedMigration(database: Database, filename: string): Promise<AppliedMigrationRow | null> {
  const result = await database.query<AppliedMigrationRow>(
    `SELECT filename, checksum FROM schema_migrations WHERE filename = $1 LIMIT 1`,
    [basename(filename)]
  );
  return result.rows[0] ?? null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
