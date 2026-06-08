import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import type { TradingLockRepository } from "../repositories/tradingLockRepository.js";
import type { ProtectionSupervisorRepository } from "../repositories/protectionSupervisorRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import type { ExecutionExchangeRegistry } from "../execution/executionExchangeRegistry.js";
import type { ApiWalletVault, EncryptedSecret } from "../security/vault.js";
import type { OrderExecutorAgent } from "../agents/orderExecutorAgent.js";
import { logger } from "../infrastructure/logger.js";
import { endOfUtcDayIso } from "../risk/riskTime.js";

export class ProtectionOrderSupervisor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly registry: ExecutionExchangeRegistry,
    private readonly positions: PositionRepository,
    private readonly locks: TradingLockRepository,
    private readonly repository: ProtectionSupervisorRepository,
    private readonly incidents: IncidentRepository,
    private readonly orderExecutor: OrderExecutorAgent,
    private readonly intervalMs: number
  ) {}

  public start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const accounts = await this.accounts.listEnabled();
      for (const account of accounts) {
        const startedAt = new Date().toISOString();
        const openPositions = await this.positions.listOpenByAccount(account.id, 500);
        if (openPositions.length === 0) continue;
        const stored = await this.apiKeys.find(account.userId, account.exchangeName);
        if (!stored) continue;
        const credentials = this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName });
        const client = this.registry.forAccount(account.exchangeName, account.userId, account.id);
        let repairedPositions = 0;
        let closedPositions = 0;
        let missingProtection = 0;
        const runId = await this.repository.createRun({ userId: account.userId, accountId: account.id, status: "MATCHED", checkedPositions: openPositions.length, repairedPositions: 0, closedPositions: 0, startedAt, metadata: { provisional: true } });
        for (const position of openPositions) {
          try {
            const status = client.getProtectiveOrderStatus
              ? await client.getProtectiveOrderStatus(credentials, position)
              : { hasStopLoss: false, hasTakeProfit: false, qtyMatches: false, sideMatches: false, triggerPriceMatches: false, raw: { reason: "client_not_supported" } };
            const matched = status.hasStopLoss && status.hasTakeProfit && status.qtyMatches && status.sideMatches && status.triggerPriceMatches;
            await this.repository.createCheck({ runId, positionId: position.id, userId: position.userId, accountId: position.accountId, hasStopLoss: status.hasStopLoss, hasTakeProfit: status.hasTakeProfit, qtyMatches: status.qtyMatches, sideMatches: status.sideMatches, triggerPriceMatches: status.triggerPriceMatches, status: matched ? "MATCHED" : "PROTECTION_MISSING", metadata: status.raw });
            if (!matched) {
              missingProtection += 1;
              await this.incidents.create({ incidentType: "PROTECTION_ORDER_MISSING", severity: "critical", userId: position.userId, accountId: position.accountId, message: `Protection missing for ${position.pair}. Position will be closed if protection cannot be verified.`, metadata: { positionId: position.id, status } });
              await this.locks.activate({ userId: position.userId, accountId: position.accountId, lockType: "NEW_DEALS_LOCK", reason: "SYSTEM_FAILURE", lockUntil: endOfUtcDayIso(), metadata: { source: "protection_supervisor", positionId: position.id } });
              try {
                const closed = await this.orderExecutor.forceClosePositionById(position.userId, position.id, "Protection supervisor closed unprotected position.", "CLOSED_BY_RISK_HALT", { source: "protection_supervisor" });
                if (closed) closedPositions += 1;
              } catch (error) {
                await this.incidents.create({ incidentType: "PROTECTION_REPAIR_CLOSE_FAILED", severity: "critical", userId: position.userId, accountId: position.accountId, message: error instanceof Error ? error.message : "Unknown protection supervisor close failure", metadata: { positionId: position.id } });
              }
            }
          } catch (error) {
            missingProtection += 1;
            await this.incidents.create({ incidentType: "PROTECTION_SUPERVISOR_CHECK_FAILED", severity: "critical", userId: position.userId, accountId: position.accountId, message: error instanceof Error ? error.message : "Unknown protection check error", metadata: { positionId: position.id } });
          }
        }
        await this.repository.createRun({ userId: account.userId, accountId: account.id, status: missingProtection > 0 ? (closedPositions > 0 ? "POSITION_CLOSED" : "PROTECTION_MISSING") : "MATCHED", checkedPositions: openPositions.length, repairedPositions, closedPositions, startedAt, metadata: { missingProtection } });
      }
    } catch (error) {
      logger.error({ err: error }, "Protection order supervisor failed");
    } finally {
      this.running = false;
    }
  }
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}
