import { nanoid } from "nanoid";
import { RiskHaltEnvelopeSchema, RiskStateEnvelopeSchema, type DailyRiskState } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { DailyRiskRepository } from "../repositories/dailyRiskRepository.js";
import type { TradingLockRepository } from "../repositories/tradingLockRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { RiskEventRepository } from "../repositories/riskEventRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import type { ApiWalletVault, EncryptedSecret } from "../security/vault.js";
import type { ExecutionExchangeRegistry } from "../execution/executionExchangeRegistry.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import { endOfUtcDay } from "../risk/riskTime.js";
import { logger } from "../infrastructure/logger.js";

export class DailyDrawdownGuardAgent {
  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly executionExchanges: ExecutionExchangeRegistry,
    private readonly risk: DailyRiskRepository,
    private readonly locks: TradingLockRepository,
    private readonly positions: PositionRepository,
    private readonly riskEvents: RiskEventRepository,
    private readonly incidents: IncidentRepository,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository,
    private readonly maxDrawdownRatio: number
  ) {}

  public async runOnce(): Promise<number> {
    const accounts = await this.accounts.listEnabled();
    let checked = 0;
    for (const account of accounts) {
      try {
        const stored = await this.apiKeys.find(account.userId, account.exchangeName);
        if (!stored) continue;
        const client = this.executionExchanges.get(account.exchangeName);
        const balance = await client.getBalance(this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName }));
        const state = await this.risk.upsertEquitySnapshot({ accountId: account.id, userId: account.userId, currentEquity: balance.totalEquityUsdt, realizedPnlToday: balance.realizedPnlToday, unrealizedPnlToday: balance.unrealizedPnlToday });
        await this.publishState(state);
        if (state.drawdownRatio >= this.maxDrawdownRatio && !state.riskLockActive) {
          await this.triggerEmergencyHalt(state);
        }
        checked += 1;
      } catch (error) {
        logger.error({ err: error, accountId: account.id }, "Daily drawdown guard failed for account");
        await this.incidents.create({ incidentType: "DRAWDOWN_GUARD_FAILED", severity: "critical", userId: account.userId, accountId: account.id, message: error instanceof Error ? error.message : "Unknown drawdown guard error", metadata: {} });
      }
    }
    return checked;
  }

  private async triggerEmergencyHalt(state: DailyRiskState): Promise<void> {
    const lockUntil = endOfUtcDay();
    await this.locks.activate({ userId: state.userId, accountId: state.accountId, lockType: "GLOBAL_TRADING_LOCK", reason: "EMERGENCY_HALT", lockUntil, metadata: { drawdownRatio: state.drawdownRatio, equityAtStart: state.equityAtStartOfDay, currentEquity: state.currentEquity } });
    await this.riskEvents.append({ userId: state.userId, accountId: state.accountId, eventType: "HALT_DETECTED", severity: "critical", message: `Emergency halt detected at ${(state.drawdownRatio * 100).toFixed(2)}% drawdown.`, metadata: { drawdownRatio: state.drawdownRatio } });
    const lockedState = await this.risk.markRiskLocked(state.accountId, state.userId, lockUntil);
    await this.publishState(lockedState);
    const positions = await this.positions.listOpenByAccount(state.accountId);
    const haltEnvelope = RiskHaltEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_4_Risk_Manager_A", targetAgent: "Agent_3_Executor", channel: "agent.risk.halt", pipelineStage: "risk_drawdown_guard", idempotencyScope: `${state.userId}:${state.accountId}:emergency:${lockUntil}`, agentLog: `EMERGENCY_HALT активирован: дневная просадка ${(state.drawdownRatio * 100).toFixed(2)}%.`, userId: state.userId }),
      payload: { userId: state.userId, accountId: state.accountId, reason: "EMERGENCY_HALT", drawdownRatio: state.drawdownRatio, lockUntil, positionsToClose: positions }
    });
    await this.events.insert(haltEnvelope, state.userId, "user");
    await this.bus.publish(haltEnvelope);
  }

  private async publishState(state: DailyRiskState): Promise<void> {
    const envelope = RiskStateEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_4_Risk_Manager_A", channel: "agent.risk.state", pipelineStage: "risk_drawdown_guard", idempotencyScope: `${state.userId}:${state.accountId}:drawdown:${state.updatedAt}`, agentLog: `Daily drawdown ${(state.drawdownRatio * 100).toFixed(2)}%, equity ${state.currentEquity.toFixed(2)} USDT.`, userId: state.userId }),
      payload: state
    });
    await this.events.insert(envelope, state.userId, "user");
    await this.bus.publish(envelope);
  }
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}
