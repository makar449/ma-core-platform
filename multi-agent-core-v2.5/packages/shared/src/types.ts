import { z } from "zod";

export const ExchangeSchema = z.enum(["BINANCE", "BYBIT"]);
export type Exchange = z.infer<typeof ExchangeSchema>;

export const HttpUrlSchema = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}, "URL must use http or https protocol");
export type HttpUrl = z.infer<typeof HttpUrlSchema>;

export const AgentNameSchema = z.enum([
  "Agent_1_Market_Analyst",
  "Agent_2_Strategist",
  "Agent_3_Executor",
  "Agent_4_Risk_Manager_A",
  "Agent_5_Risk_Manager_B",
  "Agent_6_Time_Manager",
  "System_Orchestrator",
  "Security_Vault"
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const TradingActionSchema = z.enum(["LONG", "SHORT", "FLAT", "NO_TRADE"]);
export type TradingAction = z.infer<typeof TradingActionSchema>;

export const TrendSchema = z.enum(["Bullish", "Bearish", "Sideways"]);
export type Trend = z.infer<typeof TrendSchema>;

export const VolatilitySchema = z.enum(["High", "Low"]);
export type Volatility = z.infer<typeof VolatilitySchema>;

export const TimeframeSchema = z.enum(["1m", "5m", "15m", "1h"]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const TechnicalIndicatorSchema = z.object({
  rsi: z.number().min(0).max(100),
  macd: z.number(),
  macdSignal: z.number(),
  ema20: z.number().positive(),
  ema50: z.number().positive(),
  ema200: z.number().positive(),
  bollingerUpper: z.number().positive(),
  bollingerMiddle: z.number().positive(),
  bollingerLower: z.number().positive()
});
export type TechnicalIndicator = z.infer<typeof TechnicalIndicatorSchema>;

export const DataQualitySchema = z.object({
  source: z.enum(["WEBSOCKET", "REST_BACKFILL", "MIXED", "STALE"]),
  latencyMs: z.number().int().nonnegative(),
  stale: z.boolean(),
  missing: z.array(z.string().min(1)).max(24)
});
export type DataQuality = z.infer<typeof DataQualitySchema>;

export const AdapterStatusSchema = z.object({
  exchange: ExchangeSchema,
  pair: z.string().min(3).max(32),
  connected: z.boolean(),
  reconnecting: z.boolean(),
  stale: z.boolean(),
  lastMessageAt: z.string().datetime().nullable(),
  lastRestBackfillAt: z.string().datetime().nullable(),
  missingFields: z.array(z.string()).max(24),
  errorReason: z.string().nullable(),
  reconnectAttempts: z.number().int().nonnegative()
});
export type AdapterStatus = z.infer<typeof AdapterStatusSchema>;

export const MarketSnapshotSchema = z.object({
  exchange: ExchangeSchema,
  pair: z.string().min(3).max(32),
  price: z.number().positive(),
  spreadBps: z.number().min(0),
  orderbookImbalance: z.number().min(-1).max(1),
  volume24h: z.number().nonnegative(),
  fundingRate: z.number(),
  openInterest: z.number().nonnegative(),
  liquidations1h: z.number().nonnegative(),
  indicators: z.record(TimeframeSchema, TechnicalIndicatorSchema),
  dataQuality: DataQualitySchema,
  observedAt: z.string().datetime()
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const MarketVectorSchema = z.object({
  exchange: ExchangeSchema,
  pair: z.string().min(3).max(32),
  trend: TrendSchema,
  volatility: VolatilitySchema,
  anomalies: z.array(z.string().min(2)).max(12),
  keyLevels: z.object({
    support: z.number().positive(),
    resistance: z.number().positive()
  }),
  fundingRate: z.number(),
  orderbookImbalance: z.number().min(-1).max(1),
  dominantTimeframe: TimeframeSchema,
  technicalSummary: z.record(TimeframeSchema, TechnicalIndicatorSchema),
  confidenceScore: z.number().min(0).max(1),
  dataQuality: DataQualitySchema.optional(),
  generatedAt: z.string().datetime()
});
export type MarketVector = z.infer<typeof MarketVectorSchema>;

export const SourceTypeSchema = z.enum(["YOUTUBE", "X", "REDDIT", "INTERNAL_SEED"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const StrategyReviewStatusSchema = z.enum(["ACCEPTED", "QUARANTINED", "REJECTED"]);
export type StrategyReviewStatus = z.infer<typeof StrategyReviewStatusSchema>;

export const EvidenceScoreSchema = z.object({
  trigger: z.number().min(0).max(1),
  invalidation: z.number().min(0).max(1),
  stopLoss: z.number().min(0).max(1),
  timeframe: z.number().min(0).max(1),
  riskReward: z.number().min(0).max(1),
  aggregate: z.number().min(0).max(1)
});
export type EvidenceScore = z.infer<typeof EvidenceScoreSchema>;

export const StrategyRuleSchema = z.object({
  id: z.string().min(8),
  sourceType: SourceTypeSchema,
  sourceId: z.string().min(1),
  sourceUrl: HttpUrlSchema.optional(),
  sourceTitle: z.string().min(1),
  extractedText: z.string().min(1),
  trigger: z.string().min(3),
  action: TradingActionSchema,
  target: z.string().min(1),
  timeframe: TimeframeSchema,
  marketRegime: z.object({
    trend: TrendSchema.optional(),
    volatility: VolatilitySchema.optional(),
    rsiZone: z.enum(["Oversold", "Neutral", "Overbought"]).optional()
  }),
  riskNotes: z.array(z.string()).max(10),
  confidenceScore: z.number().min(0).max(1),
  sourceTrustScore: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  evidenceScore: EvidenceScoreSchema.default({ trigger: 0.5, invalidation: 0, stopLoss: 0, timeframe: 0.5, riskReward: 0, aggregate: 0.2 }),
  reviewStatus: StrategyReviewStatusSchema.default("ACCEPTED"),
  reviewReason: z.string().min(1).default("Strategy passed baseline validation."),
  embedding: z.array(z.number()).min(8),
  embeddingModel: z.string().min(1).default("deterministic-local-v1"),
  embeddingDimensions: z.number().int().positive().default(64),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime()
});
export type StrategyRule = z.infer<typeof StrategyRuleSchema>;


export const TradeDirectionSchema = z.enum(["LONG", "SHORT"]);
export type TradeDirection = z.infer<typeof TradeDirectionSchema>;

export const OrderTypeSchema = z.enum(["MARKET", "LIMIT"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const PositionStatusSchema = z.enum([
  "OPENING",
  "OPENED",
  "FORCE_CLOSE_REQUESTED",
  "CLOSE_SUBMITTED",
  "CLOSE_CONFIRMED",
  "CLOSE_FAILED_RETRYING",
  "CLOSED_BY_TP",
  "CLOSED_BY_SL",
  "CLOSED_BY_TIMEOUT",
  "CLOSED_BY_RISK_HALT",
  "CLOSED_MANUALLY",
  "REJECTED_BY_SLIPPAGE",
  "REJECTED_BY_BALANCE",
  "REJECTED_BY_LOCK",
  "REJECTED_BY_VALIDATION",
  "REJECTED_BY_STALE_MARKET_DATA",
  "REJECTED_BY_SYMBOL_RULES",
  "REJECTED_BY_DUPLICATE_SIGNAL",
  "FAILED_EXCHANGE",
  "FAILED_PROTECTION",
  "ROLLBACK_IN_PROGRESS",
  "ROLLBACK_FAILED",
  "ROLLBACK_COMPLETED"
]);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const ExecutionStatusSchema = z.enum([
  "RECEIVED",
  "VALIDATING_SIGNAL",
  "CHECKING_LOCKS",
  "FETCHING_BALANCE",
  "FETCHING_ORDERBOOK",
  "CALCULATING_SIZE",
  "CHECKING_SLIPPAGE",
  "SETTING_LEVERAGE",
  "SUBMITTING_ENTRY",
  "WAITING_FOR_FILL",
  "ATTACHING_PROTECTION",
  "VALIDATED",
  "REJECTED_BY_LOCK",
  "REJECTED_BY_BALANCE",
  "REJECTED_BY_SLIPPAGE",
  "REJECTED_BY_VALIDATION",
  "REJECTED_BY_STALE_MARKET_DATA",
  "REJECTED_BY_SYMBOL_RULES",
  "REJECTED_BY_DUPLICATE_SIGNAL",
  "SUBMITTED",
  "OPENED",
  "FAILED_EXCHANGE",
  "FAILED_PROTECTION",
  "ROLLBACK_IN_PROGRESS",
  "ROLLBACK_FAILED",
  "ROLLBACK_COMPLETED",
  "PAPER_OPENED",
  "FORCE_CLOSED"
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const RiskLockReasonSchema = z.enum(["NONE", "EMERGENCY_HALT", "PROFIT_CAP_REACHED", "MANUAL_LOCK", "SYSTEM_FAILURE"]);
export type RiskLockReason = z.infer<typeof RiskLockReasonSchema>;

export const SystemHealthSchema = z.enum(["NORMAL", "PROFIT_CAP_LOCK", "EMERGENCY_HALT", "EXPOSURE_UNCONFIRMED", "PROTECTION_MISSING", "SYSTEM_FAILURE"]);
export type SystemHealth = z.infer<typeof SystemHealthSchema>;

export const ExecutionModeSchema = z.enum(["DISABLED", "PAPER", "LIVE", "BYBIT_TESTNET", "BINANCE_FUTURES_TESTNET"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const SymbolTradingRuleSchema = z.object({
  id: z.string().min(8),
  exchange: ExchangeSchema,
  pair: z.string().min(3).max(32),
  symbol: z.string().min(3).max(32),
  minQty: z.number().positive(),
  maxQty: z.number().positive(),
  qtyStep: z.number().positive(),
  tickSize: z.number().positive(),
  minNotional: z.number().nonnegative(),
  maxNotional: z.number().positive().nullable(),
  maxLeverage: z.number().int().positive(),
  contractSize: z.number().positive(),
  marginAsset: z.string().min(2).max(12),
  status: z.enum(["TRADING", "SETTLING", "DISABLED"]),
  reduceOnlySupported: z.boolean(),
  updatedAt: z.string().datetime()
}).refine((rule) => rule.minQty <= rule.maxQty, "minQty must be lower than maxQty");
export type SymbolTradingRule = z.infer<typeof SymbolTradingRuleSchema>;

export const RiskAmountPreviewSchema = z.object({
  grossRiskUsdt: z.number().nonnegative(),
  feesEstimateUsdt: z.number().nonnegative(),
  slippageReserveUsdt: z.number().nonnegative(),
  netRiskUsdt: z.number().nonnegative(),
  marginRequiredUsdt: z.number().nonnegative(),
  liquidationBufferPct: z.number().nonnegative(),
  estimatedNotionalUsdt: z.number().nonnegative()
});
export type RiskAmountPreview = z.infer<typeof RiskAmountPreviewSchema>;

export const ExecutionStepSchema = z.object({
  name: ExecutionStatusSchema,
  status: z.enum(["PENDING", "RUNNING", "PASSED", "REJECTED", "FAILED", "COMPENSATED"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  latencyMs: z.number().int().nonnegative(),
  message: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const RiskPolicySchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  maxDailyDrawdownRatio: z.number().positive().max(0.05),
  dailyProfitCapRatio: z.number().positive().max(0.25),
  riskPerTradeFraction: z.number().positive().max(0.01),
  maxOpenPositions: z.number().int().min(1).max(20),
  maxDailyTrades: z.number().int().min(1).max(200),
  maxSymbolExposureRatio: z.number().positive().max(0.5),
  maxAccountExposureRatio: z.number().positive().max(1),
  maxSpreadBps: z.number().positive().max(200),
  maxOrderbookAgeMs: z.number().int().positive().max(30000),
  requirePrivateStreamForLive: z.boolean(),
  requireSymbolRulesForLive: z.boolean(),
  updatedAt: z.string().datetime()
});
export type RiskPolicy = z.infer<typeof RiskPolicySchema>;



export const PrivateStreamStatusSchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  exchange: ExchangeSchema,
  streamType: z.enum(["ORDER", "EXECUTION", "POSITION", "COMBINED"]),
  status: z.enum(["CONNECTING", "HEALTHY", "STALE", "RECONNECTING", "DISCONNECTED", "FAILED"]),
  lastMessageAt: z.string().datetime().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  reconnectAttempts: z.number().int().nonnegative(),
  errorReason: z.string().nullable(),
  updatedAt: z.string().datetime()
});
export type PrivateStreamStatus = z.infer<typeof PrivateStreamStatusSchema>;

export const OrderLifecycleStatusSchema = z.enum([
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_REQUESTED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
  "FAILED",
  "UNKNOWN_RECONCILIATION_REQUIRED"
]);
export type OrderLifecycleStatus = z.infer<typeof OrderLifecycleStatusSchema>;

export const LiveReadinessStatusSchema = z.enum(["PENDING", "PASSED", "FAILED", "WAIVED"]);
export type LiveReadinessStatus = z.infer<typeof LiveReadinessStatusSchema>;

export const LiveReadinessCheckSchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  checkKey: z.string().min(3),
  status: LiveReadinessStatusSchema,
  message: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  checkedAt: z.string().datetime()
});
export type LiveReadinessCheck = z.infer<typeof LiveReadinessCheckSchema>;

export const ReconciliationMismatchSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  mismatchType: z.enum(["EXCHANGE_RECONCILIATION_MISMATCH", "PROTECTION_ORDER_MISSING", "POSITION_SIZE_MISMATCH", "POSITION_NOT_FOUND_ON_EXCHANGE", "UNKNOWN_EXCHANGE_POSITION", "ORDER_NOT_FOUND_ON_EXCHANGE", "UNKNOWN_EXCHANGE_ORDER", "REALIZED_PNL_MISMATCH"]),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type ReconciliationMismatch = z.infer<typeof ReconciliationMismatchSchema>;

export const ReconciliationRunSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  exchange: ExchangeSchema,
  status: z.enum(["MATCHED", "MISMATCH", "EXCHANGE_UNAVAILABLE", "SKIPPED_NO_CREDENTIALS"]),
  internalOpenPositions: z.number().int().nonnegative(),
  exchangeOpenPositions: z.number().int().nonnegative(),
  internalOpenOrders: z.number().int().nonnegative(),
  exchangeOpenOrders: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime()
});
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;

export const IncomingSignalPayloadSchema = z.object({
  transactionId: z.string().min(8),
  timestamp: z.string().datetime(),
  pair: z.string().min(3).max(32),
  direction: TradeDirectionSchema,
  leverage: z.number().int().min(1).max(20),
  entryPriceRange: z.object({
    min: z.number().positive(),
    max: z.number().positive()
  }).refine((range) => range.min < range.max, "entryPriceRange.min must be lower than entryPriceRange.max"),
  suggestedStopLoss: z.number().positive(),
  suggestedTakeProfit: z.number().positive(),
  confidenceScore: z.number().min(0).max(1),
  strategySource: z.string().min(1)
}).superRefine((payload, ctx) => {
  if (payload.direction === "LONG") {
    if (payload.suggestedStopLoss >= payload.entryPriceRange.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suggestedStopLoss"], message: "LONG stop loss must be below entry range" });
    }
    if (payload.suggestedTakeProfit <= payload.entryPriceRange.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suggestedTakeProfit"], message: "LONG take profit must be above entry range" });
    }
  }
  if (payload.direction === "SHORT") {
    if (payload.suggestedStopLoss <= payload.entryPriceRange.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suggestedStopLoss"], message: "SHORT stop loss must be above entry range" });
    }
    if (payload.suggestedTakeProfit >= payload.entryPriceRange.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suggestedTakeProfit"], message: "SHORT take profit must be below entry range" });
    }
  }
});
export type IncomingSignalPayload = z.infer<typeof IncomingSignalPayloadSchema>;

export const CalculatedOrderParametersSchema = z.object({
  pair: z.string().min(3).max(32),
  side: z.enum(["Buy", "Sell"]),
  orderType: OrderTypeSchema,
  qty: z.number().positive(),
  leverage: z.number().int().min(1).max(20),
  price: z.number().positive().nullable(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive()
});
export type CalculatedOrderParameters = z.infer<typeof CalculatedOrderParametersSchema>;

export const ExecutionDecisionSchema = z.object({
  id: z.string().min(8),
  transactionId: z.string().min(8),
  userId: z.string().uuid(),
  exchange: ExchangeSchema,
  signal: IncomingSignalPayloadSchema,
  status: ExecutionStatusSchema,
  order: CalculatedOrderParametersSchema.optional(),
  availableBalanceUsdt: z.number().nonnegative().optional(),
  equityUsdt: z.number().nonnegative().optional(),
  riskAmountUsdt: z.number().nonnegative().optional(),
  riskPreview: RiskAmountPreviewSchema.optional(),
  symbolRule: SymbolTradingRuleSchema.optional(),
  marketPrice: z.number().positive().optional(),
  exchangeOrderId: z.string().optional(),
  exchangePositionId: z.string().optional(),
  rejectionReason: z.string().optional(),
  stateMachine: z.array(ExecutionStepSchema).default([]),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});
export type ExecutionDecision = z.infer<typeof ExecutionDecisionSchema>;

export const DailyRiskStateSchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  equityAtStartOfDay: z.number().positive(),
  currentEquity: z.number().nonnegative(),
  realizedPnLToday: z.number(),
  unrealizedPnLToday: z.number(),
  drawdownRatio: z.number().min(0),
  profitRatio: z.number(),
  riskLockActive: z.boolean().default(false),
  profitLockActive: z.boolean().default(false),
  riskLockUntil: z.string().datetime().nullable().default(null),
  profitLockUntil: z.string().datetime().nullable().default(null),
  systemHealth: SystemHealthSchema.default("NORMAL"),
  isLocked: z.boolean(),
  lockReason: RiskLockReasonSchema,
  lockUntil: z.string().datetime().nullable(),
  updatedAt: z.string().datetime()
});
export type DailyRiskState = z.infer<typeof DailyRiskStateSchema>;

export const ActivePositionChronologySchema = z.object({
  positionId: z.string().uuid(),
  exchangePositionId: z.string().min(1),
  pair: z.string().min(3).max(32),
  openedAt: z.string().datetime(),
  elapsedMinutes: z.number().nonnegative(),
  minutesUntilWarning: z.number(),
  minutesUntilForcedClose: z.number(),
  warningSentAt: z.string().datetime().nullable().default(null),
  forceCloseRequestedAt: z.string().datetime().nullable().default(null),
  forceCloseConfirmedAt: z.string().datetime().nullable().default(null),
  status: PositionStatusSchema
});
export type ActivePositionChronology = z.infer<typeof ActivePositionChronologySchema>;

export const PositionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  exchange: ExchangeSchema,
  exchangePositionId: z.string().min(1),
  pair: z.string().min(3).max(32),
  direction: TradeDirectionSchema,
  leverage: z.number().int().min(1).max(20),
  volume: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLossPrice: z.number().positive(),
  takeProfitPrice: z.number().positive(),
  status: PositionStatusSchema,
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  realizedPnL: z.number().nullable(),
  closeRequestedAt: z.string().datetime().nullable().default(null),
  closeConfirmedAt: z.string().datetime().nullable().default(null),
  warningSentAt: z.string().datetime().nullable().default(null),
  forceCloseRequestedAt: z.string().datetime().nullable().default(null),
  forceCloseConfirmedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Position = z.infer<typeof PositionSchema>;

export const TradeSignalSchema = z.object({
  id: z.string().min(8),
  transactionId: z.string().min(8),
  userId: z.string().min(1).optional(),
  pair: z.string().min(3).max(32),
  action: TradingActionSchema,
  leverage: z.number().int().min(1).max(20),
  strategySource: z.string().min(1),
  strategyId: z.string().min(8),
  confidenceScore: z.number().min(0).max(1),
  rationale: z.string().min(10),
  technicalIndicators: z.object({
    rsi5m: z.number().min(0).max(100),
    fundingRate: z.number(),
    orderbookImbalance: z.number().min(-1).max(1)
  }),
  entryPriceRange: z.object({ min: z.number().positive(), max: z.number().positive() }).optional(),
  suggestedStopLoss: z.number().positive().optional(),
  suggestedTakeProfit: z.number().positive().optional(),
  createdAt: z.string().datetime()
});
export type TradeSignal = z.infer<typeof TradeSignalSchema>;

export const SafeModeTriggerSchema = z.enum([
  "PRIVATE_STREAM_LOST",
  "STALE_MARKET_DATA",
  "REDIS_STREAM_LAG",
  "DATABASE_LATENCY_SPIKE",
  "PROTECTION_ORDER_MISSING",
  "RECONCILIATION_FAILED",
  "VAULT_DECRYPT_FAILED",
  "EXCHANGE_API_INSTABILITY",
  "MANUAL_OPERATOR_LOCK"
]);
export type SafeModeTrigger = z.infer<typeof SafeModeTriggerSchema>;

export const SafeModeEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  triggerType: SafeModeTriggerSchema,
  severity: z.enum(["info", "warning", "critical"]),
  active: z.boolean(),
  reason: z.string().min(1),
  recoveryChecklist: z.array(z.string().min(1)).max(32),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  activatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable()
});
export type SafeModeEvent = z.infer<typeof SafeModeEventSchema>;

export const OperationsHealthSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  accountId: z.string().uuid().nullable(),
  healthStatus: z.enum(["NORMAL", "DEGRADED", "SAFE_MODE", "CRITICAL"]),
  agentHealth: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  infrastructureHealth: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  exchangeHealth: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  riskHealth: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  latency: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.string().datetime()
});
export type OperationsHealthSnapshot = z.infer<typeof OperationsHealthSnapshotSchema>;

export const PortfolioAssetExposureSchema = z.object({
  asset: z.string().min(2).max(16),
  notionalUsdt: z.number().nonnegative(),
  allocationRatio: z.number().min(0).max(1),
  riskContributionRatio: z.number().min(0).max(1)
});
export type PortfolioAssetExposure = z.infer<typeof PortfolioAssetExposureSchema>;

export const PortfolioSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  totalEquityUsdt: z.number().nonnegative(),
  realizedPnlUsdt: z.number(),
  unrealizedPnlUsdt: z.number(),
  capitalAtRiskUsdt: z.number().nonnegative(),
  exposureByAsset: z.array(PortfolioAssetExposureSchema).max(64),
  leverageHeatmap: z.array(z.object({ pair: z.string().min(3), leverage: z.number().nonnegative(), notionalUsdt: z.number().nonnegative() })).max(128),
  drawdownHistory: z.array(z.object({ at: z.string().datetime(), drawdownRatio: z.number().min(0) })).max(512),
  allocation: z.array(z.object({ label: z.string().min(1), valueUsdt: z.number().nonnegative(), ratio: z.number().min(0).max(1) })).max(64),
  createdAt: z.string().datetime()
});
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

export const ForensicTimelineEventSchema = z.object({
  stage: z.string().min(1),
  status: z.enum(["PENDING", "PASSED", "FAILED", "WARNING"]),
  timestamp: z.string().datetime(),
  latencyMs: z.number().int().nonnegative(),
  message: z.string().min(1),
  evidenceRef: z.string().min(1).optional()
});
export type ForensicTimelineEvent = z.infer<typeof ForensicTimelineEventSchema>;

export const ForensicAuditCaseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  executionId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  signalTransactionId: z.string().nullable(),
  caseStatus: z.enum(["OPEN", "REVIEWED", "EXPORTED"]),
  timeline: z.array(ForensicTimelineEventSchema).max(128),
  evidence: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ForensicAuditCase = z.infer<typeof ForensicAuditCaseSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  requestType: z.enum(["LIVE_ENABLE", "MANUAL_ORDER", "RISK_OVERRIDE", "MODE_CHANGE"]),
  modeRequested: z.enum(["OBSERVE_ONLY", "SUGGEST_ONLY", "APPROVAL_REQUIRED", "PAPER_AUTO", "TESTNET_AUTO", "LIVE_AUTO"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELED"]),
  reason: z.string().min(1),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  expiresAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const DisasterRecoveryRunSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  accountId: z.string().uuid().nullable(),
  runType: z.enum(["BACKUP_VERIFY", "REDIS_OUTAGE_DRILL", "EXCHANGE_OUTAGE_DRILL", "VAULT_OUTAGE_DRILL", "READ_ONLY_MODE_DRILL"]),
  status: z.enum(["PENDING", "RUNNING", "PASSED", "FAILED"]),
  steps: z.array(z.object({ label: z.string().min(1), status: z.enum(["PENDING", "PASSED", "FAILED"]), message: z.string().min(1) })).max(64),
  evidence: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable()
});
export type DisasterRecoveryRun = z.infer<typeof DisasterRecoveryRunSchema>;

export const ComplianceAcceptanceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  policyKey: z.enum(["risk_disclosure", "terms", "live_trading_consent", "api_permission_warning", "jurisdiction_warning", "suitability_questionnaire"]),
  version: z.string().min(1),
  accepted: z.boolean(),
  acceptedAt: z.string().datetime()
});
export type ComplianceAcceptance = z.infer<typeof ComplianceAcceptanceSchema>;

export const TestEvidenceReportSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  reportType: z.enum(["CI", "DOCKER", "E2E", "TESTNET", "SECURITY", "LOAD"]),
  status: z.enum(["PENDING", "PASSED", "FAILED"]),
  summary: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  artifacts: z.array(z.object({ label: z.string().min(1), kind: z.string().min(1), path: z.string().min(1) })).max(64),
  generatedAt: z.string().datetime()
});
export type TestEvidenceReport = z.infer<typeof TestEvidenceReportSchema>;

export const LiveReadinessWizardStepSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["PENDING", "PASSED", "FAILED", "BLOCKED"]),
  message: z.string().min(1),
  required: z.boolean()
});
export type LiveReadinessWizardStep = z.infer<typeof LiveReadinessWizardStepSchema>;

export const LiveReadinessWizardRunSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PASSED"]),
  currentStep: z.string().min(1),
  steps: z.array(LiveReadinessWizardStepSchema).max(32),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type LiveReadinessWizardRun = z.infer<typeof LiveReadinessWizardRunSchema>;
