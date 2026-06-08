import type { ApiKeyRepository, StoredExchangeKey } from "../repositories/apiKeyRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import type { OrderRepository } from "../repositories/orderRepository.js";
import type { ReconciliationRepository } from "../repositories/reconciliationRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import type { ExecutionExchangeRegistry } from "../execution/executionExchangeRegistry.js";
import type { ApiWalletVault, EncryptedSecret } from "../security/vault.js";
import { logger } from "../infrastructure/logger.js";
import type { Position } from "@ma-core/shared";
import type { ExchangeOpenOrderSnapshot, ExchangePositionSnapshot } from "../execution/types.js";

export class ExchangeReconciliationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly accounts: TradingAccountRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly vault: ApiWalletVault,
    private readonly registry: ExecutionExchangeRegistry,
    private readonly positions: PositionRepository,
    private readonly orders: OrderRepository,
    private readonly reconciliation: ReconciliationRepository,
    private readonly incidents: IncidentRepository,
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
        const stored = await this.apiKeys.find(account.userId, account.exchangeName);
        if (!stored) {
          await this.reconciliation.createRun({ userId: account.userId, accountId: account.id, exchange: account.exchangeName, status: "SKIPPED_NO_CREDENTIALS", internalOpenPositions: 0, exchangeOpenPositions: 0, internalOpenOrders: 0, exchangeOpenOrders: 0, realizedPnlInternal: 0, startedAt });
          continue;
        }
        const credentials = this.vault.decrypt(toEncryptedSecret(stored), { userId: account.userId, exchange: account.exchangeName });
        const client = this.registry.forAccount(account.exchangeName, account.userId, account.id);
        const internalPositions = await this.positions.listOpenByAccount(account.id, 500);
        const internalOrders = await this.orders.listForUser(account.userId, 300);
        try {
          const [exchangePositions, exchangeOrders, exchangePnl] = await Promise.all([
            client.listExchangePositions ? client.listExchangePositions(credentials) : Promise.resolve([]),
            client.listOpenOrders ? client.listOpenOrders(credentials) : Promise.resolve([]),
            client.getRealizedPnlToday ? client.getRealizedPnlToday(credentials).catch(() => null) : Promise.resolve(null)
          ]);
          const mismatches = buildMismatches(internalPositions, exchangePositions, exchangeOrders);
          const run = await this.reconciliation.createRun({ userId: account.userId, accountId: account.id, exchange: account.exchangeName, status: mismatches.length > 0 ? "MISMATCH" : "MATCHED", internalOpenPositions: internalPositions.length, exchangeOpenPositions: exchangePositions.length, internalOpenOrders: internalOrders.length, exchangeOpenOrders: exchangeOrders.length, realizedPnlInternal: 0, realizedPnlExchange: exchangePnl, startedAt, metadata: { mismatchCount: mismatches.length } });
          for (const mismatch of mismatches) {
            await this.reconciliation.createMismatch({ runId: run.id, userId: account.userId, accountId: account.id, mismatchType: mismatch.type, severity: mismatch.severity, message: mismatch.message, metadata: mismatch.metadata });
            if (mismatch.severity === "critical") {
              await this.incidents.create({ incidentType: mismatch.type, severity: "critical", userId: account.userId, accountId: account.id, message: mismatch.message, metadata: mismatch.metadata });
            }
          }
        } catch (error) {
          await this.reconciliation.createRun({ userId: account.userId, accountId: account.id, exchange: account.exchangeName, status: "EXCHANGE_UNAVAILABLE", internalOpenPositions: internalPositions.length, exchangeOpenPositions: 0, internalOpenOrders: internalOrders.length, exchangeOpenOrders: 0, realizedPnlInternal: 0, startedAt, metadata: { error: error instanceof Error ? error.message : "Unknown reconciliation error" } });
          await this.incidents.create({ incidentType: "EXCHANGE_RECONCILIATION_UNAVAILABLE", severity: "critical", userId: account.userId, accountId: account.id, message: error instanceof Error ? error.message : "Unknown reconciliation error", metadata: {} });
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Exchange reconciliation worker failed");
    } finally {
      this.running = false;
    }
  }
}

function buildMismatches(internalPositions: Position[], exchangePositions: ExchangePositionSnapshot[], exchangeOrders: ExchangeOpenOrderSnapshot[]) {
  const mismatches: Array<{ type: "EXCHANGE_RECONCILIATION_MISMATCH" | "PROTECTION_ORDER_MISSING" | "POSITION_SIZE_MISMATCH" | "POSITION_NOT_FOUND_ON_EXCHANGE" | "UNKNOWN_EXCHANGE_POSITION" | "ORDER_NOT_FOUND_ON_EXCHANGE" | "UNKNOWN_EXCHANGE_ORDER" | "REALIZED_PNL_MISMATCH"; severity: "info" | "warning" | "critical"; message: string; metadata: Record<string, unknown> }> = [];
  const exchangeByPair = new Map(exchangePositions.map((position) => [position.pair, position]));
  for (const position of internalPositions) {
    const exchangePosition = exchangeByPair.get(position.pair);
    if (!exchangePosition) {
      mismatches.push({ type: "POSITION_NOT_FOUND_ON_EXCHANGE", severity: "critical", message: `Internal position ${position.pair} is open but exchange position is missing.`, metadata: { positionId: position.id, pair: position.pair } });
      continue;
    }
    if (Math.abs(exchangePosition.volume - position.volume) > Math.max(0.0000001, position.volume * 0.001)) {
      mismatches.push({ type: "POSITION_SIZE_MISMATCH", severity: "critical", message: `Position size mismatch for ${position.pair}.`, metadata: { internalVolume: position.volume, exchangeVolume: exchangePosition.volume } });
    }
    const protectiveOrders = exchangeOrders.filter((order) => order.pair === position.pair && (order.orderRole === "STOP_LOSS" || order.orderRole === "TAKE_PROFIT"));
    if (protectiveOrders.length < 2) {
      mismatches.push({ type: "PROTECTION_ORDER_MISSING", severity: "critical", message: `Protection order missing for ${position.pair}.`, metadata: { positionId: position.id, protectiveOrderCount: protectiveOrders.length } });
    }
  }
  const internalPairs = new Set(internalPositions.map((position) => position.pair));
  for (const exchangePosition of exchangePositions) {
    if (!internalPairs.has(exchangePosition.pair)) {
      mismatches.push({ type: "UNKNOWN_EXCHANGE_POSITION", severity: "critical", message: `Exchange has unknown open position ${exchangePosition.pair}.`, metadata: { pair: exchangePosition.pair, volume: exchangePosition.volume } });
    }
  }
  return mismatches;
}

function toEncryptedSecret(stored: StoredExchangeKey): EncryptedSecret {
  return { ciphertext: stored.encryptedPayload, iv: stored.iv, salt: stored.salt, authTag: stored.authTag, keyVersion: stored.keyVersion };
}
