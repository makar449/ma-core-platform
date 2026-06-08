import { nanoid } from "nanoid";
import { PositionTimeoutEnvelopeSchema } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import { elapsedMinutesSince } from "../risk/riskTime.js";

export class TimeHorizonGuardAgent {
  public constructor(
    private readonly positions: PositionRepository,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository,
    private readonly warningMinutes: number,
    private readonly maxMinutes: number
  ) {}

  public async runOnce(): Promise<number> {
    const candidates = await this.positions.listTimeoutCandidates(this.warningMinutes);
    let emitted = 0;
    for (const candidate of candidates) {
      const elapsedMinutes = elapsedMinutesSince(candidate.position.openedAt);
      const type = elapsedMinutes >= this.maxMinutes ? "FORCE_CLOSE_TIMEOUT" : "POSITION_TIMEOUT_WARNING";
      if (type === "POSITION_TIMEOUT_WARNING" && candidate.warningSent) continue;
      if (type === "FORCE_CLOSE_TIMEOUT" && candidate.forceCloseRequested) continue;
      const recorded = await this.positions.recordTimeoutEvent(candidate.position.id, type, elapsedMinutes);
      if (!recorded) continue;
      const position = type === "FORCE_CLOSE_TIMEOUT" ? { ...candidate.position, status: "FORCE_CLOSE_REQUESTED" as const, forceCloseRequestedAt: new Date().toISOString() } : candidate.position;
      const envelope = PositionTimeoutEnvelopeSchema.parse({
        ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_6_Time_Manager", targetAgent: "Agent_3_Executor", channel: "agent.position.timeout", pipelineStage: "time_horizon_guard", idempotencyScope: `${position.id}:${type}`, agentLog: type === "FORCE_CLOSE_TIMEOUT" ? `Позиция ${position.pair} превысила лимит ${this.maxMinutes} минут и отправлена на закрытие.` : `Позиция ${position.pair} приближается к лимиту времени: ${elapsedMinutes.toFixed(1)} минут.`, userId: position.userId }),
        payload: { type, position, elapsedMinutes, maxMinutes: this.maxMinutes }
      });
      await this.events.insert(envelope, position.userId, "user");
      await this.bus.publish(envelope);
      emitted += 1;
    }
    return emitted;
  }
}
