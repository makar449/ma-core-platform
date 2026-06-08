"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdapterStatus, AgentEnvelope, DailyRiskState, ExecutionDecision, LiveReadinessCheck, Position, PrivateStreamStatus, ReconciliationMismatch, ReconciliationRun, StrategyRule, TradeSignal, SafeModeEvent, OperationsHealthSnapshot, PortfolioSnapshot, ForensicAuditCase, ApprovalRequest, DisasterRecoveryRun, ComplianceAcceptance, TestEvidenceReport, LiveReadinessWizardRun } from "@ma-core/shared";
import { fetchAdapterStatuses, fetchApprovalRequests, fetchComplianceStatus, fetchDeadLetters, fetchDisasterRecoveryRuns, fetchExecutions, fetchForensicCases, fetchIncidents, fetchLiveReadiness, fetchLiveReadinessWizard, fetchOpenPositions, fetchOperationsCommandCenter, fetchOpsMetrics, fetchPortfolioProtection, fetchPrivateStreams, fetchReconciliationMismatches, fetchReconciliationRuns, fetchRiskEvents, fetchRiskState, fetchSafeModeEvents, fetchSignals, fetchStrategies, fetchStreamMetrics, fetchTestEvidenceReports, triggerMarketAnalysis, type DeadLetterRecord, type IncidentRecord, type MetricSnapshot, type RiskEventRecord, type RiskStateResponse, type StreamMetric } from "../lib/api";
import type { ConsoleDataState } from "../components/console/types";
import type { LiveEventState } from "./useLiveEvents";

export function useConsoleData(live: LiveEventState, csrfToken: string | null, isAdmin: boolean, active: boolean): ConsoleDataState {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [strategies, setStrategies] = useState<StrategyRule[]>([]);
  const [adapters, setAdapters] = useState<AdapterStatus[]>([]);
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [streamMetrics, setStreamMetrics] = useState<StreamMetric[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterRecord[]>([]);
  const [riskStates, setRiskStates] = useState<DailyRiskState[]>([]);
  const [riskLocks, setRiskLocks] = useState<RiskStateResponse["locks"]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskEventRecord[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [executions, setExecutions] = useState<ExecutionDecision[]>([]);
  const [privateStreams, setPrivateStreams] = useState<PrivateStreamStatus[]>([]);
  const [reconciliationRuns, setReconciliationRuns] = useState<ReconciliationRun[]>([]);
  const [reconciliationMismatches, setReconciliationMismatches] = useState<ReconciliationMismatch[]>([]);
  const [liveReadiness, setLiveReadiness] = useState<LiveReadinessCheck[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [safeModeEvents, setSafeModeEvents] = useState<SafeModeEvent[]>([]);
  const [operationsHealth, setOperationsHealth] = useState<OperationsHealthSnapshot | null>(null);
  const [portfolioSnapshot, setPortfolioSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [forensicCases, setForensicCases] = useState<ForensicAuditCase[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [disasterRecoveryRuns, setDisasterRecoveryRuns] = useState<DisasterRecoveryRun[]>([]);
  const [complianceAcceptances, setComplianceAcceptances] = useState<ComplianceAcceptance[]>([]);
  const [testEvidenceReports, setTestEvidenceReports] = useState<TestEvidenceReport[]>([]);
  const [liveReadinessWizard, setLiveReadinessWizard] = useState<LiveReadinessWizardRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstLoadRef = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!active) {
      setSignals([]);
      setStrategies([]);
      setAdapters([]);
      setMetrics([]);
      setStreamMetrics([]);
      setDeadLetters([]);
      setRiskStates([]);
      setRiskLocks([]);
      setRiskEvents([]);
      setPositions([]);
      setExecutions([]);
      setPrivateStreams([]);
      setReconciliationRuns([]);
      setReconciliationMismatches([]);
      setLiveReadiness([]);
      setIncidents([]);
      setSafeModeEvents([]);
      setOperationsHealth(null);
      setPortfolioSnapshot(null);
      setForensicCases([]);
      setApprovalRequests([]);
      setDisasterRecoveryRuns([]);
      setComplianceAcceptances([]);
      setTestEvidenceReports([]);
      setLiveReadinessWizard(null);
      setIsLoading(false);
      setIsRefetching(false);
      setError(null);
      return;
    }
    if (firstLoadRef.current) setIsLoading(true); else setIsRefetching(true);
    const [signalsResult, strategiesResult, adapterResult, riskResult, riskEventsResult, positionsResult, executionsResult, privateStreamsResult, reconciliationRunsResult, reconciliationMismatchesResult, incidentsResult, safeModeResult, operationsResult, portfolioResult, forensicResult, approvalsResult, disasterResult, complianceResult, evidenceResult, metricsResult, streamsResult, deadLettersResult] = await Promise.all([
      fetchSignals(40),
      fetchStrategies(40),
      fetchAdapterStatuses(),
      fetchRiskState(),
      fetchRiskEvents(100),
      fetchOpenPositions(),
      fetchExecutions(),
      fetchPrivateStreams(),
      fetchReconciliationRuns(50),
      fetchReconciliationMismatches(100),
      fetchIncidents(100),
      fetchSafeModeEvents(),
      isAdmin ? fetchOperationsCommandCenter() : Promise.resolve({ data: null as OperationsHealthSnapshot | null, error: null }),
      fetchPortfolioProtection(),
      fetchForensicCases(60),
      fetchApprovalRequests(60),
      fetchDisasterRecoveryRuns(60),
      fetchComplianceStatus(),
      fetchTestEvidenceReports(60),
      isAdmin ? fetchOpsMetrics() : Promise.resolve({ data: [] as MetricSnapshot[], error: null }),
      isAdmin ? fetchStreamMetrics() : Promise.resolve({ data: [] as StreamMetric[], error: null }),
      isAdmin ? fetchDeadLetters() : Promise.resolve({ data: [] as DeadLetterRecord[], error: null })
    ]);
    const accountId = riskResult.data?.riskStates[0]?.accountId ?? positionsResult.data?.[0]?.accountId ?? null;
    const readinessResult = accountId ? await fetchLiveReadiness(accountId) : { data: [] as LiveReadinessCheck[], error: null };
    const wizardResult = await fetchLiveReadinessWizard(accountId);
    const firstError = signalsResult.error ?? strategiesResult.error ?? adapterResult.error ?? riskResult.error ?? riskEventsResult.error ?? positionsResult.error ?? executionsResult.error ?? privateStreamsResult.error ?? reconciliationRunsResult.error ?? reconciliationMismatchesResult.error ?? incidentsResult.error ?? safeModeResult.error ?? operationsResult.error ?? portfolioResult.error ?? forensicResult.error ?? approvalsResult.error ?? disasterResult.error ?? complianceResult.error ?? evidenceResult.error ?? readinessResult.error ?? wizardResult.error ?? metricsResult.error ?? streamsResult.error ?? deadLettersResult.error;
    setError(firstError);
    if (signalsResult.data) setSignals(signalsResult.data);
    if (strategiesResult.data) setStrategies(strategiesResult.data);
    if (adapterResult.data) setAdapters(adapterResult.data);
    if (riskResult.data) {
      setRiskStates([...riskResult.data.riskStates]);
      setRiskLocks([...riskResult.data.locks]);
    }
    if (riskEventsResult.data) setRiskEvents(riskEventsResult.data);
    if (positionsResult.data) setPositions(positionsResult.data);
    if (executionsResult.data) setExecutions(executionsResult.data);
    if (privateStreamsResult.data) setPrivateStreams(privateStreamsResult.data);
    if (reconciliationRunsResult.data) setReconciliationRuns(reconciliationRunsResult.data);
    if (reconciliationMismatchesResult.data) setReconciliationMismatches(reconciliationMismatchesResult.data);
    if (readinessResult.data) setLiveReadiness(readinessResult.data);
    if (wizardResult.data) setLiveReadinessWizard(wizardResult.data);
    if (incidentsResult.data) setIncidents(incidentsResult.data);
    if (safeModeResult.data) setSafeModeEvents(safeModeResult.data);
    if (operationsResult.data) setOperationsHealth(operationsResult.data);
    if (portfolioResult.data) setPortfolioSnapshot(portfolioResult.data);
    if (forensicResult.data) setForensicCases(forensicResult.data);
    if (approvalsResult.data) setApprovalRequests(approvalsResult.data);
    if (disasterResult.data) setDisasterRecoveryRuns(disasterResult.data);
    if (complianceResult.data) setComplianceAcceptances(complianceResult.data);
    if (evidenceResult.data) setTestEvidenceReports(evidenceResult.data);
    if (metricsResult.data) setMetrics(metricsResult.data);
    if (streamsResult.data) setStreamMetrics(streamsResult.data);
    if (deadLettersResult.data) setDeadLetters(deadLettersResult.data);
    firstLoadRef.current = false;
    setIsLoading(false);
    setIsRefetching(false);
  }, [active, isAdmin]);

  useEffect(() => {
    if (!active) {
      void reload();
      return () => undefined;
    }
    void reload();
    const interval = setInterval(() => { void reload(); }, isAdmin ? 18_000 : 24_000);
    return () => { clearInterval(interval); };
  }, [active, isAdmin, reload]);

  const runMarketCycle = useCallback(async (pair = "BTC/USDT", exchange: "BINANCE" | "BYBIT" = "BINANCE"): Promise<string | null> => {
    const result = await triggerMarketAnalysis(csrfToken, pair, exchange);
    if (result.error) {
      setError(result.error);
      return null;
    }
    setError(null);
    void reload();
    return result.data?.transactionId ?? null;
  }, [csrfToken, reload]);

  return useMemo(() => ({
    events: live.events,
    signals,
    strategies,
    adapters,
    metrics,
    streamMetrics,
    deadLetters,
    riskStates,
    riskLocks,
    riskEvents,
    positions,
    executions,
    privateStreams,
    reconciliationRuns,
    reconciliationMismatches,
    liveReadiness,
    incidents,
    safeModeEvents,
    operationsHealth,
    portfolioSnapshot,
    forensicCases,
    approvalRequests,
    disasterRecoveryRuns,
    complianceAcceptances,
    testEvidenceReports,
    liveReadinessWizard,
    isLoading,
    isRefetching,
    error: error ?? live.error,
    connected: live.connected,
    reload,
    runMarketCycle
  }), [adapters, approvalRequests, complianceAcceptances, deadLetters, disasterRecoveryRuns, error, executions, forensicCases, incidents, isLoading, isRefetching, live.connected, live.error, live.events, liveReadiness, liveReadinessWizard, metrics, operationsHealth, portfolioSnapshot, positions, privateStreams, reconciliationMismatches, reconciliationRuns, reload, riskEvents, riskLocks, riskStates, runMarketCycle, safeModeEvents, signals, strategies, streamMetrics, testEvidenceReports]);
}
