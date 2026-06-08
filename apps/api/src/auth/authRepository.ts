import type { Database } from "../infrastructure/db.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  disabledAt: Date | null;
  roles: readonly string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class AuthRepository {
  public constructor(private readonly db: Database) {}

  public async createUser(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    const result = await this.db.query<UserRecord>(
      `INSERT INTO app_users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash AS "passwordHash", disabled_at AS "disabledAt", roles`,
      [input.email.toLowerCase(), input.passwordHash]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("User insert did not return a row");
    }
    return row;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>(
      `SELECT id, email, password_hash AS "passwordHash", disabled_at AS "disabledAt", roles
       FROM app_users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    return result.rows[0] ?? null;
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>(
      `SELECT id, email, password_hash AS "passwordHash", disabled_at AS "disabledAt", roles
       FROM app_users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  public async createSession(input: { userId: string; refreshTokenHash: string; csrfTokenHash: string; expiresAt: Date; userAgent?: string | undefined; ipAddress?: string | undefined }): Promise<SessionRecord> {
    const result = await this.db.query<SessionRecord>(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, csrf_token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id AS "userId", refresh_token_hash AS "refreshTokenHash", csrf_token_hash AS "csrfTokenHash", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
      [input.userId, input.refreshTokenHash, input.csrfTokenHash, input.expiresAt, input.userAgent ?? null, input.ipAddress ?? null]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Session insert did not return a row");
    }
    return row;
  }

  public async findSessionById(id: string): Promise<SessionRecord | null> {
    const result = await this.db.query<SessionRecord>(
      `SELECT id, user_id AS "userId", refresh_token_hash AS "refreshTokenHash", csrf_token_hash AS "csrfTokenHash", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM user_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  public async findSessionByRefreshHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    const result = await this.db.query<SessionRecord>(
      `SELECT id, user_id AS "userId", refresh_token_hash AS "refreshTokenHash", csrf_token_hash AS "csrfTokenHash", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM user_sessions WHERE refresh_token_hash = $1 LIMIT 1`,
      [refreshTokenHash]
    );
    return result.rows[0] ?? null;
  }

  public async rotateSession(input: { sessionId: string; nextRefreshTokenHash: string; nextCsrfTokenHash: string; nextExpiresAt: Date }): Promise<SessionRecord | null> {
    const result = await this.db.query<SessionRecord>(
      `UPDATE user_sessions
       SET refresh_token_hash = $2, csrf_token_hash = $3, expires_at = $4, rotated_at = now(), last_seen_at = now()
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING id, user_id AS "userId", refresh_token_hash AS "refreshTokenHash", csrf_token_hash AS "csrfTokenHash", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
      [input.sessionId, input.nextRefreshTokenHash, input.nextCsrfTokenHash, input.nextExpiresAt]
    );
    return result.rows[0] ?? null;
  }

  public async touchSession(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE user_sessions SET last_seen_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
  }

  public async revokeSession(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    await this.db.query(`UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }
}
