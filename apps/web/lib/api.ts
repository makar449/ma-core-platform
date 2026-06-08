import { z } from "zod";
import { demoModeEnabled } from "./deployMode";
import { demoRequestJson } from "./demoApi";
import { AdapterStatusSchema, AgentEnvelopeSchema, DailyRiskStateSchema, ExecutionDecisionSchema, PositionSchema, RiskPolicySchema, TradeSignalSchema, StrategyRuleSchema, PrivateStreamStatusSchema, ReconciliationRunSchema, ReconciliationMismatchSchema, LiveReadinessCheckSchema, SafeModeEventSchema, OperationsHealthSnapshotSchema, PortfolioSnapshotSchema, ForensicAuditCaseSchema, ApprovalRequestSchema, DisasterRecoveryRunSchema, ComplianceAcceptanceSchema, TestEvidenceReportSchema, LiveReadinessWizardRunSchema, type AdapterStatus, type AgentEnvelope, type DailyRiskState, type ExecutionDecision, type Position, type RiskPolicy, type TradeSignal, type StrategyRule, type PrivateStreamStatus, type ReconciliationRun, type ReconciliationMismatch, type LiveReadinessCheck, type SafeModeEvent, type OperationsHealthSnapshot, type PortfolioSnapshot, type ForensicAuditCase, type ApprovalRequest, type DisasterRecoveryRun, type ComplianceAcceptance, type TestEvidenceReport, type LiveReadinessWizardRun } from "@ma-core/shared";

const RuntimeEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(12_000),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_DEPLOY_TARGET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional()
});

const runtimeEnv = RuntimeEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_TIMEOUT_MS: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_DEPLOY_TARGET: process.env.NEXT_PUBLIC_DEPLOY_TARGET,
  NODE_ENV: process.env.NODE_ENV
});

if (runtimeEnv.NODE_ENV === "production" && !demoModeEnabled && !runtimeEnv.NEXT_PUBLIC_API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is required for the production web console unless NEXT_PUBLIC_DEMO_MODE=true is set");
}

const apiBaseUrl = demoModeEnabled ? "https://demo.ma-core.local" : normalizeBaseUrl(runtimeEnv.NEXT_PUBLIC_API_URL ?? "http://localhost:4100");
const requestTimeoutMs = runtimeEnv.NEXT_PUBLIC_API_TIMEOUT_MS;
const maxAttempts = 3;

export interface ApiResponse<T> { readonly data: T | null; readonly error: string | null }
export interface SessionUser { readonly id: string; readonly email: string; readonly roles: readonly string[] }
export interface SessionResponse { readonly ok: boolean; readonly csrfToken: string | null; readonly user: SessionUser }
export interface RegisterInput { readonly email: string; readonly password: string; readonly registrationToken?: string }
export interface LoginInput { readonly email: string; readonly password: string }
export interface MetricSnapshot { readonly name: string; readonly kind: "counter" | "gauge"; readonly value: number; readonly labels: Readonly<Record<string, string>>; readonly updatedAt: string }
export interface StreamMetric { readonly channel: string; readonly length: number; readonly pending: number }
export interface DeadLetterRecord { readonly id: string; readonly values: Readonly<Record<string, string>> }
export interface RiskStateResponse { readonly riskStates: readonly DailyRiskState[]; readonly locks: readonly TradingLockSummary[] }
export interface TradingLockSummary { readonly id: string; readonly userId: string; readonly accountId: string | null; readonly lockType: "GLOBAL_TRADING_LOCK" | "NEW_DEALS_LOCK"; readonly reason: string; readonly active: boolean; readonly lockUntil: string; readonly createdAt: string }
export interface RiskEventRecord { readonly id: string; readonly userId: string; readonly accountId: string | null; readonly eventType: string; readonly severity: "info" | "warning" | "critical"; readonly message: string; readonly metadata: Readonly<Record<string, unknown>>; readonly createdAt: string }
export interface IncidentRecord { readonly id: string; readonly incidentType: string; readonly severity: "info" | "warning" | "critical"; readonly userId: string | null; readonly accountId: string | null; readonly message: string; readonly metadata: Readonly<Record<string, unknown>>; readonly resolved: boolean; readonly createdAt: string; readonly resolvedAt: string | null }

export class ApiRequestError extends Error {
  public constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiTimeoutError extends Error {
  public constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "ApiTimeoutError";
  }
}

export class ApiResponseParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ApiResponseParseError";
  }
}

const MetricSnapshotSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["counter", "gauge"]),
  value: z.number(),
  labels: z.record(z.string()),
  updatedAt: z.string().datetime()
});

const StreamMetricSchema = z.object({
  channel: z.string().min(1),
  length: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative()
});

const DeadLetterRecordSchema = z.object({
  id: z.string().min(1),
  values: z.record(z.string())
});


const TradingLockSummarySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  accountId: z.string().nullable(),
  lockType: z.enum(["GLOBAL_TRADING_LOCK", "NEW_DEALS_LOCK"]),
  reason: z.string().min(1),
  active: z.boolean(),
  lockUntil: z.string().datetime(),
  createdAt: z.string().datetime()
});

const RiskStateResponseSchema = z.object({
  riskStates: DailyRiskStateSchema.array(),
  locks: TradingLockSummarySchema.array()
});

const RiskEventRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  accountId: z.string().nullable(),
  eventType: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().min(1),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime()
});


const IncidentRecordSchema = z.object({
  id: z.string().min(1),
  incidentType: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  userId: z.string().nullable(),
  accountId: z.string().nullable(),
  message: z.string().min(1),
  metadata: z.record(z.unknown()),
  resolved: z.boolean(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable()
});

const MarketAnalysisResponseSchema = z.object({ ok: z.boolean().optional(), transaction_id: z.string().min(1) }).passthrough();
type MarketAnalysisResponse = z.infer<typeof MarketAnalysisResponseSchema>;

const ConnectExchangeResponseSchema = z.object({ message: z.string().min(1) }).passthrough();
type ConnectExchangeResponse = z.infer<typeof ConnectExchangeResponseSchema>;

export async function registerSession(input: RegisterInput): Promise<ApiResponse<SessionResponse>> {
  return authRequest("/api/auth/register", input);
}

export async function loginSession(input: LoginInput): Promise<ApiResponse<SessionResponse>> {
  return authRequest("/api/auth/login", input);
}

export async function refreshSession(): Promise<ApiResponse<SessionResponse>> {
  return authRequest("/api/auth/refresh", {});
}

export async function fetchMe(): Promise<ApiResponse<SessionResponse>> {
  return safeApiCall(async () => SessionResponseSchema.parse(await requestJson("/api/auth/me", { method: "GET" })), "Неизвестная ошибка проверки сессии");
}

export async function logoutSession(csrfToken: string | null): Promise<ApiResponse<{ readonly ok: true }>> {
  return mutate("/api/auth/logout", csrfToken, {}, z.object({ ok: z.literal(true) }));
}

export async function fetchSignals(limit = 25): Promise<ApiResponse<TradeSignal[]>> {
  return safeApiCall(async () => TradeSignalSchema.array().parse(await requestJson(`/api/signals?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка загрузки сигналов");
}

export async function fetchStrategies(limit = 25): Promise<ApiResponse<StrategyRule[]>> {
  return safeApiCall(async () => StrategyRuleSchema.array().parse(await requestJson(`/api/strategies?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка загрузки стратегий");
}

export async function fetchRecentEvents(limit = 80): Promise<ApiResponse<AgentEnvelope[]>> {
  return safeApiCall(async () => {
    const rows = await requestJson(`/api/events/recent?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      const record = RowRecordSchema.parse(row);
      return AgentEnvelopeSchema.parse({
        schema_version: record.schema_version,
        transaction_id: record.transaction_id,
        trace_id: record.trace_id,
        timestamp: new Date(record.created_at).toISOString(),
        sender_agent: record.sender_agent,
        target_agent: record.target_agent === null ? undefined : record.target_agent,
        channel: record.channel,
        pipeline_stage: record.pipeline_stage,
        idempotency_key: record.idempotency_key,
        agent_log: record.agent_log,
        user_id: record.user_id === null ? undefined : record.user_id,
        payload: record.payload
      });
    });
  }, "Неизвестная ошибка recent events");
}



export async function fetchPrivateStreams(): Promise<ApiResponse<PrivateStreamStatus[]>> {
  return safeApiCall(async () => PrivateStreamStatusSchema.array().parse(await requestJson("/api/private-streams", { method: "GET" })), "Неизвестная ошибка private stream status");
}

export async function fetchLiveReadiness(accountId: string): Promise<ApiResponse<LiveReadinessCheck[]>> {
  return safeApiCall(async () => LiveReadinessCheckSchema.array().parse(await requestJson(`/api/live-readiness?accountId=${encodeURIComponent(accountId)}`, { method: "GET" })), "Неизвестная ошибка live readiness");
}

export async function updateLiveReadiness(csrfToken: string | null, input: { readonly accountId: string; readonly checkKey: string; readonly status: "PENDING" | "PASSED" | "FAILED" | "WAIVED"; readonly message: string; readonly password?: string }): Promise<ApiResponse<LiveReadinessCheck>> {
  return mutate("/api/live-readiness/checks", csrfToken, input, LiveReadinessCheckSchema);
}

export async function fetchReconciliationRuns(limit = 50): Promise<ApiResponse<ReconciliationRun[]>> {
  return safeApiCall(async () => ReconciliationRunSchema.array().parse(await requestJson(`/api/reconciliation/runs?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка reconciliation runs");
}

export async function fetchReconciliationMismatches(limit = 100): Promise<ApiResponse<ReconciliationMismatch[]>> {
  return safeApiCall(async () => ReconciliationMismatchSchema.array().parse(await requestJson(`/api/reconciliation/mismatches?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка reconciliation mismatches");
}

export async function fetchIncidents(limit = 100): Promise<ApiResponse<IncidentRecord[]>> {
  return safeApiCall(async () => IncidentRecordSchema.array().parse(await requestJson(`/api/incidents?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка incident center");
}


export async function fetchSafeModeEvents(): Promise<ApiResponse<SafeModeEvent[]>> {
  return safeApiCall(async () => SafeModeEventSchema.array().parse(await requestJson("/api/safe-mode", { method: "GET" })), "Неизвестная ошибка safe mode");
}

export async function activateSafeMode(csrfToken: string | null, input: { readonly accountId?: string | null; readonly triggerType: "PRIVATE_STREAM_LOST" | "STALE_MARKET_DATA" | "REDIS_STREAM_LAG" | "DATABASE_LATENCY_SPIKE" | "PROTECTION_ORDER_MISSING" | "RECONCILIATION_FAILED" | "VAULT_DECRYPT_FAILED" | "EXCHANGE_API_INSTABILITY" | "MANUAL_OPERATOR_LOCK"; readonly severity: "info" | "warning" | "critical"; readonly reason: string; readonly recoveryChecklist: readonly string[]; readonly password: string }): Promise<ApiResponse<SafeModeEvent>> {
  return mutate("/api/safe-mode", csrfToken, input, SafeModeEventSchema);
}

export async function resolveSafeMode(csrfToken: string | null, id: string, password: string): Promise<ApiResponse<SafeModeEvent>> {
  return mutate(`/api/safe-mode/${encodeURIComponent(id)}/resolve`, csrfToken, { password }, SafeModeEventSchema);
}

export async function fetchOperationsCommandCenter(): Promise<ApiResponse<OperationsHealthSnapshot>> {
  return safeApiCall(async () => OperationsHealthSnapshotSchema.parse(await requestJson("/api/operations/command-center", { method: "GET" })), "Неизвестная ошибка operations command center");
}

export async function fetchPortfolioProtection(): Promise<ApiResponse<PortfolioSnapshot>> {
  return safeApiCall(async () => PortfolioSnapshotSchema.parse(await requestJson("/api/portfolio/protection", { method: "GET" })), "Неизвестная ошибка portfolio protection");
}

export async function fetchForensicCases(limit = 50): Promise<ApiResponse<ForensicAuditCase[]>> {
  return safeApiCall(async () => ForensicAuditCaseSchema.array().parse(await requestJson(`/api/forensic-audit?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка forensic audit");
}

export async function createForensicCase(csrfToken: string | null, input: { readonly accountId?: string | null; readonly executionId?: string | null; readonly positionId?: string | null; readonly signalTransactionId?: string | null }): Promise<ApiResponse<ForensicAuditCase>> {
  return mutate("/api/forensic-audit", csrfToken, input, ForensicAuditCaseSchema);
}

export async function fetchApprovalRequests(limit = 50): Promise<ApiResponse<ApprovalRequest[]>> {
  return safeApiCall(async () => ApprovalRequestSchema.array().parse(await requestJson(`/api/approval-requests?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка approval requests");
}

export async function createApprovalRequest(csrfToken: string | null, input: { readonly accountId?: string | null; readonly requestType: "LIVE_ENABLE" | "MANUAL_ORDER" | "RISK_OVERRIDE" | "MODE_CHANGE"; readonly modeRequested: "OBSERVE_ONLY" | "SUGGEST_ONLY" | "APPROVAL_REQUIRED" | "PAPER_AUTO" | "TESTNET_AUTO" | "LIVE_AUTO"; readonly reason: string; readonly expiresInMinutes?: number }): Promise<ApiResponse<ApprovalRequest>> {
  return mutate("/api/approval-requests", csrfToken, input, ApprovalRequestSchema);
}

export async function decideApprovalRequest(csrfToken: string | null, id: string, status: "APPROVED" | "REJECTED" | "CANCELED", password: string): Promise<ApiResponse<ApprovalRequest>> {
  return mutate(`/api/approval-requests/${encodeURIComponent(id)}/decision`, csrfToken, { status, password }, ApprovalRequestSchema);
}

export async function fetchDisasterRecoveryRuns(limit = 50): Promise<ApiResponse<DisasterRecoveryRun[]>> {
  return safeApiCall(async () => DisasterRecoveryRunSchema.array().parse(await requestJson(`/api/disaster-recovery?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка disaster recovery");
}

export async function runDisasterRecoveryDrill(csrfToken: string | null, runType: "BACKUP_VERIFY" | "REDIS_OUTAGE_DRILL" | "EXCHANGE_OUTAGE_DRILL" | "VAULT_OUTAGE_DRILL" | "READ_ONLY_MODE_DRILL"): Promise<ApiResponse<DisasterRecoveryRun>> {
  return mutate("/api/disaster-recovery/run", csrfToken, { runType }, DisasterRecoveryRunSchema);
}

export async function fetchComplianceStatus(): Promise<ApiResponse<ComplianceAcceptance[]>> {
  return safeApiCall(async () => ComplianceAcceptanceSchema.array().parse(await requestJson("/api/compliance/status", { method: "GET" })), "Неизвестная ошибка compliance status");
}

export async function acceptCompliance(csrfToken: string | null, input: { readonly policyKey: "risk_disclosure" | "terms" | "live_trading_consent" | "api_permission_warning" | "jurisdiction_warning" | "suitability_questionnaire"; readonly version: string; readonly accepted: boolean }): Promise<ApiResponse<ComplianceAcceptance>> {
  return mutate("/api/compliance/accept", csrfToken, input, ComplianceAcceptanceSchema);
}

export async function fetchTestEvidenceReports(limit = 50): Promise<ApiResponse<TestEvidenceReport[]>> {
  return safeApiCall(async () => TestEvidenceReportSchema.array().parse(await requestJson(`/api/test-evidence?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка test evidence");
}

export async function createTestEvidenceReport(csrfToken: string | null, input: { readonly reportType: "CI" | "DOCKER" | "E2E" | "TESTNET" | "SECURITY" | "LOAD"; readonly status: "PENDING" | "PASSED" | "FAILED"; readonly summary?: Readonly<Record<string, string | number | boolean | null>> }): Promise<ApiResponse<TestEvidenceReport>> {
  return mutate("/api/test-evidence", csrfToken, input, TestEvidenceReportSchema);
}

export async function fetchLiveReadinessWizard(accountId?: string | null): Promise<ApiResponse<LiveReadinessWizardRun>> {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return safeApiCall(async () => LiveReadinessWizardRunSchema.parse(await requestJson(`/api/live-readiness/wizard${query}`, { method: "GET" })), "Неизвестная ошибка live readiness wizard");
}

export async function updateLiveReadinessWizardStep(csrfToken: string | null, input: { readonly accountId?: string | null; readonly stepKey: string; readonly status: "PENDING" | "PASSED" | "FAILED" | "BLOCKED"; readonly message: string; readonly password?: string }): Promise<ApiResponse<LiveReadinessWizardRun>> {
  return mutate("/api/live-readiness/wizard/step", csrfToken, input, LiveReadinessWizardRunSchema);
}

export async function fetchRiskState(): Promise<ApiResponse<RiskStateResponse>> {
  return safeApiCall(async () => RiskStateResponseSchema.parse(await requestJson("/api/risk/state", { method: "GET" })), "Неизвестная ошибка загрузки risk state");
}

export async function fetchRiskEvents(limit = 100): Promise<ApiResponse<RiskEventRecord[]>> {
  return safeApiCall(async () => RiskEventRecordSchema.array().parse(await requestJson(`/api/risk/events?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка загрузки risk events");
}

export async function fetchRiskPolicy(accountId: string): Promise<ApiResponse<RiskPolicy>> {
  return safeApiCall(async () => RiskPolicySchema.parse(await requestJson(`/api/risk/policy?accountId=${encodeURIComponent(accountId)}`, { method: "GET" })), "Неизвестная ошибка загрузки risk policy");
}

export async function saveRiskPolicy(csrfToken: string | null, input: Partial<RiskPolicy> & { readonly accountId: string }): Promise<ApiResponse<RiskPolicy>> {
  return mutateWithMethod("/api/risk/policy", "PUT", csrfToken, input, RiskPolicySchema);
}

export async function activateKillSwitch(csrfToken: string | null, accountId: string, password: string, reason: string): Promise<ApiResponse<{ readonly lock: TradingLockSummary; readonly closeResult: { readonly closed: number; readonly failed: number } }>> {
  return mutate("/api/execution/kill-switch", csrfToken, { accountId, password, reason }, z.object({ lock: TradingLockSummarySchema, closeResult: z.object({ closed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }) }));
}

export async function changeExecutionMode(csrfToken: string | null, accountId: string, mode: "DISABLED" | "PAPER" | "LIVE" | "BYBIT_TESTNET" | "BINANCE_FUTURES_TESTNET", confirmation?: string, password?: string): Promise<ApiResponse<unknown>> {
  return mutate("/api/execution/mode", csrfToken, { accountId, mode, confirmation, password }, z.unknown());
}

export async function requestPositionClose(csrfToken: string | null, positionId: string, reason: string, password: string): Promise<ApiResponse<{ readonly position: Position | null }>> {
  return mutate(`/api/execution/positions/${encodeURIComponent(positionId)}/close`, csrfToken, { reason, password }, z.object({ position: PositionSchema.nullable() }));
}

export async function syncPosition(csrfToken: string | null, positionId: string): Promise<ApiResponse<{ readonly position: Position; readonly syncQueued: boolean }>> {
  return mutate(`/api/execution/positions/${encodeURIComponent(positionId)}/sync`, csrfToken, {}, z.object({ position: PositionSchema, syncQueued: z.boolean() }));
}

export async function fetchOpenPositions(limit = 100): Promise<ApiResponse<Position[]>> {
  return safeApiCall(async () => PositionSchema.array().parse(await requestJson(`/api/positions/open?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка загрузки позиций");
}

export async function fetchExecutions(limit = 80): Promise<ApiResponse<ExecutionDecision[]>> {
  return safeApiCall(async () => ExecutionDecisionSchema.array().parse(await requestJson(`/api/executions?limit=${encodeURIComponent(String(limit))}`, { method: "GET" })), "Неизвестная ошибка загрузки исполнений");
}

export async function fetchAdapterStatuses(): Promise<ApiResponse<AdapterStatus[]>> {
  return safeApiCall(async () => AdapterStatusSchema.array().parse(await requestJson("/api/market/adapters/status", { method: "GET" })), "Неизвестная ошибка статуса адаптеров");
}

export async function fetchOpsMetrics(): Promise<ApiResponse<MetricSnapshot[]>> {
  return safeApiCall(async () => MetricSnapshotSchema.array().parse(await requestJson("/api/ops/metrics", { method: "GET" })), "Неизвестная ошибка загрузки метрик");
}

export async function fetchStreamMetrics(): Promise<ApiResponse<StreamMetric[]>> {
  return safeApiCall(async () => StreamMetricSchema.array().parse(await requestJson("/api/ops/streams/metrics", { method: "GET" })), "Неизвестная ошибка stream metrics");
}

export async function fetchDeadLetters(channel = "agent.market.vector"): Promise<ApiResponse<DeadLetterRecord[]>> {
  return safeApiCall(async () => DeadLetterRecordSchema.array().parse(await requestJson(`/api/ops/streams/dead-letter?channel=${encodeURIComponent(channel)}&limit=25`, { method: "GET" })), "Неизвестная ошибка dead-letter stream");
}

export async function triggerMarketAnalysis(csrfToken: string | null, pair = "BTC/USDT", exchange: "BINANCE" | "BYBIT" = "BINANCE"): Promise<ApiResponse<{ readonly transactionId: string }>> {
  const result: ApiResponse<MarketAnalysisResponse> = await mutate("/api/agents/market-analysis/run", csrfToken, { exchange, pair }, MarketAnalysisResponseSchema);
  if (result.error || !result.data) return { data: null, error: result.error ?? "Анализ не запущен" };
  return { data: { transactionId: result.data.transaction_id }, error: null };
}

export async function connectExchange(csrfToken: string | null, input: { readonly exchange: "BINANCE" | "BYBIT"; readonly apiKey: string; readonly apiSecret: string; readonly passphrase?: string }): Promise<ApiResponse<{ readonly message: string }>> {
  const result: ApiResponse<ConnectExchangeResponse> = await mutate("/api/exchanges/connect", csrfToken, input, ConnectExchangeResponseSchema);
  if (result.error || !result.data) return { data: null, error: result.error ?? "Биржа не подключена" };
  return { data: { message: result.data.message }, error: null };
}

export function liveEventsUrl(): string { return `${apiBaseUrl}/api/live/events`; }
export function isDemoApiMode(): boolean { return demoModeEnabled; }
export function getApiBaseUrl(): string { return apiBaseUrl; }

const SessionResponseSchema = z.object({
  ok: z.boolean(),
  csrfToken: z.string().nullable(),
  user: z.object({ id: z.string().min(1), email: z.string().email(), roles: z.array(z.string()) })
});

const RowRecordSchema = z.object({
  schema_version: z.string(),
  transaction_id: z.string(),
  trace_id: z.string(),
  created_at: z.string(),
  sender_agent: z.string(),
  target_agent: z.string().nullable().optional(),
  channel: z.string(),
  pipeline_stage: z.string(),
  idempotency_key: z.string(),
  agent_log: z.string(),
  user_id: z.string().nullable().optional(),
  payload: z.unknown()
});

async function authRequest(path: string, body: RegisterInput | LoginInput | Record<string, never>): Promise<ApiResponse<SessionResponse>> {
  return safeApiCall(async () => SessionResponseSchema.parse(await requestJson(path, { method: "POST", body })), "Неизвестная ошибка авторизации");
}

async function mutate<T>(path: string, csrfToken: string | null, body: object, schema: z.ZodType<T>): Promise<ApiResponse<T>> {
  return mutateWithMethod(path, "POST", csrfToken, body, schema);
}

async function mutateWithMethod<T>(path: string, method: "POST" | "PUT" | "DELETE", csrfToken: string | null, body: object, schema: z.ZodType<T>): Promise<ApiResponse<T>> {
  return safeApiCall(async () => schema.parse(await requestJson(path, { method, body, csrfToken })), "Неизвестная ошибка запроса");
}

async function safeApiCall<T>(operation: () => Promise<T>, fallback: string): Promise<ApiResponse<T>> {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    if (error instanceof ApiRequestError) return { data: null, error: error.message };
    if (error instanceof ApiTimeoutError) return { data: null, error: "Сеть не ответила вовремя. Запрос безопасно прерван." };
    if (error instanceof ApiResponseParseError) return { data: null, error: error.message };
    return { data: null, error: error instanceof Error ? error.message : fallback };
  }
}

async function requestJson(path: string, input: { readonly method: "GET" | "POST" | "PUT" | "DELETE"; readonly body?: object; readonly csrfToken?: string | null }): Promise<unknown> {
  if (demoModeEnabled) {
    await sleep(90);
    return demoRequestJson(path, input.method, input.body);
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(new ApiTimeoutError(requestTimeoutMs)), requestTimeoutMs);
    try {
      const headers = new Headers({ accept: "application/json" });
      if (input.method === "POST" || input.method === "PUT" || input.method === "DELETE") headers.set("content-type", "application/json");
      if (input.csrfToken) headers.set("x-csrf-token", input.csrfToken);
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: input.method,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
        body: input.body ? JSON.stringify(input.body) : undefined
      });
      const json = await parseResponseBody(response);
      if (!response.ok) throw new ApiRequestError(response.status, readMessage(json, `Ошибка ${response.status}`));
      return json;
    } catch (error) {
      lastError = normalizeRequestError(error);
      if (lastError instanceof ApiRequestError && lastError.statusCode < 500) break;
      if (attempt < maxAttempts) await sleep(200 * 2 ** (attempt - 1));
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("Запрос не был выполнен");
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiResponseParseError(`API returned invalid JSON for ${response.url}`);
  }
}

function readMessage(json: unknown, fallback: string): string {
  const parsed = z.object({ message: z.string() }).safeParse(json);
  return parsed.success ? parsed.data.message : fallback;
}

function normalizeRequestError(error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError") {
    return new ApiTimeoutError(requestTimeoutMs);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Неизвестная ошибка сети");
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
