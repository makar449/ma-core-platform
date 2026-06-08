import { nanoid } from "nanoid";
import { RiskStateEnvelopeSchema, type DailyRiskState } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { DailyRiskRepository } from "../repositories/dailyRiskRepository.js";
import type { TradingLockRepository } from "../repositories/tradingLockRepository.js";
import type { PnlRepository } from "../repositories/pnlRepository.js";
import type { RiskEventRepository } from "../repositories/riskEventRepository.js";
import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { ApiWalletVault, EncryptedSecret } from "../security/vault.js";
import type { ExecutionExchangeRegistry } from "../execution/executionExchangeRegistry.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import { endOfUtcDay } from "../risk/riskTime.js";
import { logger } from "../infrastructure/logger.js";

export class DailyProfitCapGuardAgent {
  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly executionExchanges: ExecutionExchangeRegistry,
    private readonly risk: DailyRiskRepository,
    private readonly locks: TradingLockRepository,
    private readonly pnl: PnlRepository,
    private readonly riskEvents: RiskEventRepository,
    private readonly bus: RedisMessageBus,
    private readonly events: EventLogRepository,
    private readonly profitCapRatio: number
  ) {}

  public async runOnce(): Promise<number> {
    const accounts = await this.accounts.listEnabled();
    let checked = 0;
    for (const account of accounts) {
      try {
        const stored = await this.apiKeys.find(account.userId, account.exchangeName);
        if (!stored) continue;
        const client = this.executionExchanges.get(account.exchangeName);
        const credentials = this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName });
        const [balance, internal] = await Promise.all([client.getBalance(credentials), this.pnl.realizedForUtcDay(account.id)]);
        const exchangePnl = client.getRealizedPnlToday ? await client.getRealizedPnlToday(credentials).catch(() => null) : null;
        await this.pnl.recordReconciliation({ userId: account.userId, accountId: account.id, internalRealizedPnl: internal.internalRealizedPnl, exchangeRealizedPnl: exchangePnl, status: exchangePnl === null ? "INTERNAL_ONLY" : Math.abs(exchangePnl - internal.internalRealizedPnl) < 0.01 ? "MATCHED" : "MISMATCH", metadata: { closedTrades: internal.closedTrades } });
        const realized = internal.internalRealizedPnl !== 0 ? internal.internalRealizedPnl : balance.realizedPnlToday;
        const state = await this.risk.upsertEquitySnapshot({ accountId: account.id, userId: account.userId, currentEquity: balance.totalEquityUsdt, realizedPnlToday: realized, unrealizedPnlToday: balance.unrealizedPnlToday });
        if (state.profitRatio >= this.profitCapRatio && !state.profitLockActive) {
          const lockUntil = endOfUtcDay();
          await this.locks.activate({ userId: account.userId, accountId: account.id, lockType: "NEW_DEALS_LOCK", reason: "PROFIT_CAP_REACHED", lockUntil, metadata: { profitRatio: state.profitRatio, closedTrades: internal.closedTrades } });
          await this.riskEvents.append({ userId: account.userId, accountId: account.id, eventType: "PROFIT_CAP_REACHED", severity: "warning", message: `Daily profit cap reached at ${(state.profitRatio * 100).toFixed(2)}%. New deals are locked, open positions remain protected.`, metadata: { profitRatio: state.profitRatio } });
          const lockedState = await this.risk.markProfitLocked(account.id, account.userId, lockUntil);
          await this.publishState(lockedState);
        } else {
          await this.publishState(state);
        }
        checked += 1;
      } catch (error) {
        logger.error({ err: error, accountId: account.id }, "Daily profit cap guard failed for account");
      }
    }
    return checked;
  }

  private async publishState(state: DailyRiskState): Promise<void> {
    const envelope = RiskStateEnvelopeSchema.parse({
      ...buildEnvelopeBase({ transactionId: `tx_${nanoid(18)}`, senderAgent: "Agent_5_Risk_Manager_B", channel: "agent.risk.state", pipelineStage: "risk_profit_guard", idempotencyScope: `${state.userId}:${state.accountId}:profit:${state.updatedAt}`, agentLog: `Daily profit ${(state.profitRatio * 100).toFixed(2)}%, profit lock=${state.profitLockActive}.`, userId: state.userId }),
      payload: state
    });
    await this.events.insert(envelope, state.userId, "user");
    await this.bus.publish(envelope);
  }
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}
