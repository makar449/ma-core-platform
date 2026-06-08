import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface ExchangeSecretPayload {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface VaultEncryptionContext {
  userId: string;
  exchange: string;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
  keyVersion: string;
}

export class ApiWalletVault {
  private readonly masterKey: Buffer;

  public constructor(masterKey: string | Buffer, private readonly keyVersion: string) {
    const key = typeof masterKey === "string" ? Buffer.from(masterKey, "base64") : Buffer.from(masterKey);
    if (key.length !== 32) {
      throw new Error("Vault master key must be exactly 32 bytes");
    }
    this.masterKey = key;
  }

  public encrypt(payload: ExchangeSecretPayload, context: VaultEncryptionContext): EncryptedSecret {
    const salt = randomBytes(32);
    const iv = randomBytes(12);
    const dataKey = this.deriveDataKey(salt, context);
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
    cipher.setAAD(this.buildAad(context));
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      salt: salt.toString("base64"),
      authTag: authTag.toString("base64"),
      keyVersion: this.keyVersion
    };
  }

  public decrypt(secret: EncryptedSecret, context: VaultEncryptionContext): ExchangeSecretPayload {
    const salt = Buffer.from(secret.salt, "base64");
    const iv = Buffer.from(secret.iv, "base64");
    const authTag = Buffer.from(secret.authTag, "base64");
    const ciphertext = Buffer.from(secret.ciphertext, "base64");
    const dataKey = this.deriveDataKey(salt, context);
    const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
    decipher.setAAD(this.buildAad(context));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    if (!this.isExchangeSecretPayload(parsed)) {
      throw new Error("Vault payload has invalid structure");
    }
    return parsed;
  }

  public needsRotation(secret: EncryptedSecret): boolean {
    return secret.keyVersion !== this.keyVersion;
  }

  private deriveDataKey(salt: Buffer, context: VaultEncryptionContext): Buffer {
    return Buffer.from(hkdfSync("sha256", this.masterKey, salt, this.buildAad(context), 32));
  }

  private buildAad(context: VaultEncryptionContext): Buffer {
    return Buffer.from(`api-wallet-vault-v1:${this.keyVersion}:${context.userId}:${context.exchange}`, "utf8");
  }

  private isExchangeSecretPayload(value: unknown): value is ExchangeSecretPayload {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    const passphrase = candidate.passphrase;
    return typeof candidate.apiKey === "string" &&
      typeof candidate.apiSecret === "string" &&
      (passphrase === undefined || typeof passphrase === "string");
  }
}
