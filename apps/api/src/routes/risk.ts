import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import type { DailyRiskRepository } from "../repositories/dailyRiskRepository.js";
import type { TradingLockRepository } from "../repositories/tradingLockRepository.js";
import type { PositionRepository } from "../repositories/positionRepository.js";
import type { ExecutionRepository } from "../repositories/executionRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { RiskPolicyRepository } from "../repositories/riskPolicyRepository.js";
import type { RiskEventRepository } from "../repositories/riskEventRepository.js";
import type { OrderRepository } from "../repositories/orderRepository.js";
import type { ExchangeAuditRepository } from "../repositories/exchangeAuditRepository.js";
import type { OrderExecutorAgent } from "../agents/orderExecutorAgent.js";
import type { LiveReadinessRepository } from "../repositories/liveReadinessRepository.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import type { ReconciliationRepository } from "../repositories/reconciliationRepository.js";
import type { ImmutableAuditRepository } from "../repositories/immutableAuditRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import { badRequest, forbidden, notFound } from "../infrastructure/httpErrors.js";

const LimitQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(300).default(50) });
const AccountQuerySchema = z.object({ accountId: z.string().uuid() });
const AccountBodySchema = z.object({ accountId: z.string().uuid() });
const PasswordSchema = z.string().min(8).max(256);
const ParamsIdSchema = z.object({ id: z.string().uuid() });
const ModeBodySchema = z.object({
  accountId: z.string().uuid(),
  mode: z.enum(["DISABLED", "PAPER", "LIVE", "BYBIT_TESTNET", "BINANCE_FUTURES_TESTNET"]),
  confirmation: z.string().min(6).optional(),
  password: PasswordSchema.optional()
});
const RiskPolicyPatchSchema = z.object({
  accountId: z.string().uuid(),
  maxDailyDrawdownRatio: z.number().positive().max(0.05).optional(),
  dailyProfitCapRatio: z.number().positive().max(0.25).optional(),
  riskPerTradeFraction: z.number().positive().max(0.01).optional(),
  maxOpenPositions: z.number().int().min(1).max(20).optional(),
  maxDailyTrades: z.number().int().min(1).max(200).optional(),
  maxSymbolExposureRatio: z.number().positive().max(0.5).optional(),
  maxAccountExposureRatio: z.number().positive().max(1).optional(),
  maxSpreadBps: z.number().positive().max(200).optional(),
  maxOrderbookAgeMs: z.number().int().positive().max(30000).optional(),
  requirePrivateStreamForLive: z.boolean().optional(),
  requireSymbolRulesForLive: z.boolean().optional()
});
const ManualCloseBodySchema = z.object({
  reason: z.string().min(6).max(240).default("Manual operator close request"),
  password: PasswordSchema
});
const KillSwitchBodySchema = z.object({
  accountId: z.string().uuid(),
  reason: z.string().min(8).max(240).default("Manual operator kill switch"),
  password: PasswordSchema
});
const ManualLockBodySchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  lockType: z.enum(["GLOBAL_TRADING_LOCK", "NEW_DEALS_LOCK"]),
  reason: z.enum(["MANUAL_LOCK", "SYSTEM_FAILURE"]),
  lockUntil: z.string().datetime().optional(),
  note: z.string().min(4).max(240).default("Manual operator lock"),
  password: PasswordSchema
});
const ReleaseLockBodySchema = z.object({ reason: z.string().min(6).max(240).default("Manual operator release"), password: PasswordSchema });
const LiveReadinessBodySchema = z.object({ accountId: z.string().uuid(), checkKey: z.string().min(3).max(80), status: z.enum(["PENDING", "PASSED", "FAILED", "WAIVED"]), message: z.string().min(3).max(300), password: PasswordSchema.optional() });

export async function registerRiskRoutes(app: FastifyInstance, deps: {
  readonly auth: AuthService;
  readonly risk: DailyRiskRepository;
  readonly locks: TradingLockRepository;
  readonly positions: PositionRepository;
  readonly executions: ExecutionRepository;
  readonly tradingAccounts: TradingAccountRepository;
  readonly riskPolicies: RiskPolicyRepository;
  readonly riskEvents: RiskEventRepository;
  readonly orders: OrderRepository;
  readonly exchangeAudit: ExchangeAuditRepository;
  readonly orderExecutor: OrderExecutorAgent;
  readonly liveReadiness: LiveReadinessRepository;
  readonly privateStreams: PrivateStreamRepository;
  readonly reconciliation: ReconciliationRepository;
  readonly immutableAudit: ImmutableAuditRepository;
  readonly incidents: IncidentRepository;
}): Promise<void> {
  app.get("/api/risk/state", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const [riskStates, locks] = await Promise.all([deps.risk.listForUser(user.id), deps.locks.listActiveForUser(user.id)]);
    return { riskStates, locks };
  });

  app.get("/api/risk/events", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.riskEvents.listForUser(user.id, parsed.data.limit);
  });

  app.get("/api/risk/policy", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = AccountQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    return deps.riskPolicies.getOrCreate(user.id, account.id);
  });

  app.put("/api/risk/policy", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = RiskPolicyPatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    const { accountId, ...patch } = parsed.data;
    const policy = await deps.riskPolicies.update(user.id, accountId, patch);
    await deps.riskEvents.append({ userId: user.id, accountId, eventType: "RISK_POLICY_UPDATED", severity: "warning", message: "Risk policy was updated by operator.", metadata: patch });
    return policy;
  });

  app.post("/api/risk/locks/manual", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ManualLockBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    const accountId = parsed.data.accountId ?? null;
    if (accountId) {
      const account = await deps.tradingAccounts.findActiveForUser(user.id);
      if (!account || account.id !== accountId) throw notFound("Trading account was not found.");
    }
    const lockUntil = parsed.data.lockUntil ?? endOfUtcDayIso();
    const lock = await deps.locks.activate({ userId: user.id, accountId, lockType: parsed.data.lockType, reason: parsed.data.reason, lockUntil, metadata: { note: parsed.data.note, source: "operator_manual_lock" } });
    await deps.riskEvents.append({ userId: user.id, accountId, eventType: "MANUAL_LOCK_ACTIVATED", severity: parsed.data.lockType === "GLOBAL_TRADING_LOCK" ? "critical" : "warning", message: parsed.data.note, metadata: { lockType: parsed.data.lockType, reason: parsed.data.reason, lockUntil } });
    return { lock };
  });

  app.delete("/api/risk/locks/:id", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const params = ParamsIdSchema.safeParse(request.params ?? {});
    const body = ReleaseLockBodySchema.safeParse(request.body ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    if (!body.success) throw badRequest(body.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, body.data.password);
    const released = await deps.locks.releaseById(user.id, params.data.id, body.data.reason);
    if (!released) throw notFound("Active trading lock was not found.");
    await deps.riskEvents.append({ userId: user.id, accountId: released.accountId, eventType: "MANUAL_LOCK_RELEASED", severity: "warning", message: body.data.reason, metadata: { lockId: released.id, lockType: released.lockType } });
    return { lock: released };
  });

  app.post("/api/risk/recalculate", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = AccountBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    const riskStates = await deps.risk.listForUser(user.id);
    const executions = await deps.executions.listRecentForUser(user.id, 50);
    await deps.riskEvents.append({ userId: user.id, accountId: account.id, eventType: "RISK_RECALCULATION_REQUESTED", severity: "info", message: "Operator requested risk state recalculation.", metadata: { riskStateCount: riskStates.length, sampledExecutions: executions.length } });
    return { riskStates, sampledExecutions: executions.length };
  });

  app.post("/api/execution/mode", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ModeBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    if (parsed.data.mode === "LIVE") {
      if (parsed.data.confirmation !== "ENABLE_LIVE") {
        throw forbidden("LIVE mode requires explicit ENABLE_LIVE confirmation.");
      }
      if (!parsed.data.password) {
        throw forbidden("LIVE mode requires operator password re-authentication.");
      }
      await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    }
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    if (parsed.data.mode === "LIVE") {
      const required = ["permission_recheck", "withdraw_disabled", "private_stream_healthy", "symbol_rules_loaded", "testnet_order", "testnet_sl_tp", "testnet_manual_close", "testnet_kill_switch", "risk_policy_locked", "risk_confirmation_signed", "emergency_close_test"];
      const ready = await deps.liveReadiness.allRequiredPassed(user.id, account.id, required);
      if (!ready) {
        throw forbidden("LIVE mode is unavailable until all live-readiness checks pass.");
      }
    }
    const updated = await deps.tradingAccounts.setExecutionMode(user.id, account.id, parsed.data.mode);
    await deps.immutableAudit.appendRiskEvent({ userId: user.id, accountId: account.id, eventType: "EXECUTION_MODE_CHANGED", severity: parsed.data.mode === "LIVE" ? "critical" : "warning", message: `Execution mode changed to ${parsed.data.mode}.`, metadata: { mode: parsed.data.mode } });
    return updated;
  });

  app.post("/api/execution/kill-switch", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = KillSwitchBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    const lockUntil = endOfUtcDayIso();
    const lock = await deps.locks.activate({ userId: user.id, accountId: account.id, lockType: "GLOBAL_TRADING_LOCK", reason: "MANUAL_LOCK", lockUntil, metadata: { source: "operator_kill_switch", reason: parsed.data.reason } });
    const closeResult = await deps.orderExecutor.forceCloseAllForAccount(user.id, account.id, parsed.data.reason);
    await deps.immutableAudit.appendRiskEvent({ userId: user.id, accountId: account.id, eventType: "MANUAL_KILL_SWITCH", severity: "critical", message: parsed.data.reason, metadata: { closed: closeResult.closed, failed: closeResult.failed } });
    return { lock, closeResult };
  });

  app.post("/api/execution/positions/:id/close", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const params = ParamsIdSchema.safeParse(request.params ?? {});
    const body = ManualCloseBodySchema.safeParse(request.body ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    if (!body.success) throw badRequest(body.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, body.data.password);
    const position = await deps.orderExecutor.forceClosePositionById(user.id, params.data.id, body.data.reason, "CLOSED_MANUALLY", { source: "operator_manual_close" });
    if (!position) throw notFound("Open position was not found or could not be closed.");
    await deps.riskEvents.append({ userId: user.id, accountId: position.accountId, eventType: "MANUAL_CLOSE_COMPLETED", severity: "warning", message: body.data.reason, metadata: { positionId: position.id, status: position.status } });
    return { position };
  });

  app.post("/api/execution/positions/:id/sync", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const params = ParamsIdSchema.safeParse(request.params ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    const positions = await deps.positions.listOpenForUser(user.id, 200);
    const target = positions.find((position) => position.id === params.data.id);
    if (!target) throw notFound("Open position was not found.");
    await deps.riskEvents.append({ userId: user.id, accountId: target.accountId, eventType: "POSITION_SYNC_REQUESTED", severity: "info", message: `Position ${target.pair} sync requested by operator.`, metadata: { positionId: target.id } });
    return { position: target, syncQueued: true };
  });

  app.get("/api/positions/open", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.positions.listOpenForUser(user.id, parsed.data.limit);
  });

  app.get("/api/executions", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.executions.listRecentForUser(user.id, parsed.data.limit);
  });

  app.get("/api/execution/decisions/:id", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const params = z.object({ id: z.string().min(8) }).safeParse(request.params ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    const decision = await deps.executions.findForUser(user.id, params.data.id);
    if (!decision) throw notFound("Execution decision was not found.");
    return decision;
  });

  app.get("/api/execution/orders", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.orders.listForUser(user.id, parsed.data.limit);
  });

  app.get("/api/execution/audit", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.exchangeAudit.listForUser(user.id, parsed.data.limit);
  });

  app.get("/api/live-readiness", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = AccountQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    return deps.liveReadiness.listForAccount(user.id, account.id);
  });



  app.post("/api/live-readiness/checks", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LiveReadinessBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const account = await deps.tradingAccounts.findActiveForUser(user.id);
    if (!account || account.id !== parsed.data.accountId) throw notFound("Trading account was not found.");
    if (parsed.data.status === "PASSED" || parsed.data.status === "WAIVED") {
      if (!parsed.data.password) throw forbidden("Passing or waiving a live-readiness check requires password re-authentication.");
      await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    }
    const check = await deps.liveReadiness.upsert({ userId: user.id, accountId: account.id, checkKey: parsed.data.checkKey, status: parsed.data.status, message: parsed.data.message, metadata: { source: "operator" } });
    await deps.immutableAudit.appendRiskEvent({ userId: user.id, accountId: account.id, eventType: "LIVE_READINESS_CHECK_UPDATED", severity: parsed.data.status === "FAILED" ? "critical" : "warning", message: parsed.data.message, metadata: { checkKey: parsed.data.checkKey, status: parsed.data.status } });
    return check;
  });

  app.get("/api/private-streams", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    return deps.privateStreams.listForUser(user.id);
  });

  app.get("/api/reconciliation/runs", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.reconciliation.listRunsForUser(user.id, parsed.data.limit);
  });



  app.get("/api/incidents", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.incidents.listForUser(user.id, parsed.data.limit);
  });

  app.get("/api/reconciliation/mismatches", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.reconciliation.listMismatchesForUser(user.id, parsed.data.limit);
  });

}

function endOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
}
