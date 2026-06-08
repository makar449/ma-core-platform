import type { AgentEnvelope, AdapterStatus, DailyRiskState, ExecutionDecision, Position, PrivateStreamStatus, ReconciliationMismatch, ReconciliationRun, StrategyRule, TradeSignal, LiveReadinessCheck, SafeModeEvent, OperationsHealthSnapshot, PortfolioSnapshot, ForensicAuditCase, ApprovalRequest, DisasterRecoveryRun, ComplianceAcceptance, TestEvidenceReport, LiveReadinessWizardRun } from "@ma-core/shared";
import type { MetricSnapshot, StreamMetric, DeadLetterRecord, RiskEventRecord, RiskStateResponse, SessionUser, IncidentRecord } from "../../lib/api";
import type { ConsoleViewId } from "../../lib/consoleData";

export interface ToastMessage {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tone: "success" | "warning" | "danger" | "neutral";
}

export interface DrawerPayload {
  readonly title: string;
  readonly eyebrow: string;
  readonly body: string;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
  readonly actionLabel?: string;
  readonly actionView?: ConsoleViewId;
  readonly actionUrl?: string;
}

export interface ConsoleDataState {
  readonly events: readonly AgentEnvelope[];
  readonly signals: readonly TradeSignal[];
  readonly strategies: readonly StrategyRule[];
  readonly adapters: readonly AdapterStatus[];
  readonly metrics: readonly MetricSnapshot[];
  readonly streamMetrics: readonly StreamMetric[];
  readonly deadLetters: readonly DeadLetterRecord[];
  readonly riskStates: readonly DailyRiskState[];
  readonly riskLocks: RiskStateResponse["locks"];
  readonly riskEvents: readonly RiskEventRecord[];
  readonly positions: readonly Position[];
  readonly executions: readonly ExecutionDecision[];
  readonly privateStreams: readonly PrivateStreamStatus[];
  readonly reconciliationRuns: readonly ReconciliationRun[];
  readonly reconciliationMismatches: readonly ReconciliationMismatch[];
  readonly liveReadiness: readonly LiveReadinessCheck[];
  readonly incidents: readonly IncidentRecord[];
  readonly safeModeEvents: readonly SafeModeEvent[];
  readonly operationsHealth: OperationsHealthSnapshot | null;
  readonly portfolioSnapshot: PortfolioSnapshot | null;
  readonly forensicCases: readonly ForensicAuditCase[];
  readonly approvalRequests: readonly ApprovalRequest[];
  readonly disasterRecoveryRuns: readonly DisasterRecoveryRun[];
  readonly complianceAcceptances: readonly ComplianceAcceptance[];
  readonly testEvidenceReports: readonly TestEvidenceReport[];
  readonly liveReadinessWizard: LiveReadinessWizardRun | null;
  readonly isLoading: boolean;
  readonly isRefetching: boolean;
  readonly error: string | null;
  readonly connected: boolean;
  readonly reload: () => Promise<void>;
  readonly runMarketCycle: (pair?: string, exchange?: "BINANCE" | "BYBIT") => Promise<string | null>;
}

export interface ConsoleViewProps {
  readonly user: SessionUser;
  readonly csrfToken: string | null;
  readonly data: ConsoleDataState;
  readonly search: string;
  readonly openDrawer: (payload: DrawerPayload) => void;
  readonly pushToast: (message: Omit<ToastMessage, "id">) => void;
  readonly setView: (view: ConsoleViewId) => void;
}
