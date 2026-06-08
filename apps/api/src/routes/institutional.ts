import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import { badRequest, notFound, unauthorized } from "../infrastructure/httpErrors.js";
import type { InstitutionalRepository } from "../repositories/institutionalRepository.js";
import type { TradingAccountRepository } from "../repositories/tradingAccountRepository.js";
import type { RiskEventRepository } from "../repositories/riskEventRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";

const LimitQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const AccountQuerySchema = z.object({ accountId: z.string().uuid().optional() });
const SafeModeBodySchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  triggerType: z.enum(["PRIVATE_STREAM_LOST", "STALE_MARKET_DATA", "REDIS_STREAM_LAG", "DATABASE_LATENCY_SPIKE", "PROTECTION_ORDER_MISSING", "RECONCILIATION_FAILED", "VAULT_DECRYPT_FAILED", "EXCHANGE_API_INSTABILITY", "MANUAL_OPERATOR_LOCK"]),
  severity: z.enum(["info", "warning", "critical"]),
  reason: z.string().min(8).max(600),
  recoveryChecklist: z.array(z.string().min(3).max(180)).min(1).max(16),
  password: z.string().min(8)
});
const ResolveSafeModeSchema = z.object({ password: z.string().min(8) });
const ParamsIdSchema = z.object({ id: z.string().uuid() });
const ApprovalCreateSchema = z.object({
  accountId: z.string().uuid().nullable().optional(),
  requestType: z.enum(["LIVE_ENABLE", "MANUAL_ORDER", "RISK_OVERRIDE", "MODE_CHANGE"]),
  modeRequested: z.enum(["OBSERVE_ONLY", "SUGGEST_ONLY", "APPROVAL_REQUIRED", "PAPER_AUTO", "TESTNET_AUTO", "LIVE_AUTO"]),
  reason: z.string().min(8).max(600),
  expiresInMinutes: z.number().int().min(5).max(1440).default(60)
});
const ApprovalDecisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED", "CANCELED"]), password: z.string().min(8) });
const DisasterRunSchema = z.object({ runType: z.enum(["BACKUP_VERIFY", "REDIS_OUTAGE_DRILL", "EXCHANGE_OUTAGE_DRILL", "VAULT_OUTAGE_DRILL", "READ_ONLY_MODE_DRILL"]) });
const ComplianceBodySchema = z.object({ policyKey: z.enum(["risk_disclosure", "terms", "live_trading_consent", "api_permission_warning", "jurisdiction_warning", "suitability_questionnaire"]), version: z.string().min(1).max(32), accepted: z.boolean() });
const TestEvidenceBodySchema = z.object({ reportType: z.enum(["CI", "DOCKER", "E2E", "TESTNET", "SECURITY", "LOAD"]), status: z.enum(["PENDING", "PASSED", "FAILED"]), summary: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}) });
const WizardStepBodySchema = z.object({ accountId: z.string().uuid().nullable().optional(), stepKey: z.string().min(1).max(64), status: z.enum(["PENDING", "PASSED", "FAILED", "BLOCKED"]), message: z.string().min(3).max(600), password: z.string().min(8).optional() });
const ForensicCaseBodySchema = z.object({ accountId: z.string().uuid().nullable().optional(), executionId: z.string().uuid().nullable().optional(), positionId: z.string().uuid().nullable().optional(), signalTransactionId: z.string().nullable().optional() });

export interface InstitutionalRoutesDeps {
  readonly auth: AuthService;
  readonly institutional: InstitutionalRepository;
  readonly tradingAccounts: TradingAccountRepository;
  readonly riskEvents: RiskEventRepository;
  readonly incidents: IncidentRepository;
}

export async function registerInstitutionalRoutes(app: FastifyInstance, deps: InstitutionalRoutesDeps): Promise<void> {
  app.get("/api/safe-mode", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    return deps.institutional.getActiveSafeModeEvents(user.id);
  });

  app.post("/api/safe-mode", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = SafeModeBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    const event = await deps.institutional.activateSafeMode({
      userId: user.id,
      accountId: parsed.data.accountId ?? null,
      triggerType: parsed.data.triggerType,
      severity: parsed.data.severity,
      reason: parsed.data.reason,
      recoveryChecklist: parsed.data.recoveryChecklist,
      metadata: { source: "operator", fingerprint: hashText(`${user.id}:${parsed.data.reason}`) }
    });
    const incidentInput = parsed.data.accountId ? { incidentType: "SAFE_MODE_ACTIVATED", severity: parsed.data.severity, userId: user.id, accountId: parsed.data.accountId, message: parsed.data.reason, metadata: { triggerType: parsed.data.triggerType } } : { incidentType: "SAFE_MODE_ACTIVATED", severity: parsed.data.severity, userId: user.id, message: parsed.data.reason, metadata: { triggerType: parsed.data.triggerType } };
    await deps.incidents.create(incidentInput);
    return event;
  });

  app.post("/api/safe-mode/:id/resolve", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const params = ParamsIdSchema.safeParse(request.params ?? {});
    const body = ResolveSafeModeSchema.safeParse(request.body ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    if (!body.success) throw badRequest(body.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, body.data.password);
    const event = await deps.institutional.resolveSafeMode(user.id, params.data.id);
    if (!event) throw notFound("Safe mode event was not found.");
    return event;
  });

  app.get("/api/operations/command-center", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для Operations Command Center.");
    return deps.institutional.getLatestOperationsHealth(user.id);
  });

  app.get("/api/portfolio/protection", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    return deps.institutional.getLatestPortfolioSnapshot(user.id);
  });

  app.get("/api/forensic-audit", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.listForensicCases(user.id, parsed.data.limit);
  });

  app.post("/api/forensic-audit", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ForensicCaseBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.createForensicCase(user.id, {
      accountId: parsed.data.accountId ?? null,
      executionId: parsed.data.executionId ?? null,
      positionId: parsed.data.positionId ?? null,
      signalTransactionId: parsed.data.signalTransactionId ?? null,
      timeline: forensicTimeline(),
      evidence: { createdBy: "operator", mode: "forensic_audit" }
    });
  });

  app.get("/api/approval-requests", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.listApprovalRequests(user.id, parsed.data.limit);
  });

  app.post("/api/approval-requests", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ApprovalCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const expiresAt = new Date(Date.now() + parsed.data.expiresInMinutes * 60_000).toISOString();
    return deps.institutional.createApprovalRequest({ userId: user.id, accountId: parsed.data.accountId ?? null, requestType: parsed.data.requestType, modeRequested: parsed.data.modeRequested, reason: parsed.data.reason, payload: { source: "operator_console" }, expiresAt });
  });

  app.post("/api/approval-requests/:id/decision", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const params = ParamsIdSchema.safeParse(request.params ?? {});
    const body = ApprovalDecisionSchema.safeParse(request.body ?? {});
    if (!params.success) throw badRequest(params.error.issues.map((issue) => issue.message).join("; "));
    if (!body.success) throw badRequest(body.error.issues.map((issue) => issue.message).join("; "));
    await deps.auth.requirePasswordReauth(user.id, body.data.password);
    const requestRecord = await deps.institutional.decideApprovalRequest(user.id, params.data.id, body.data.status);
    if (!requestRecord) throw notFound("Approval request was not found or already decided.");
    return requestRecord;
  });

  app.get("/api/disaster-recovery", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.listDisasterRecoveryRuns(user.id, parsed.data.limit);
  });

  app.post("/api/disaster-recovery/run", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для disaster recovery drill.");
    const parsed = DisasterRunSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.createDisasterRecoveryRun(user.id, parsed.data.runType);
  });

  app.get("/api/compliance/status", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    return deps.institutional.listComplianceAcceptances(user.id);
  });

  app.post("/api/compliance/accept", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = ComplianceBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.acceptCompliance(user.id, parsed.data.policyKey, parsed.data.version, parsed.data.accepted);
  });

  app.get("/api/test-evidence", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.listTestEvidenceReports(user.id, parsed.data.limit);
  });

  app.post("/api/test-evidence", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для evidence report.");
    const parsed = TestEvidenceBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.institutional.createTestEvidenceReport(user.id, parsed.data.reportType, parsed.data.status, parsed.data.summary);
  });

  app.get("/api/live-readiness/wizard", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = AccountQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    const accountId = parsed.data.accountId ?? (await deps.tradingAccounts.findActiveForUser(user.id))?.id ?? null;
    return deps.institutional.getWizardRun(user.id, accountId);
  });

  app.post("/api/live-readiness/wizard/step", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    const user = requireAuthenticatedUser(request);
    const parsed = WizardStepBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    if (parsed.data.status === "PASSED" && parsed.data.password) await deps.auth.requirePasswordReauth(user.id, parsed.data.password);
    const accountId = parsed.data.accountId ?? (await deps.tradingAccounts.findActiveForUser(user.id))?.id ?? null;
    return deps.institutional.updateWizardStep(user.id, accountId, parsed.data.stepKey, parsed.data.status, parsed.data.message);
  });
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function forensicTimeline(): readonly Record<string, string | number | boolean | null>[] {
  const now = new Date().toISOString();
  return [
    { stage: "Signal received", status: "PENDING", timestamp: now, latencyMs: 0, message: "Forensic case was opened by operator.", evidenceRef: "operator_console" },
    { stage: "Risk checks", status: "PENDING", timestamp: now, latencyMs: 0, message: "Risk evidence is awaiting reconciliation snapshot.", evidenceRef: "risk_events" },
    { stage: "Execution", status: "PENDING", timestamp: now, latencyMs: 0, message: "Execution evidence is awaiting order audit correlation.", evidenceRef: "execution_decisions" }
  ];
}
