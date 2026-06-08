import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const webUrl = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4100";
const useExistingStack = process.env.E2E_USE_EXISTING_STACK === "true";
const mockApi = process.env.E2E_MOCK_API === "true";
const postgresUrl = process.env.POSTGRES_URL ?? "postgres://ma_core:ma_core_password@127.0.0.1:5433/ma_core";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";

const inheritedEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

const commonServerEnv: Record<string, string> = {
  ...inheritedEnv,
  NODE_ENV: "test",
  NEXT_PUBLIC_API_URL: apiUrl,
  API_PORT: "4100",
  POSTGRES_URL: postgresUrl,
  REDIS_URL: redisUrl,
  VAULT_MASTER_KEY_BASE64: "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
  VAULT_KEY_PROVIDER: "env",
  VAULT_KEY_VERSION: "e2e-v1",
  JWT_AUTH_SECRET_BASE64: "MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE=",
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_SECONDS: "1209600",
  AUTH_REGISTRATION_MODE: "open",
  COOKIE_DOMAIN: "",
  WEB_ORIGIN: webUrl,
  EMBEDDING_PROVIDER: "deterministic",
  EMBEDDING_DIMENSIONS: "64",
  EXCHANGE_REST_TIMEOUT_MS: "2500",
  EXCHANGE_REST_RATE_LIMIT_PER_MINUTE: "120",
  MARKET_PAIRS: "BINANCE:BTC/USDT,BYBIT:BTC/USDT"
};

function webServers(): PlaywrightTestConfig["webServer"] {
  if (useExistingStack) return undefined;
  const webServer = { command: "pnpm --filter @ma-core/web start", cwd: rootDir, url: webUrl, reuseExistingServer: false, timeout: 120_000, env: commonServerEnv };
  if (mockApi) return [webServer];
  return [
    { command: "pnpm --filter @ma-core/api migrate && pnpm --filter @ma-core/api start", cwd: rootDir, url: `${apiUrl}/health`, reuseExistingServer: false, timeout: 120_000, env: commonServerEnv },
    webServer
  ];
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: { baseURL: webUrl, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", viewport: { width: 1680, height: 945 }, colorScheme: "dark", ignoreHTTPSErrors: false },
  webServer: webServers(),
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "institutional-wide", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } }
  ]
});
