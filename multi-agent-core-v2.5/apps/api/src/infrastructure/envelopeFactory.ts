import { nanoid } from "nanoid";
import type { AgentName, EventChannel, PipelineStage } from "@ma-core/shared";

export interface EnvelopeBaseInput {
  readonly transactionId?: string;
  readonly traceId?: string;
  readonly senderAgent: AgentName;
  readonly targetAgent?: AgentName;
  readonly channel: EventChannel;
  readonly pipelineStage: PipelineStage;
  readonly agentLog: string;
  readonly idempotencyScope?: string;
  readonly userId?: string | undefined;
}

export interface EnvelopeBaseOutput {
  readonly schema_version: "1.3";
  readonly transaction_id: string;
  readonly trace_id: string;
  readonly timestamp: string;
  readonly sender_agent: AgentName;
  readonly target_agent?: AgentName;
  readonly channel: EventChannel;
  readonly pipeline_stage: PipelineStage;
  readonly idempotency_key: string;
  readonly agent_log: string;
  readonly user_id?: string;
}

export function buildEnvelopeBase(input: EnvelopeBaseInput): EnvelopeBaseOutput {
  const transactionId = input.transactionId ?? `tx_${nanoid(18)}`;
  const traceId = input.traceId ?? `trace_${nanoid(18)}`;
  const idempotencyScope = input.idempotencyScope ?? `${input.channel}:${transactionId}`;
  const base = {
    schema_version: "1.3",
    transaction_id: transactionId,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    sender_agent: input.senderAgent,
    channel: input.channel,
    pipeline_stage: input.pipelineStage,
    idempotency_key: `idem_${nanoid(10)}_${Buffer.from(idempotencyScope).toString("base64url").slice(0, 48)}`,
    agent_log: input.agentLog
  } satisfies Omit<EnvelopeBaseOutput, "target_agent" | "user_id">;
  const withTarget = input.targetAgent ? { ...base, target_agent: input.targetAgent } : base;
  return input.userId ? { ...withTarget, user_id: input.userId } : withTarget;
}
