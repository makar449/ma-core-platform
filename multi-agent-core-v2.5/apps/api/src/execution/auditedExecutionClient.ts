import { nanoid } from "nanoid";
import type { CalculatedOrderParameters, Exchange, Position, SymbolTradingRule, TradeDirection } from "@ma-core/shared";
import type { ExchangeSecretPayload } from "../security/vault.js";
import type { ExchangeAuditRepository } from "../repositories/exchangeAuditRepository.js";
import type { AccountBalanceSnapshot, ExchangeCloseResult, ExchangeExecutionClient, ExchangeOpenOrderSnapshot, ExchangeOrderPlacementResult, ExchangePositionSnapshot, ProtectiveOrderStatus, TopOfBook } from "./types.js";
import { fingerprintApiKey } from "../repositories/privateStreamRepository.js";

export class AuditedExecutionClient implements ExchangeExecutionClient {
  public readonly exchange: Exchange;

  public constructor(
    private readonly inner: ExchangeExecutionClient,
    private readonly audit: ExchangeAuditRepository,
    private readonly userId: string | null,
    private readonly accountId: string | null
  ) {
    this.exchange = inner.exchange;
  }

  public getBalance(credentials: ExchangeSecretPayload): Promise<AccountBalanceSnapshot> {
    return this.capture(credentials, "GET", "balance", {}, () => this.inner.getBalance(credentials));
  }

  public getTopOfBook(pair: string): Promise<TopOfBook> {
    return this.capture(null, "GET", "top-of-book", { pair }, () => this.inner.getTopOfBook(pair));
  }

  public getSymbolRules(credentials: ExchangeSecretPayload, pair: string): Promise<SymbolTradingRule> {
    if (!this.inner.getSymbolRules) throw new Error(`${this.exchange} does not expose symbol rules`);
    return this.capture(credentials, "GET", "symbol-rules", { pair }, () => this.inner.getSymbolRules?.(credentials, pair) as Promise<SymbolTradingRule>);
  }

  public getRealizedPnlToday(credentials: ExchangeSecretPayload): Promise<number | null> {
    if (!this.inner.getRealizedPnlToday) return Promise.resolve(null);
    return this.capture(credentials, "GET", "realized-pnl-today", {}, () => this.inner.getRealizedPnlToday?.(credentials) as Promise<number | null>);
  }

  public hasHealthyPrivateStream(credentials: ExchangeSecretPayload): Promise<boolean> {
    if (!this.inner.hasHealthyPrivateStream) return Promise.resolve(false);
    return this.capture(credentials, "GET", "private-stream-health", {}, () => this.inner.hasHealthyPrivateStream?.(credentials) as Promise<boolean>);
  }

  public setLeverage(credentials: ExchangeSecretPayload, pair: string, leverage: number, direction: TradeDirection): Promise<void> {
    return this.capture(credentials, "POST", "set-leverage", { pair, leverage, direction }, () => this.inner.setLeverage(credentials, pair, leverage, direction));
  }

  public placeBracketOrder(credentials: ExchangeSecretPayload, order: CalculatedOrderParameters): Promise<ExchangeOrderPlacementResult> {
    return this.capture(credentials, "POST", "place-bracket-order", { pair: order.pair, side: order.side, qty: order.qty, orderType: order.orderType }, () => this.inner.placeBracketOrder(credentials, order));
  }

  public cancelAllOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<Record<string, unknown>> {
    return this.capture(credentials, "DELETE", "cancel-all-orders", { pair: pair ?? null }, () => this.inner.cancelAllOrders(credentials, pair));
  }

  public closeAllPositions(credentials: ExchangeSecretPayload): Promise<ExchangeCloseResult[]> {
    return this.capture(credentials, "POST", "close-all-positions", {}, () => this.inner.closeAllPositions(credentials));
  }

  public closePosition(credentials: ExchangeSecretPayload, position: Position): Promise<ExchangeCloseResult> {
    return this.capture(credentials, "POST", "close-position", { positionId: position.id, pair: position.pair }, () => this.inner.closePosition(credentials, position));
  }

  public listExchangePositions(credentials: ExchangeSecretPayload): Promise<ExchangePositionSnapshot[]> {
    if (!this.inner.listExchangePositions) return Promise.resolve([]);
    return this.capture(credentials, "GET", "list-exchange-positions", {}, () => this.inner.listExchangePositions?.(credentials) as Promise<ExchangePositionSnapshot[]>);
  }

  public listOpenOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<ExchangeOpenOrderSnapshot[]> {
    if (!this.inner.listOpenOrders) return Promise.resolve([]);
    return this.capture(credentials, "GET", "list-open-orders", { pair: pair ?? null }, () => this.inner.listOpenOrders?.(credentials, pair) as Promise<ExchangeOpenOrderSnapshot[]>);
  }

  public getProtectiveOrderStatus(credentials: ExchangeSecretPayload, position: Position): Promise<ProtectiveOrderStatus> {
    if (!this.inner.getProtectiveOrderStatus) {
      return Promise.resolve({ hasStopLoss: false, hasTakeProfit: false, qtyMatches: false, sideMatches: false, triggerPriceMatches: false, raw: { reason: "client_not_supported" } });
    }
    return this.capture(credentials, "GET", "protective-order-status", { positionId: position.id, pair: position.pair }, () => this.inner.getProtectiveOrderStatus?.(credentials, position) as Promise<ProtectiveOrderStatus>);
  }

  private async capture<T>(credentials: ExchangeSecretPayload | null, method: string, endpoint: string, requestMetadata: Record<string, unknown>, operation: () => Promise<T>): Promise<T> {
    const started = performance.now();
    const correlationId = `audit_${nanoid(16)}`;
    const sanitizedRequest = credentials ? { ...requestMetadata, apiKeyFingerprint: fingerprintApiKey(credentials.apiKey).slice(0, 16) } : requestMetadata;
    try {
      const result = await operation();
      await this.audit.append({ userId: this.userId, accountId: this.accountId, exchange: this.exchange, endpoint, method, requestMetadata: sanitizedRequest, responseMetadata: summarizeResult(result), status: "OK", latencyMs: Math.round(performance.now() - started), correlationId });
      return result;
    } catch (error) {
      await this.audit.append({ userId: this.userId, accountId: this.accountId, exchange: this.exchange, endpoint, method, requestMetadata: sanitizedRequest, responseMetadata: { message: error instanceof Error ? error.message : "Unknown exchange error" }, status: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "ERROR", latencyMs: Math.round(performance.now() - started), correlationId });
      throw error;
    }
  }
}

function summarizeResult(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { itemCount: value.length };
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const key of ["exchangeOrderId", "exchangePositionId", "filledPrice", "filledQty", "protectionAttached", "availableBalanceUsdt", "totalEquityUsdt", "bid", "ask"]) {
      if (record[key] !== undefined) summary[key] = record[key];
    }
    return summary;
  }
  return { valueType: typeof value };
}
