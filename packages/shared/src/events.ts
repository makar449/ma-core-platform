import { z } from "zod";
import { AgentNameSchema, CalculatedOrderParametersSchema, DailyRiskStateSchema, ExecutionDecisionSchema, HttpUrlSchema, MarketVectorSchema, PositionSchema, TradeSignalSchema } from "./types.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(JsonValueSchema)
]));

export const EventChannelSchema = z.enum([
  "agent.market.vector",
  "agent.strategy.signal",
  "agent.execution.order",
  "agent.execution.status",
  "agent.risk.state",
  "agent.risk.halt",
  "agent.position.timeout",
  "agent.strategy.feed",
  "agent.live.log",
  "security.audit"
]);
export type EventChannel = z.infer<typeof EventChannelSchema>;

export const PipelineStageSchema = z.enum([
  "market_analysis",
  "strategy_ingestion",
  "strategy_matching",
  "signal_generation",
  "order_execution",
  "risk_drawdown_guard",
  "risk_profit_guard",
  "time_horizon_guard",
  "security_audit",
  "live_log"
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const BaseEnvelopeSchema = z.object({
  schema_version: z.literal("1.3"),
  transaction_id: z.string().min(8),
  trace_id: z.string().min(8),
  timestamp: z.string().datetime(),
  sender_agent: AgentNameSchema,
  target_agent: AgentNameSchema.optional(),
  channel: EventChannelSchema,
  pipeline_stage: PipelineStageSchema,
  idempotency_key: z.string().min(12),
  agent_log: z.string().min(1),
  user_id: z.string().uuid().optional()
});

export const MarketVectorEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.market.vector"),
  pipeline_stage: z.literal("market_analysis"),
  sender_agent: z.literal("Agent_1_Market_Analyst"),
  target_agent: z.literal("Agent_2_Strategist"),
  payload: MarketVectorSchema
});

export const TradeSignalEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.strategy.signal"),
  pipeline_stage: z.literal("signal_generation"),
  sender_agent: z.literal("Agent_2_Strategist"),
  target_agent: z.literal("Agent_3_Executor"),
  payload: TradeSignalSchema
});

export const LiveLogEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.live.log"),
  pipeline_stage: z.literal("live_log"),
  payload: z.object({
    severity: z.enum(["debug", "info", "warn", "error"]),
    message: z.string().min(1),
    metadata: z.record(JsonValueSchema).optional()
  })
});

export const StrategyFeedEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.strategy.feed"),
  pipeline_stage: z.literal("strategy_ingestion"),
  sender_agent: z.literal("Agent_2_Strategist"),
  payload: z.object({
    sourceType: z.enum(["YOUTUBE", "X", "REDDIT", "INTERNAL_SEED"]),
    sourceTitle: z.string(),
    sourceUrl: HttpUrlSchema.optional(),
    trigger: z.string(),
    action: z.string(),
    confidenceScore: z.number().min(0).max(1),
    sourceTrustScore: z.number().min(0).max(1),
    freshnessScore: z.number().min(0).max(1),
    evidenceScore: z.number().min(0).max(1),
    reviewStatus: z.enum(["ACCEPTED", "QUARANTINED", "REJECTED"]),
    reviewReason: z.string().min(1)
  })
});


export const ExecutionStatusEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.execution.status"),
  pipeline_stage: z.literal("order_execution"),
  sender_agent: z.literal("Agent_3_Executor"),
  payload: ExecutionDecisionSchema
});

export const ExecutionOrderEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.execution.order"),
  pipeline_stage: z.literal("order_execution"),
  sender_agent: z.literal("Agent_3_Executor"),
  payload: z.object({
    executionId: z.string().min(8),
    accountId: z.string().uuid(),
    userId: z.string().uuid(),
    exchange: z.enum(["BINANCE", "BYBIT"]),
    order: CalculatedOrderParametersSchema,
    status: z.enum(["SUBMITTED", "OPENED", "FAILED_EXCHANGE", "PAPER_OPENED"]),
    exchangeOrderId: z.string().optional(),
    exchangePositionId: z.string().optional(),
    latencyMs: z.number().int().nonnegative()
  })
});

export const RiskStateEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.risk.state"),
  pipeline_stage: z.union([z.literal("risk_drawdown_guard"), z.literal("risk_profit_guard")]),
  sender_agent: z.union([z.literal("Agent_4_Risk_Manager_A"), z.literal("Agent_5_Risk_Manager_B")]),
  payload: DailyRiskStateSchema
});

export const RiskHaltEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.risk.halt"),
  pipeline_stage: z.literal("risk_drawdown_guard"),
  sender_agent: z.literal("Agent_4_Risk_Manager_A"),
  target_agent: z.literal("Agent_3_Executor"),
  payload: z.object({
    userId: z.string().uuid(),
    accountId: z.string().uuid(),
    reason: z.literal("EMERGENCY_HALT"),
    drawdownRatio: z.number().min(0),
    lockUntil: z.string().datetime(),
    positionsToClose: z.array(PositionSchema).max(200)
  })
});

export const PositionTimeoutEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("agent.position.timeout"),
  pipeline_stage: z.literal("time_horizon_guard"),
  sender_agent: z.literal("Agent_6_Time_Manager"),
  target_agent: z.literal("Agent_3_Executor"),
  payload: z.object({
    type: z.enum(["POSITION_TIMEOUT_WARNING", "FORCE_CLOSE_TIMEOUT"]),
    position: PositionSchema,
    elapsedMinutes: z.number().nonnegative(),
    maxMinutes: z.number().positive()
  })
});

export const SecurityAuditEnvelopeSchema = BaseEnvelopeSchema.extend({
  channel: z.literal("security.audit"),
  pipeline_stage: z.literal("security_audit"),
  sender_agent: z.literal("Security_Vault"),
  payload: z.object({
    userId: z.string().min(1),
    exchange: z.string().min(1),
    status: z.enum(["ACCEPTED", "REJECTED"]),
    reason: z.string().min(1)
  })
});

export const AgentEnvelopeSchema = z.discriminatedUnion("channel", [
  MarketVectorEnvelopeSchema,
  TradeSignalEnvelopeSchema,
  ExecutionStatusEnvelopeSchema,
  ExecutionOrderEnvelopeSchema,
  RiskStateEnvelopeSchema,
  RiskHaltEnvelopeSchema,
  PositionTimeoutEnvelopeSchema,
  LiveLogEnvelopeSchema,
  StrategyFeedEnvelopeSchema,
  SecurityAuditEnvelopeSchema
]);
export type AgentEnvelope = z.infer<typeof AgentEnvelopeSchema>;
export type MarketVectorEnvelope = z.infer<typeof MarketVectorEnvelopeSchema>;
export type TradeSignalEnvelope = z.infer<typeof TradeSignalEnvelopeSchema>;
export type ExecutionStatusEnvelope = z.infer<typeof ExecutionStatusEnvelopeSchema>;
export type ExecutionOrderEnvelope = z.infer<typeof ExecutionOrderEnvelopeSchema>;
export type RiskStateEnvelope = z.infer<typeof RiskStateEnvelopeSchema>;
export type RiskHaltEnvelope = z.infer<typeof RiskHaltEnvelopeSchema>;
export type PositionTimeoutEnvelope = z.infer<typeof PositionTimeoutEnvelopeSchema>;
export type LiveLogEnvelope = z.infer<typeof LiveLogEnvelopeSchema>;
export type StrategyFeedEnvelope = z.infer<typeof StrategyFeedEnvelopeSchema>;
export type SecurityAuditEnvelope = z.infer<typeof SecurityAuditEnvelopeSchema>;
