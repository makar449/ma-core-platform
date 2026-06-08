import { CalculatedOrderParametersSchema, RiskAmountPreviewSchema, type CalculatedOrderParameters, type IncomingSignalPayload, type RiskAmountPreview, type SymbolTradingRule } from "@ma-core/shared";

export interface PositionSizingInput {
  readonly signal: IncomingSignalPayload;
  readonly totalEquityUsdt: number;
  readonly marketPrice: number;
  readonly riskFraction: number;
  readonly minNotionalUsdt: number;
  readonly quantityStep: number;
  readonly symbolRule?: SymbolTradingRule;
  readonly takerFeeRate?: number;
  readonly slippageReserveBps?: number;
}

export interface PositionSizingResult {
  readonly order: CalculatedOrderParameters;
  readonly preview: RiskAmountPreview;
}

export function calculateOrderParameters(input: PositionSizingInput): CalculatedOrderParameters {
  return calculateOrderParametersWithPreview(input).order;
}

export function calculateOrderParametersWithPreview(input: PositionSizingInput): PositionSizingResult {
  if (input.totalEquityUsdt <= 0) {
    throw new Error("Total equity must be positive before order sizing");
  }
  if (input.marketPrice <= 0) {
    throw new Error("Market price must be positive before order sizing");
  }
  const rule = input.symbolRule;
  if (rule && rule.status !== "TRADING") {
    throw new Error(`Symbol ${rule.pair} is not in TRADING status`);
  }
  const stopDistance = Math.abs(input.marketPrice - input.signal.suggestedStopLoss);
  if (stopDistance <= 0) {
    throw new Error("Stop loss distance must be positive");
  }
  const takerFeeRate = input.takerFeeRate ?? 0.0006;
  const slippageReserveBps = input.slippageReserveBps ?? 5;
  const grossRisk = input.totalEquityUsdt * input.riskFraction;
  const feeReserve = grossRisk * takerFeeRate * 2;
  const slippageReserve = grossRisk * slippageReserveBps / 10_000;
  const netRisk = Math.max(0, grossRisk - feeReserve - slippageReserve);
  const rawQty = netRisk / stopDistance;
  const minNotional = Math.max(input.minNotionalUsdt, rule?.minNotional ?? 0);
  const minQtyByNotional = minNotional / input.marketPrice;
  const step = rule?.qtyStep ?? input.quantityStep;
  const boundedQty = applySymbolBounds(Math.max(rawQty, minQtyByNotional), rule);
  const qty = roundToStep(boundedQty, step);
  if (qty <= 0) {
    throw new Error("Calculated order quantity is not positive after rounding");
  }
  const notional = qty * input.marketPrice * (rule?.contractSize ?? 1);
  if (rule?.maxNotional !== null && rule?.maxNotional !== undefined && notional > rule.maxNotional) {
    throw new Error(`Order notional ${notional.toFixed(4)} exceeds max notional ${rule.maxNotional.toFixed(4)}`);
  }
  if (rule && input.signal.leverage > rule.maxLeverage) {
    throw new Error(`Requested leverage ${input.signal.leverage} exceeds max leverage ${rule.maxLeverage}`);
  }
  const marginRequired = notional / Math.max(input.signal.leverage, 1);
  const liquidationBufferPct = Math.abs(input.marketPrice - input.signal.suggestedStopLoss) / input.marketPrice * 100;
  const preview = RiskAmountPreviewSchema.parse({
    grossRiskUsdt: grossRisk,
    feesEstimateUsdt: feeReserve,
    slippageReserveUsdt: slippageReserve,
    netRiskUsdt: netRisk,
    marginRequiredUsdt: marginRequired,
    liquidationBufferPct,
    estimatedNotionalUsdt: notional
  });
  const order = CalculatedOrderParametersSchema.parse({
    pair: input.signal.pair,
    side: input.signal.direction === "LONG" ? "Buy" : "Sell",
    orderType: "MARKET",
    qty,
    leverage: input.signal.leverage,
    price: null,
    stopLoss: roundPriceToTick(input.signal.suggestedStopLoss, rule?.tickSize),
    takeProfit: roundPriceToTick(input.signal.suggestedTakeProfit, rule?.tickSize)
  });
  return { order, preview };
}

export function isPriceInsideEntryRange(signal: IncomingSignalPayload, marketPrice: number): boolean {
  return marketPrice >= signal.entryPriceRange.min && marketPrice <= signal.entryPriceRange.max;
}

export function selectExecutableMarketPrice(direction: IncomingSignalPayload["direction"], bid: number, ask: number): number {
  return direction === "LONG" ? ask : bid;
}

export function spreadBps(bid: number, ask: number): number {
  const mid = (bid + ask) / 2;
  return mid > 0 ? (ask - bid) / mid * 10_000 : Number.POSITIVE_INFINITY;
}

export function orderbookAgeMs(observedAt: string, now: Date = new Date()): number {
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed) ? Math.max(0, now.getTime() - observed) : Number.POSITIVE_INFINITY;
}

function applySymbolBounds(value: number, rule: SymbolTradingRule | undefined): number {
  if (!rule) return value;
  return Math.min(Math.max(value, rule.minQty), rule.maxQty);
}

function roundToStep(value: number, step: number): number {
  const safeStep = step > 0 ? step : 0.001;
  const rounded = Math.floor(value / safeStep) * safeStep;
  return Number(rounded.toFixed(12));
}

function roundPriceToTick(value: number, tickSize: number | undefined): number {
  if (!tickSize || tickSize <= 0) return value;
  const rounded = Math.round(value / tickSize) * tickSize;
  return Number(rounded.toFixed(12));
}
