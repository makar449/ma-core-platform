import type { Exchange } from "@ma-core/shared";
import type { AppConfig } from "../config.js";
import type { ExchangeApiClient } from "./types.js";
import { BinanceClient } from "./binanceClient.js";
import { BybitClient } from "./bybitClient.js";

export class ExchangeRegistry {
  private readonly clients: Readonly<Record<Exchange, ExchangeApiClient>>;

  public constructor(config: AppConfig) {
    this.clients = {
      BINANCE: new BinanceClient(config.BINANCE_BASE_URL),
      BYBIT: new BybitClient(config.BYBIT_BASE_URL)
    };
  }

  public get(exchange: Exchange): ExchangeApiClient {
    const client = this.clients[exchange];
    if (!client) {
      throw new Error(`Unsupported exchange ${exchange}`);
    }
    return client;
  }
}
