import { createHmac } from "node:crypto";
import WebSocket from "ws";
import type { AppConfig } from "../config.js";
import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { TradingAccountRepository, TradingAccountRecord } from "../repositories/tradingAccountRepository.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import { fingerprintApiKey } from "../repositories/privateStreamRepository.js";
import type { ApiWalletVault, EncryptedSecret, ExchangeSecretPayload } from "../security/vault.js";
import { logger } from "../infrastructure/logger.js";

interface ManagedStream {
  readonly key: string;
  readonly accountId: string;
  readonly stop: () => void;
}

export class PrivateStreamSupervisor {
  private readonly streams = new Map<string, ManagedStream>();
  private scanTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly privateStreams: PrivateStreamRepository,
    private readonly config: AppConfig
  ) {}

  public start(): void {
    void this.scanAccounts();
    this.scanTimer = setInterval(() => void this.scanAccounts(), Math.max(10_000, this.config.PRIVATE_STREAM_HEARTBEAT_MS));
  }

  public stop(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = null;
    for (const stream of this.streams.values()) stream.stop();
    this.streams.clear();
  }

  private async scanAccounts(): Promise<void> {
    try {
      await this.privateStreams.markStale(this.config.PRIVATE_STREAM_STALE_AFTER_MS);
      const accounts = await this.accounts.listEnabled();
      for (const account of accounts) {
        if (account.executionMode === "LIVE" || account.executionMode === "BYBIT_TESTNET" || account.executionMode === "BINANCE_FUTURES_TESTNET") {
          await this.ensureStream(account);
        }
      }
      const activeIds = new Set(accounts.map((account) => account.id));
      for (const [key, stream] of this.streams.entries()) {
        if (!activeIds.has(stream.accountId)) {
          stream.stop();
          this.streams.delete(key);
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Private stream account scan failed");
    }
  }

  private async ensureStream(account: TradingAccountRecord): Promise<void> {
    const stored = await this.apiKeys.find(account.userId, account.exchangeName);
    if (!stored) return;
    const credentials = this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName });
    const key = `${account.id}:${fingerprintApiKey(credentials.apiKey)}`;
    if (this.streams.has(key)) return;
    const stream = account.exchangeName === "BINANCE"
      ? new BinanceUserDataStream(account, credentials, this.privateStreams, this.config)
      : new BybitPrivateStream(account, credentials, this.privateStreams, this.config);
    this.streams.set(key, { key, accountId: account.id, stop: () => stream.stop() });
    stream.start();
  }
}

class BinanceUserDataStream {
  private socket: WebSocket | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private reconnectAttempts = 0;
  private listenKey: string | null = null;

  public constructor(private readonly account: TradingAccountRecord, private readonly credentials: ExchangeSecretPayload, private readonly repository: PrivateStreamRepository, private readonly config: AppConfig) {}

  public start(): void {
    void this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.socket?.close();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    await this.repository.upsert(this.status("CONNECTING", null));
    try {
      this.listenKey = await this.createListenKey();
      const url = `${this.config.BINANCE_FUTURES_PRIVATE_WS_URL.replace(/\/$/, "")}/${this.listenKey}`;
      this.socket = new WebSocket(url);
      this.socket.on("open", () => {
        this.reconnectAttempts = 0;
        void this.repository.upsert(this.status("HEALTHY", null, { event: "open" }));
        this.keepAliveTimer = setInterval(() => void this.keepAlive(), 30 * 60 * 1000);
      });
      this.socket.on("message", (data) => {
        const text = data.toString("utf8");
        void this.repository.upsert(this.status("HEALTHY", null, { messageType: safeEventType(text), bytes: Buffer.byteLength(text) }));
      });
      this.socket.on("ping", (payload) => this.socket?.pong(payload));
      this.socket.on("error", (error) => void this.repository.upsert(this.status("FAILED", error.message)));
      this.socket.on("close", () => this.scheduleReconnect("Binance private stream closed"));
    } catch (error) {
      await this.repository.upsert(this.status("FAILED", error instanceof Error ? error.message : "Unknown Binance private stream error"));
      this.scheduleReconnect("Binance private stream connect failed");
    }
  }

  private async createListenKey(): Promise<string> {
    const url = new URL("/fapi/v1/listenKey", this.config.BINANCE_FUTURES_BASE_URL);
    const response = await fetch(url, { method: "POST", headers: { "X-MBX-APIKEY": this.credentials.apiKey } });
    if (!response.ok) throw new Error(`Binance listenKey failed with ${response.status}`);
    const body = await response.json() as { listenKey?: string };
    if (!body.listenKey) throw new Error("Binance listenKey response did not include listenKey");
    return body.listenKey;
  }

  private async keepAlive(): Promise<void> {
    if (!this.listenKey) return;
    const url = new URL("/fapi/v1/listenKey", this.config.BINANCE_FUTURES_BASE_URL);
    url.searchParams.set("listenKey", this.listenKey);
    const response = await fetch(url, { method: "PUT", headers: { "X-MBX-APIKEY": this.credentials.apiKey } });
    if (!response.ok) throw new Error(`Binance listenKey keepalive failed with ${response.status}`);
    await this.repository.upsert(this.status("HEALTHY", null, { event: "listenKeyKeepAlive" }));
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    void this.repository.upsert(this.status("RECONNECTING", reason));
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    setTimeout(() => void this.connect(), delay);
  }

  private status(status: "CONNECTING" | "HEALTHY" | "RECONNECTING" | "DISCONNECTED" | "FAILED" | "STALE", errorReason: string | null, rawPayload: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return { userId: this.account.userId, accountId: this.account.id, exchange: "BINANCE" as const, apiKeyFingerprint: fingerprintApiKey(this.credentials.apiKey), streamType: "COMBINED" as const, status, lastMessageAt: status === "HEALTHY" ? now : null, lastHeartbeatAt: now, reconnectAttempts: this.reconnectAttempts, errorReason, rawPayload };
  }
}

class BybitPrivateStream {
  private socket: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private reconnectAttempts = 0;

  public constructor(private readonly account: TradingAccountRecord, private readonly credentials: ExchangeSecretPayload, private readonly repository: PrivateStreamRepository, private readonly config: AppConfig) {}

  public start(): void {
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.socket?.close();
  }

  private connect(): void {
    if (this.stopped) return;
    void this.repository.upsert(this.status("CONNECTING", null));
    this.socket = new WebSocket(this.config.BYBIT_PRIVATE_WS_URL);
    this.socket.on("open", () => {
      this.reconnectAttempts = 0;
      this.authenticate();
      this.pingTimer = setInterval(() => this.socket?.send(JSON.stringify({ op: "ping" })), Math.max(10_000, this.config.PRIVATE_STREAM_HEARTBEAT_MS));
    });
    this.socket.on("message", (data) => this.handleMessage(data.toString("utf8")));
    this.socket.on("error", (error) => void this.repository.upsert(this.status("FAILED", error.message)));
    this.socket.on("close", () => this.scheduleReconnect("Bybit private stream closed"));
  }

  private authenticate(): void {
    const expires = Date.now() + 10_000;
    const signature = createHmac("sha256", this.credentials.apiSecret).update(`GET/realtime${expires}`).digest("hex");
    this.socket?.send(JSON.stringify({ op: "auth", args: [this.credentials.apiKey, expires, signature] }));
  }

  private handleMessage(text: string): void {
    const eventType = safeEventType(text);
    if (eventType === "auth") {
      this.socket?.send(JSON.stringify({ op: "subscribe", args: ["order", "execution", "position"] }));
    }
    void this.repository.upsert(this.status("HEALTHY", null, { messageType: eventType, bytes: Buffer.byteLength(text) }));
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    this.reconnectAttempts += 1;
    void this.repository.upsert(this.status("RECONNECTING", reason));
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    setTimeout(() => this.connect(), delay);
  }

  private status(status: "CONNECTING" | "HEALTHY" | "RECONNECTING" | "DISCONNECTED" | "FAILED" | "STALE", errorReason: string | null, rawPayload: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return { userId: this.account.userId, accountId: this.account.id, exchange: "BYBIT" as const, apiKeyFingerprint: fingerprintApiKey(this.credentials.apiKey), streamType: "COMBINED" as const, status, lastMessageAt: status === "HEALTHY" ? now : null, lastHeartbeatAt: now, reconnectAttempts: this.reconnectAttempts, errorReason, rawPayload };
  }
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}

function safeEventType(text: string): string {
  try {
    const parsed = JSON.parse(text) as { e?: string; op?: string; topic?: string };
    return parsed.e ?? parsed.op ?? parsed.topic ?? "unknown";
  } catch {
    return "non-json";
  }
}
