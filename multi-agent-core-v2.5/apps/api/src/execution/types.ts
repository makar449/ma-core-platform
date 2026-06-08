import type { CalculatedOrderParameters, Exchange, Position, SymbolTradingRule, TradeDirection } from "@ma-core/shared";
import type { ExchangeSecretPayload } from "../security/vault.js";

export interface AccountBalanceSnapshot {
  readonly availableBalanceUsdt: number;
  readonly totalEquityUsdt: number;
  readonly realizedPnlToday: number;
  readonly unrealizedPnlToday: number;
}

export interface TopOfBook {
  readonly bid: number;
  readonly ask: number;
  readonly observedAt: string;
  readonly bidSize?: number;
  readonly askSize?: number;
}

export interface ExchangeOrderPlacementResult {
  readonly exchangeOrderId: string;
  readonly exchangePositionId: string;
  readonly filledPrice: number;
  readonly filledQty: number;
  readonly protectionAttached: boolean;
  readonly raw: Record<string, unknown>;
}

export interface ExchangeCloseResult {
  readonly exchangePositionId: string;
  readonly realizedPnl: number | null;
  readonly raw: Record<string, unknown>;
}

export interface ExchangePositionSnapshot {
  readonly exchangePositionId: string;
  readonly pair: string;
  readonly direction: "LONG" | "SHORT";
  readonly volume: number;
  readonly averageEntryPrice: number;
  readonly markPrice: number | null;
  readonly liquidationPrice: number | null;
  readonly unrealizedPnl: number | null;
  readonly raw: Record<string, unknown>;
}

export interface ExchangeOpenOrderSnapshot {
  readonly exchangeOrderId: string;
  readonly pair: string;
  readonly side: string;
  readonly orderType: string;
  readonly orderRole: "ENTRY" | "STOP_LOSS" | "TAKE_PROFIT" | "UNKNOWN";
  readonly qty: number;
  readonly price: number | null;
  readonly triggerPrice: number | null;
  readonly reduceOnly: boolean;
  readonly status: string;
  readonly raw: Record<string, unknown>;
}

export interface ProtectiveOrderStatus {
  readonly hasStopLoss: boolean;
  readonly hasTakeProfit: boolean;
  readonly qtyMatches: boolean;
  readonly sideMatches: boolean;
  readonly triggerPriceMatches: boolean;
  readonly raw: Record<string, unknown>;
}

export interface ExchangeExecutionClient {
  readonly exchange: Exchange;
  getBalance(credentials: ExchangeSecretPayload): Promise<AccountBalanceSnapshot>;
  getTopOfBook(pair: string): Promise<TopOfBook>;
  getSymbolRules?(credentials: ExchangeSecretPayload, pair: string): Promise<SymbolTradingRule>;
  getRealizedPnlToday?(credentials: ExchangeSecretPayload): Promise<number | null>;
  hasHealthyPrivateStream?(credentials: ExchangeSecretPayload): Promise<boolean>;
  listExchangePositions?(credentials: ExchangeSecretPayload): Promise<ExchangePositionSnapshot[]>;
  listOpenOrders?(credentials: ExchangeSecretPayload, pair?: string): Promise<ExchangeOpenOrderSnapshot[]>;
  getProtectiveOrderStatus?(credentials: ExchangeSecretPayload, position: Position): Promise<ProtectiveOrderStatus>;
  setLeverage(credentials: ExchangeSecretPayload, pair: string, leverage: number, direction: TradeDirection): Promise<void>;
  placeBracketOrder(credentials: ExchangeSecretPayload, order: CalculatedOrderParameters): Promise<ExchangeOrderPlacementResult>;
  cancelAllOrders(credentials: ExchangeSecretPayload, pair?: string): Promise<Record<string, unknown>>;
  closeAllPositions(credentials: ExchangeSecretPayload): Promise<ExchangeCloseResult[]>;
  closePosition(credentials: ExchangeSecretPayload, position: Position): Promise<ExchangeCloseResult>;
}

export interface ExecutionClock {
  now(): Date;
}

export const systemClock: ExecutionClock = {
  now(): Date {
    return new Date();
  }
};
