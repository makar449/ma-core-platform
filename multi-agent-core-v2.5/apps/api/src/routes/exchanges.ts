import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ExchangeSchema, SecurityAuditEnvelopeSchema } from "@ma-core/shared";
import { badRequest } from "../infrastructure/httpErrors.js";
import type { ExchangeRegistry } from "../exchanges/exchangeRegistry.js";
import type { ApiWalletVault } from "../security/vault.js";
import { validateExchangePermissions } from "../security/apiKeyPermissions.js";
import type { ApiKeyRepository } from "../repositories/apiKeyRepository.js";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import { buildEnvelopeBase } from "../infrastructure/envelopeFactory.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import type { AuthService } from "../auth/authService.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { AppConfig } from "../config.js";

const ConnectExchangeSchema = z.object({
  exchange: ExchangeSchema,
  apiKey: z.string().min(8).max(256),
  apiSecret: z.string().min(16).max(512),
  passphrase: z.string().min(1).max(256).optional()
});

export interface ExchangeRoutesDeps {
  registry: ExchangeRegistry;
  vault: ApiWalletVault;
  repository: ApiKeyRepository;
  bus: RedisMessageBus;
  events: EventLogRepository;
  auth: AuthService;
  tradingAccounts: TradingAccountRepository;
  config: AppConfig;
}

export async function registerExchangeRoutes(app: FastifyInstance, deps: ExchangeRoutesDeps): Promise<void> {
  app.post("/api/exchanges/connect", async (request, reply) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ConnectExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    const client = deps.registry.get(parsed.data.exchange);
    const credentials = parsed.data.passphrase
      ? { exchange: parsed.data.exchange, apiKey: parsed.data.apiKey, apiSecret: parsed.data.apiSecret, passphrase: parsed.data.passphrase }
      : { exchange: parsed.data.exchange, apiKey: parsed.data.apiKey, apiSecret: parsed.data.apiSecret };
    const snapshot = await client.getApiKeyPermissions(credentials);
    const validation = validateExchangePermissions(snapshot);
    const auditEnvelope = SecurityAuditEnvelopeSchema.parse({
      ...buildEnvelopeBase({
        senderAgent: "Security_Vault",
        channel: "security.audit",
        pipelineStage: "security_audit",
        idempotencyScope: `${user.id}:${parsed.data.exchange}:${validation.accepted ? "accepted" : "rejected"}:${Date.now()}`,
        agentLog: validation.reason
      }),
      payload: {
        userId: user.id,
        exchange: parsed.data.exchange,
        status: validation.accepted ? "ACCEPTED" : "REJECTED",
        reason: validation.reason
      }
    });
    await deps.events.insert(auditEnvelope, user.id, "user");
    await deps.bus.publish(auditEnvelope);
    if (!validation.accepted) {
      return reply.code(422).send({ ok: false, message: validation.reason, permissions: validation.snapshot });
    }
    const secretPayload = parsed.data.passphrase
      ? { apiKey: parsed.data.apiKey, apiSecret: parsed.data.apiSecret, passphrase: parsed.data.passphrase }
      : { apiKey: parsed.data.apiKey, apiSecret: parsed.data.apiSecret };
    const encrypted = deps.vault.encrypt(secretPayload, { userId: user.id, exchange: parsed.data.exchange });
    await deps.repository.upsert(user.id, parsed.data.exchange, encrypted, validation.snapshot.raw);
    const stored = await deps.repository.find(user.id, parsed.data.exchange);
    if (!stored) {
      throw new Error("Encrypted exchange key was not found after upsert");
    }
    const account = await deps.tradingAccounts.ensureForExchangeKey({ userId: user.id, exchangeApiKeyId: stored.id, exchange: parsed.data.exchange, executionMode: deps.config.EXECUTION_DEFAULT_MODE });
    return reply.send({ ok: true, message: validation.reason, exchange: parsed.data.exchange, executionMode: account.executionMode });
  });
}
