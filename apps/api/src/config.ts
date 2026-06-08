import "dotenv/config";
import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  POSTGRES_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  VAULT_MASTER_KEY_BASE64: z.string().min(44).optional(),
  VAULT_KEY_PROVIDER: z.enum(["env", "file", "http"]).default("env"),
  VAULT_KEY_FILE: z.string().optional(),
  VAULT_KEY_PROVIDER_URL: z.string().url().optional(),
  VAULT_KEY_PROVIDER_BEARER_TOKEN: z.string().min(24).optional(),
  VAULT_KEY_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  VAULT_KEY_VERSION: z.string().min(1).default("v1"),
  JWT_AUTH_SECRET_BASE64: z.string().min(44),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(86400).max(2592000).default(1209600),
  AUTH_REGISTRATION_MODE: z.enum(["disabled", "invite", "open"]).default("invite"),
  AUTH_REGISTRATION_TOKEN: z.string().min(24).optional(),
  COOKIE_DOMAIN: z.string().optional(),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gpt-4.1-mini"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(12000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  EMBEDDING_PROVIDER: z.enum(["deterministic", "openai-compatible"]).default("deterministic"),
  EMBEDDING_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(8).max(3072).default(64),
  BINANCE_BASE_URL: z.string().url().default("https://api.binance.com"),
  BINANCE_FUTURES_BASE_URL: z.string().url().default("https://fapi.binance.com"),
  BINANCE_WS_URL: z.string().url().default("wss://stream.binance.com:9443/stream"),
  BINANCE_FUTURES_WS_URL: z.string().url().default("wss://fstream.binance.com/stream"),
  BYBIT_BASE_URL: z.string().url().default("https://api.bybit.com"),
  BYBIT_LINEAR_WS_URL: z.string().url().default("wss://stream.bybit.com/v5/public/linear"),
  BYBIT_PRIVATE_WS_URL: z.string().url().default("wss://stream.bybit.com/v5/private"),
  BINANCE_FUTURES_PRIVATE_WS_URL: z.string().url().default("wss://fstream.binance.com/ws"),
  EXCHANGE_REST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(7000),
  EXCHANGE_REST_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(5).max(1200).default(240),
  PRIVATE_STREAM_HEARTBEAT_MS: z.coerce.number().int().min(5000).max(120000).default(25000),
  PRIVATE_STREAM_STALE_AFTER_MS: z.coerce.number().int().min(5000).max(300000).default(45000),
  RECONCILIATION_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
  PROTECTION_SUPERVISOR_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(15000),
  OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(500).max(60000).default(1500),
  SAFE_MODE_MONITOR_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(20000),
  X_BEARER_TOKEN: z.string().optional(),
  X_CRYPTO_AUTHOR_IDS: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  YOUTUBE_OAUTH_ACCESS_TOKEN: z.string().optional(),
  YOUTUBE_CRYPTO_CHANNEL_IDS: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().default("ma-core-v2.0/1.0"),
  OPS_METRICS_RETENTION_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  EXECUTION_DEFAULT_MODE: z.enum(["DISABLED", "PAPER", "LIVE", "BYBIT_TESTNET", "BINANCE_FUTURES_TESTNET"]).default("PAPER"),
  EXECUTION_RISK_PER_TRADE_FRACTION: z.coerce.number().positive().max(0.05).default(0.01),
  EXECUTION_MIN_NOTIONAL_USDT: z.coerce.number().positive().default(10),
  EXECUTION_QUANTITY_STEP: z.coerce.number().positive().default(0.001),
  EXECUTION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.72),
  EXECUTION_REQUIRE_SYMBOL_RULES_FOR_LIVE: z.coerce.boolean().default(true),
  EXECUTION_REQUIRE_PRIVATE_STREAM_FOR_LIVE: z.coerce.boolean().default(true),
  EXECUTION_MAX_ORDERBOOK_AGE_MS: z.coerce.number().int().min(50).max(30000).default(3000),
  EXECUTION_MAX_SPREAD_BPS: z.coerce.number().positive().max(200).default(25),
  EXECUTION_MAX_DAILY_TRADES: z.coerce.number().int().min(1).max(200).default(20),
  EXECUTION_MAX_OPEN_POSITIONS: z.coerce.number().int().min(1).max(20).default(3),
  DAILY_MAX_DRAWDOWN_RATIO: z.coerce.number().positive().max(0.5).default(0.05),
  DAILY_PROFIT_CAP_RATIO: z.coerce.number().positive().max(1).default(0.15),
  POSITION_TIMEOUT_WARNING_MINUTES: z.coerce.number().int().min(1).max(180).default(165),
  POSITION_FORCE_CLOSE_MINUTES: z.coerce.number().int().min(2).max(720).default(180),
  WEB_ORIGIN: z.string().optional(),
  MARKET_PAIRS: z.string().default("BINANCE:BTC/USDT,BYBIT:BTC/USDT")
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (parsed.data.VAULT_KEY_PROVIDER === "env") {
    if (!parsed.data.VAULT_MASTER_KEY_BASE64) {
      throw new Error("VAULT_MASTER_KEY_BASE64 is required when VAULT_KEY_PROVIDER=env");
    }
    const masterKey = Buffer.from(parsed.data.VAULT_MASTER_KEY_BASE64, "base64");
    if (masterKey.length !== 32) {
      throw new Error("VAULT_MASTER_KEY_BASE64 must decode to exactly 32 bytes for AES-256-GCM");
    }
  }
  if (parsed.data.VAULT_KEY_PROVIDER === "file" && !parsed.data.VAULT_KEY_FILE) {
    throw new Error("VAULT_KEY_FILE is required when VAULT_KEY_PROVIDER=file");
  }
  if (parsed.data.VAULT_KEY_PROVIDER === "http" && !parsed.data.VAULT_KEY_PROVIDER_URL) {
    throw new Error("VAULT_KEY_PROVIDER_URL is required when VAULT_KEY_PROVIDER=http");
  }
  const jwtSecret = Buffer.from(parsed.data.JWT_AUTH_SECRET_BASE64, "base64");
  if (jwtSecret.length < 32) {
    throw new Error("JWT_AUTH_SECRET_BASE64 must decode to at least 32 bytes");
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.AUTH_REGISTRATION_MODE !== "disabled" && parsed.data.AUTH_REGISTRATION_MODE !== "invite") {
    throw new Error("AUTH_REGISTRATION_MODE=open is not allowed in production");
  }
  if (parsed.data.AUTH_REGISTRATION_MODE === "invite" && !parsed.data.AUTH_REGISTRATION_TOKEN) {
    throw new Error("AUTH_REGISTRATION_TOKEN is required when AUTH_REGISTRATION_MODE=invite");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.WEB_ORIGIN) {
    throw new Error("WEB_ORIGIN is required in production for strict CORS");
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.EXECUTION_DEFAULT_MODE === "LIVE") {
    throw new Error("EXECUTION_DEFAULT_MODE=LIVE is forbidden at boot. Live mode must be enabled by an authenticated operator after readiness checks.");
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.EXECUTION_REQUIRE_PRIVATE_STREAM_FOR_LIVE !== true) {
    throw new Error("EXECUTION_REQUIRE_PRIVATE_STREAM_FOR_LIVE must be true in production");
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.EXECUTION_REQUIRE_SYMBOL_RULES_FOR_LIVE !== true) {
    throw new Error("EXECUTION_REQUIRE_SYMBOL_RULES_FOR_LIVE must be true in production");
  }
  if (parsed.data.POSITION_TIMEOUT_WARNING_MINUTES >= parsed.data.POSITION_FORCE_CLOSE_MINUTES) {
    throw new Error("POSITION_TIMEOUT_WARNING_MINUTES must be lower than POSITION_FORCE_CLOSE_MINUTES");
  }
  return parsed.data;
}
