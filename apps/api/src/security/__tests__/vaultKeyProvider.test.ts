import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../config.js";
import { resolveVaultMasterKey } from "../vaultKeyProvider.js";

const keyBase64 = Buffer.from("2".repeat(32), "utf8").toString("base64");

function baseConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    NODE_ENV: "test",
    API_PORT: 4100,
    POSTGRES_URL: "postgres://user:pass@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    VAULT_MASTER_KEY_BASE64: keyBase64,
    VAULT_KEY_PROVIDER: "env",
    VAULT_KEY_VERSION: "v1",
    VAULT_KEY_PROVIDER_TIMEOUT_MS: 5000,
    JWT_AUTH_SECRET_BASE64: Buffer.alloc(32, 1).toString("base64"),
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_SECONDS: 1209600,
    AUTH_REGISTRATION_MODE: "open",
    LLM_BASE_URL: "https://api.openai.com/v1",
    LLM_MODEL: "gpt-4.1-mini",
    LLM_TIMEOUT_MS: 12000,
    LLM_MAX_RETRIES: 2,
    EMBEDDING_PROVIDER: "deterministic",
    EMBEDDING_BASE_URL: "https://api.openai.com/v1",
    EMBEDDING_MODEL: "text-embedding-3-small",
    EMBEDDING_DIMENSIONS: 64,
    BINANCE_BASE_URL: "https://api.binance.com",
    BINANCE_FUTURES_BASE_URL: "https://fapi.binance.com",
    BINANCE_WS_URL: "wss://stream.binance.com:9443/stream",
    BINANCE_FUTURES_WS_URL: "wss://fstream.binance.com/stream",
    BYBIT_BASE_URL: "https://api.bybit.com",
    BYBIT_LINEAR_WS_URL: "wss://stream.bybit.com/v5/public/linear",
    EXCHANGE_REST_TIMEOUT_MS: 7000,
    EXCHANGE_REST_RATE_LIMIT_PER_MINUTE: 240,
    REDDIT_USER_AGENT: "ma-core-v1.3/1.0",
    OPS_METRICS_RETENTION_SECONDS: 3600,
    MARKET_PAIRS: "BINANCE:BTC/USDT",
    ...overrides
  } as AppConfig;
}

describe("resolveVaultMasterKey", () => {
  it("loads an env-backed key", async () => {
    const resolved = await resolveVaultMasterKey(baseConfig({ VAULT_KEY_PROVIDER: "env", VAULT_MASTER_KEY_BASE64: keyBase64, VAULT_KEY_VERSION: "v7" }));
    expect(resolved.provider).toBe("env");
    expect(resolved.version).toBe("v7");
    expect(resolved.key.length).toBe(32);
  });

  it("loads a file-backed JSON key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-core-vault-"));
    const file = join(dir, "key.json");
    await writeFile(file, JSON.stringify({ keyBase64, keyVersion: "file-v2" }), "utf8");
    const resolved = await resolveVaultMasterKey(baseConfig({ VAULT_KEY_PROVIDER: "file", VAULT_KEY_FILE: file }));
    expect(resolved.provider).toBe("file");
    expect(resolved.version).toBe("file-v2");
    expect(resolved.key.equals(Buffer.from("2".repeat(32), "utf8"))).toBe(true);
  });
});
