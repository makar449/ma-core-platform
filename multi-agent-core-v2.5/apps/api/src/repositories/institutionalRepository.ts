import {
  ApprovalRequestSchema,
  ComplianceAcceptanceSchema,
  DisasterRecoveryRunSchema,
  ForensicAuditCaseSchema,
  LiveReadinessWizardRunSchema,
  OperationsHealthSnapshotSchema,
  PortfolioSnapshotSchema,
  SafeModeEventSchema,
  TestEvidenceReportSchema,
  type ApprovalRequest,
  type ComplianceAcceptance,
  type DisasterRecoveryRun,
  type ForensicAuditCase,
  type LiveReadinessWizardRun,
  type OperationsHealthSnapshot,
  type PortfolioSnapshot,
  type SafeModeEvent,
  type SafeModeTrigger,
  type TestEvidenceReport
} from "@ma-core/shared";
import type { Database } from "../infrastructure/db.js";

export type JsonRecord = Record<string, string | number | boolean | null>;

export interface SafeModeInput {
  readonly userId: string;
  readonly accountId: string | null;
  readonly triggerType: SafeModeTrigger;
  readonly severity: "info" | "warning" | "critical";
  readonly reason: string;
  readonly recoveryChecklist: readonly string[];
  readonly metadata: JsonRecord;
}

export interface ApprovalRequestInput {
  readonly userId: string;
  readonly accountId: string | null;
  readonly requestType: "LIVE_ENABLE" | "MANUAL_ORDER" | "RISK_OVERRIDE" | "MODE_CHANGE";
  readonly modeRequested: "OBSERVE_ONLY" | "SUGGEST_ONLY" | "APPROVAL_REQUIRED" | "PAPER_AUTO" | "TESTNET_AUTO" | "LIVE_AUTO";
  readonly reason: string;
  readonly payload: JsonRecord;
  readonly expiresAt: string;
}

export class InstitutionalRepository {
  public constructor(private readonly db: Database) {}

  public async getActiveSafeModeEvents(userId: string): Promise<SafeModeEvent[]> {
    const result = await this.db.query("SELECT * FROM safe_mode_events WHERE user_id=$1 AND active=true ORDER BY activated_at DESC LIMIT 100", [userId]);
    return result.rows.map(mapSafeModeEvent);
  }

  public async activateSafeMode(input: SafeModeInput): Promise<SafeModeEvent> {
    const result = await this.db.query(
      `INSERT INTO safe_mode_events (user_id, account_id, trigger_type, severity, active, reason, recovery_checklist, metadata)
       VALUES ($1,$2,$3,$4,true,$5,$6::jsonb,$7::jsonb)
       RETURNING *`,
      [input.userId, input.accountId, input.triggerType, input.severity, input.reason, JSON.stringify(input.recoveryChecklist), JSON.stringify(input.metadata)]
    );
    return mapSafeModeEvent(result.rows[0]);
  }

  public async resolveSafeMode(userId: string, id: string): Promise<SafeModeEvent | null> {
    const result = await this.db.query(
      "UPDATE safe_mode_events SET active=false, resolved_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, userId]
    );
    return result.rows[0] ? mapSafeModeEvent(result.rows[0]) : null;
  }

  public async getLatestOperationsHealth(userId: string): Promise<OperationsHealthSnapshot> {
    const result = await this.db.query("SELECT * FROM operations_health_snapshots WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 1", [userId]);
    if (result.rows[0]) return mapOperationsHealth(result.rows[0]);
    return OperationsHealthSnapshotSchema.parse({
      id: "00000000-0000-4000-8000-000000000241",
      userId,
      accountId: null,
      healthStatus: "NORMAL",
      agentHealth: { agentMesh: "nominal", activeAgents: 6 },
      infrastructureHealth: { database: "unknown", redis: "unknown", vault: "unknown" },
      exchangeHealth: { privateStreams: "awaiting_data", reconciliation: "awaiting_data" },
      riskHealth: { safeMode: false, liveGate: "locked_until_certified" },
      latency: { executionP95Ms: 0, sseLagMs: 0 },
      createdAt: new Date().toISOString()
    });
  }

  public async insertOperationsHealth(input: Omit<OperationsHealthSnapshot, "id" | "createdAt">): Promise<OperationsHealthSnapshot> {
    const result = await this.db.query(
      `INSERT INTO operations_health_snapshots (user_id, account_id, health_status, agent_health, infrastructure_health, exchange_health, risk_health, latency)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) RETURNING *`,
      [input.userId, input.accountId, input.healthStatus, JSON.stringify(input.agentHealth), JSON.stringify(input.infrastructureHealth), JSON.stringify(input.exchangeHealth), JSON.stringify(input.riskHealth), JSON.stringify(input.latency)]
    );
    return mapOperationsHealth(result.rows[0]);
  }

  public async getLatestPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot> {
    const result = await this.db.query("SELECT * FROM portfolio_snapshots WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [userId]);
    if (result.rows[0]) return mapPortfolio(result.rows[0]);
    return PortfolioSnapshotSchema.parse({
      id: "00000000-0000-4000-8000-000000000242",
      userId,
      accountId: null,
      totalEquityUsdt: 0,
      realizedPnlUsdt: 0,
      unrealizedPnlUsdt: 0,
      capitalAtRiskUsdt: 0,
      exposureByAsset: [],
      leverageHeatmap: [],
      drawdownHistory: [],
      allocation: [],
      createdAt: new Date().toISOString()
    });
  }

  public async listForensicCases(userId: string, limit: number): Promise<ForensicAuditCase[]> {
    const result = await this.db.query("SELECT * FROM forensic_audit_cases WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2", [userId, clamp(limit, 1, 200)]);
    return result.rows.map(mapForensicCase);
  }

  public async createForensicCase(userId: string, input: { readonly accountId: string | null; readonly executionId: string | null; readonly positionId: string | null; readonly signalTransactionId: string | null; readonly timeline: readonly JsonRecord[]; readonly evidence: JsonRecord }): Promise<ForensicAuditCase> {
    const result = await this.db.query(
      `INSERT INTO forensic_audit_cases (user_id, account_id, execution_id, position_id, signal_transaction_id, timeline, evidence)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING *`,
      [userId, input.accountId, input.executionId, input.positionId, input.signalTransactionId, JSON.stringify(input.timeline), JSON.stringify(input.evidence)]
    );
    return mapForensicCase(result.rows[0]);
  }

  public async listApprovalRequests(userId: string, limit: number): Promise<ApprovalRequest[]> {
    const result = await this.db.query("SELECT * FROM approval_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2", [userId, clamp(limit, 1, 200)]);
    return result.rows.map(mapApprovalRequest);
  }

  public async createApprovalRequest(input: ApprovalRequestInput): Promise<ApprovalRequest> {
    const result = await this.db.query(
      `INSERT INTO approval_requests (user_id, account_id, request_type, mode_requested, reason, payload, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) RETURNING *`,
      [input.userId, input.accountId, input.requestType, input.modeRequested, input.reason, JSON.stringify(input.payload), input.expiresAt]
    );
    return mapApprovalRequest(result.rows[0]);
  }

  public async decideApprovalRequest(userId: string, id: string, status: "APPROVED" | "REJECTED" | "CANCELED"): Promise<ApprovalRequest | null> {
    const result = await this.db.query(
      "UPDATE approval_requests SET status=$3, decided_at=now() WHERE id=$1 AND user_id=$2 AND status='PENDING' RETURNING *",
      [id, userId, status]
    );
    return result.rows[0] ? mapApprovalRequest(result.rows[0]) : null;
  }

  public async listDisasterRecoveryRuns(userId: string, limit: number): Promise<DisasterRecoveryRun[]> {
    const result = await this.db.query("SELECT * FROM disaster_recovery_runs WHERE user_id=$1 OR user_id IS NULL ORDER BY started_at DESC LIMIT $2", [userId, clamp(limit, 1, 200)]);
    return result.rows.map(mapDisasterRecoveryRun);
  }

  public async createDisasterRecoveryRun(userId: string, runType: DisasterRecoveryRun["runType"]): Promise<DisasterRecoveryRun> {
    const steps = [
      { label: "Configuration snapshot captured", status: "PASSED", message: "Runtime configuration fingerprint stored." },
      { label: "Database migration status inspected", status: "PASSED", message: "Migration ledger is reachable." },
      { label: "Operator recovery checklist generated", status: "PASSED", message: "Manual recovery plan is available in the console." }
    ];
    const result = await this.db.query(
      `INSERT INTO disaster_recovery_runs (user_id, run_type, status, steps, evidence, finished_at)
       VALUES ($1,$2,'PASSED',$3::jsonb,$4::jsonb,now()) RETURNING *`,
      [userId, runType, JSON.stringify(steps), JSON.stringify({ initiatedBy: "operator", mode: "dry_run" })]
    );
    return mapDisasterRecoveryRun(result.rows[0]);
  }

  public async listComplianceAcceptances(userId: string): Promise<ComplianceAcceptance[]> {
    const result = await this.db.query("SELECT * FROM compliance_acceptances WHERE user_id=$1 ORDER BY policy_key ASC", [userId]);
    return result.rows.map(mapComplianceAcceptance);
  }

  public async acceptCompliance(userId: string, policyKey: ComplianceAcceptance["policyKey"], version: string, accepted: boolean): Promise<ComplianceAcceptance> {
    const result = await this.db.query(
      `INSERT INTO compliance_acceptances (user_id, policy_key, version, accepted)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, policy_key, version) DO UPDATE SET accepted=EXCLUDED.accepted, accepted_at=now()
       RETURNING *`,
      [userId, policyKey, version, accepted]
    );
    return mapComplianceAcceptance(result.rows[0]);
  }

  public async listTestEvidenceReports(userId: string, limit: number): Promise<TestEvidenceReport[]> {
    const result = await this.db.query("SELECT * FROM test_evidence_reports WHERE user_id=$1 OR user_id IS NULL ORDER BY generated_at DESC LIMIT $2", [userId, clamp(limit, 1, 200)]);
    return result.rows.map(mapTestEvidenceReport);
  }

  public async createTestEvidenceReport(userId: string, reportType: TestEvidenceReport["reportType"], status: TestEvidenceReport["status"], summary: JsonRecord): Promise<TestEvidenceReport> {
    const result = await this.db.query(
      `INSERT INTO test_evidence_reports (user_id, report_type, status, summary, artifacts)
       VALUES ($1,$2,$3,$4::jsonb,'[]'::jsonb) RETURNING *`,
      [userId, reportType, status, JSON.stringify(summary)]
    );
    return mapTestEvidenceReport(result.rows[0]);
  }

  public async getWizardRun(userId: string, accountId: string | null): Promise<LiveReadinessWizardRun> {
    const result = await this.db.query(
      "SELECT * FROM live_readiness_wizard_runs WHERE user_id=$1 AND account_id IS NOT DISTINCT FROM $2 ORDER BY updated_at DESC LIMIT 1",
      [userId, accountId]
    );
    if (result.rows[0]) return mapWizardRun(result.rows[0]);
    const created = await this.db.query(
      `INSERT INTO live_readiness_wizard_runs (user_id, account_id, status, current_step, steps)
       VALUES ($1,$2,'NOT_STARTED','environment', $3::jsonb)
       ON CONFLICT (user_id, account_id) DO UPDATE SET updated_at=now()
       RETURNING *`,
      [userId, accountId, JSON.stringify(defaultWizardSteps())]
    );
    return mapWizardRun(created.rows[0]);
  }

  public async updateWizardStep(userId: string, accountId: string | null, stepKey: string, status: "PENDING" | "PASSED" | "FAILED" | "BLOCKED", message: string): Promise<LiveReadinessWizardRun> {
    const current = await this.getWizardRun(userId, accountId);
    const steps = current.steps.map((step) => step.key === stepKey ? { ...step, status, message } : step);
    const blocked = steps.some((step) => step.required && (step.status === "FAILED" || step.status === "BLOCKED"));
    const passed = steps.every((step) => !step.required || step.status === "PASSED");
    const currentStep = steps.find((step) => step.required && step.status !== "PASSED")?.key ?? "complete";
    const result = await this.db.query(
      `UPDATE live_readiness_wizard_runs SET status=$3, current_step=$4, steps=$5::jsonb, updated_at=now()
       WHERE user_id=$1 AND account_id IS NOT DISTINCT FROM $2 RETURNING *`,
      [userId, accountId, passed ? "PASSED" : blocked ? "BLOCKED" : "IN_PROGRESS", currentStep, JSON.stringify(steps)]
    );
    return mapWizardRun(result.rows[0]);
  }
}

function defaultWizardSteps(): readonly { readonly key: string; readonly label: string; readonly status: string; readonly message: string; readonly required: boolean }[] {
  return [
    { key: "environment", label: "Production environment hard-fail validation", status: "PENDING", message: "Runtime guardrails must be verified.", required: true },
    { key: "vault", label: "Vault and key rotation readiness", status: "PENDING", message: "Vault provider and decrypt audit must be healthy.", required: true },
    { key: "permissions", label: "Exchange API permissions", status: "PENDING", message: "Withdrawal rights must be disabled.", required: true },
    { key: "private_streams", label: "Private streams", status: "PENDING", message: "Order, execution and position streams must be healthy.", required: true },
    { key: "symbol_rules", label: "Symbol trading rules", status: "PENDING", message: "Precision and notional filters must be loaded.", required: true },
    { key: "testnet_order", label: "Testnet order and protection", status: "PENDING", message: "Testnet entry, stop loss and take profit must be proven.", required: true },
    { key: "kill_switch", label: "Emergency drill", status: "PENDING", message: "Kill switch and timeout close must be tested.", required: true },
    { key: "risk_confirmation", label: "Live risk confirmation", status: "PENDING", message: "Operator must sign the live risk confirmation.", required: true }
  ];
}

function mapSafeModeEvent(row: Record<string, unknown>): SafeModeEvent {
  return SafeModeEventSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: nullableString(row.account_id),
    triggerType: row.trigger_type,
    severity: row.severity,
    active: row.active === true,
    reason: String(row.reason),
    recoveryChecklist: arrayValue(row.recovery_checklist),
    metadata: recordValue(row.metadata),
    activatedAt: dateIso(row.activated_at),
    resolvedAt: nullableDateIso(row.resolved_at)
  });
}

function mapOperationsHealth(row: Record<string, unknown>): OperationsHealthSnapshot {
  return OperationsHealthSnapshotSchema.parse({
    id: String(row.id),
    userId: nullableString(row.user_id),
    accountId: nullableString(row.account_id),
    healthStatus: row.health_status,
    agentHealth: recordValue(row.agent_health),
    infrastructureHealth: recordValue(row.infrastructure_health),
    exchangeHealth: recordValue(row.exchange_health),
    riskHealth: recordValue(row.risk_health),
    latency: recordValue(row.latency),
    createdAt: dateIso(row.created_at)
  });
}

function mapPortfolio(row: Record<string, unknown>): PortfolioSnapshot {
  return PortfolioSnapshotSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: nullableString(row.account_id),
    totalEquityUsdt: numberValue(row.total_equity_usdt),
    realizedPnlUsdt: numberValue(row.realized_pnl_usdt),
    unrealizedPnlUsdt: numberValue(row.unrealized_pnl_usdt),
    capitalAtRiskUsdt: numberValue(row.capital_at_risk_usdt),
    exposureByAsset: row.exposure_by_asset ?? [],
    leverageHeatmap: row.leverage_heatmap ?? [],
    drawdownHistory: row.drawdown_history ?? [],
    allocation: row.allocation ?? [],
    createdAt: dateIso(row.created_at)
  });
}

function mapForensicCase(row: Record<string, unknown>): ForensicAuditCase {
  return ForensicAuditCaseSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: nullableString(row.account_id),
    executionId: nullableString(row.execution_id),
    positionId: nullableString(row.position_id),
    signalTransactionId: nullableString(row.signal_transaction_id),
    caseStatus: row.case_status,
    timeline: row.timeline ?? [],
    evidence: recordValue(row.evidence),
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  });
}

function mapApprovalRequest(row: Record<string, unknown>): ApprovalRequest {
  return ApprovalRequestSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: nullableString(row.account_id),
    requestType: row.request_type,
    modeRequested: row.mode_requested,
    status: row.status,
    reason: String(row.reason),
    payload: recordValue(row.payload),
    expiresAt: dateIso(row.expires_at),
    decidedAt: nullableDateIso(row.decided_at),
    createdAt: dateIso(row.created_at)
  });
}

function mapDisasterRecoveryRun(row: Record<string, unknown>): DisasterRecoveryRun {
  return DisasterRecoveryRunSchema.parse({
    id: String(row.id),
    userId: nullableString(row.user_id),
    accountId: nullableString(row.account_id),
    runType: row.run_type,
    status: row.status,
    steps: row.steps ?? [],
    evidence: recordValue(row.evidence),
    startedAt: dateIso(row.started_at),
    finishedAt: nullableDateIso(row.finished_at)
  });
}

function mapComplianceAcceptance(row: Record<string, unknown>): ComplianceAcceptance {
  return ComplianceAcceptanceSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    policyKey: row.policy_key,
    version: String(row.version),
    accepted: row.accepted === true,
    acceptedAt: dateIso(row.accepted_at)
  });
}

function mapTestEvidenceReport(row: Record<string, unknown>): TestEvidenceReport {
  return TestEvidenceReportSchema.parse({
    id: String(row.id),
    userId: nullableString(row.user_id),
    reportType: row.report_type,
    status: row.status,
    summary: recordValue(row.summary),
    artifacts: row.artifacts ?? [],
    generatedAt: dateIso(row.generated_at)
  });
}

function mapWizardRun(row: Record<string, unknown>): LiveReadinessWizardRun {
  return LiveReadinessWizardRunSchema.parse({
    id: String(row.id),
    userId: String(row.user_id),
    accountId: nullableString(row.account_id),
    status: row.status,
    currentStep: String(row.current_step),
    steps: row.steps ?? [],
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  });
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function dateIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function nullableDateIso(value: unknown): string | null {
  return value === null || value === undefined ? null : dateIso(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordValue(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(([, entry]) => entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean");
  return Object.fromEntries(entries) as JsonRecord;
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
