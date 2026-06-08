import type { Exchange } from "@ma-core/shared";
import type { AppConfig } from "../config.js";
import type { ExchangeExecutionClient } from "./types.js";
import { BinanceExecutionClient } from "./binanceExecutionClient.js";
import { BybitExecutionClient } from "./bybitExecutionClient.js";
import { AuditedExecutionClient } from "./auditedExecutionClient.js";
import type { ExchangeAuditRepository } from "../repositories/exchangeAuditRepository.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";

export class ExecutionExchangeRegistry {
  private readonly clients: Readonly<Record<Exchange, ExchangeExecutionClient>>;

  public constructor(config: AppConfig, private readonly audit?: ExchangeAuditRepository, private readonly privateStreams?: PrivateStreamRepository) {
    this.clients = {
      BINANCE: new BinanceExecutionClient(config.BINANCE_FUTURES_BASE_URL, config.EXCHANGE_REST_TIMEOUT_MS, this.privateStreams, config.PRIVATE_STREAM_STALE_AFTER_MS),
      BYBIT: new BybitExecutionClient(config.BYBIT_BASE_URL, config.EXCHANGE_REST_TIMEOUT_MS, this.privateStreams, config.PRIVATE_STREAM_STALE_AFTER_MS)
    };
  }

  public get(exchange: Exchange): ExchangeExecutionClient {
    return this.clients[exchange];
  }

  public forAccount(exchange: Exchange, userId: string, accountId: string): ExchangeExecutionClient {
    const client = this.clients[exchange];
    return this.audit ? new AuditedExecutionClient(client, this.audit, userId, accountId) : client;
  }
}
