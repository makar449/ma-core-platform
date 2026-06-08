import type { Exchange } from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";
import type { EncryptedSecret } from "../security/vault.js";

export interface StoredExchangeKey {
  id: string;
  userId: string;
  exchange: Exchange;
  encryptedPayload: string;
  iv: string;
  salt: string;
  authTag: string;
  keyVersion: string;
  permissionSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class ApiKeyRepository {
  public constructor(private readonly db: Database) {}

  public async upsert(userId: string, exchange: Exchange, encrypted: EncryptedSecret, permissions: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO exchange_api_keys (user_id, exchange, encrypted_payload, iv, salt, auth_tag, key_version, permission_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (user_id, exchange)
       DO UPDATE SET encrypted_payload = EXCLUDED.encrypted_payload,
         iv = EXCLUDED.iv,
         salt = EXCLUDED.salt,
         auth_tag = EXCLUDED.auth_tag,
         key_version = EXCLUDED.key_version,
         permission_snapshot = EXCLUDED.permission_snapshot,
         updated_at = now()`,
      [userId, exchange, encrypted.ciphertext, encrypted.iv, encrypted.salt, encrypted.authTag, encrypted.keyVersion, JSON.stringify(permissions)]
    );
  }

  public async find(userId: string, exchange: Exchange): Promise<StoredExchangeKey | null> {
    const result = await this.db.query(
      `SELECT id, user_id, exchange, encrypted_payload, iv, salt, auth_tag, key_version, permission_snapshot, created_at, updated_at
       FROM exchange_api_keys WHERE user_id = $1 AND exchange = $2`,
      [userId, exchange]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      userId: String(row.user_id),
      exchange: row.exchange as Exchange,
      encryptedPayload: String(row.encrypted_payload),
      iv: String(row.iv),
      salt: String(row.salt),
      authTag: String(row.auth_tag),
      keyVersion: String(row.key_version),
      permissionSnapshot: row.permission_snapshot as Record<string, unknown>,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString()
    };
  }
}
