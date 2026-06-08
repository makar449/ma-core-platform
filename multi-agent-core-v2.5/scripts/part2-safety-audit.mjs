import { readFile } from "node:fs/promises";

const checks = [
  {
    file: "apps/api/src/routes/risk.ts",
    patterns: [
      "await deps.auth.requireCsrf(request);",
      "await deps.auth.requirePasswordReauth(user.id, parsed.data.password);",
      "await deps.auth.requirePasswordReauth(user.id, body.data.password);",
      "forceCloseAllForAccount(user.id, account.id, parsed.data.reason)",
      "forceClosePositionById(user.id, params.data.id, body.data.reason, \"CLOSED_MANUALLY\"",
      "LIVE mode is unavailable until all live-readiness checks pass",
      "app.post(\"/api/live-readiness/checks\"",
      "app.get(\"/api/private-streams\"",
      "app.get(\"/api/reconciliation/mismatches\"",
      "app.get(\"/api/execution/audit\""
    ]
  },
  {
    file: "apps/api/src/execution/privateStreamSupervisor.ts",
    patterns: ["class BinanceUserDataStream", "class BybitPrivateStream", "listenKey", "subscribe", "order", "execution", "position"]
  },
  {
    file: "apps/api/src/workers/exchangeReconciliationWorker.ts",
    patterns: ["PROTECTION_ORDER_MISSING", "POSITION_SIZE_MISMATCH", "POSITION_NOT_FOUND_ON_EXCHANGE", "UNKNOWN_EXCHANGE_POSITION"]
  },
  {
    file: "apps/api/src/workers/outboxDispatcherWorker.ts",
    patterns: ["markPublished", "markFailed", "claimBatch"]
  },
  {
    file: "apps/api/src/execution/auditedExecutionClient.ts",
    patterns: ["getBalance", "getTopOfBook", "setLeverage", "placeBracketOrder", "cancelAllOrders", "closePosition", "listExchangePositions", "getProtectiveOrderStatus"]
  },
  {
    file: "apps/api/src/workers/protectionOrderSupervisor.ts",
    patterns: ["PROTECTION_ORDER_MISSING", "NEW_DEALS_LOCK", "forceClosePositionById"]
  },
  {
    file: "apps/api/src/config.ts",
    patterns: ["EXECUTION_DEFAULT_MODE=LIVE is forbidden", "EXECUTION_REQUIRE_PRIVATE_STREAM_FOR_LIVE must be true", "BYBIT_PRIVATE_WS_URL", "BINANCE_FUTURES_PRIVATE_WS_URL"]
  },
  {
    file: "apps/api/migrations/005_v23_live_safety_reconciliation.sql",
    patterns: ["private_stream_statuses", "exchange_reconciliation_runs", "exchange_reconciliation_mismatches", "event_outbox_dead_letters", "order_transitions", "protection_supervisor_runs", "live_readiness_checks", "audit_hash_state"]
  },
  {
    file: "apps/api/migrations/006_v24_institutional_finalization.sql",
    patterns: ["safe_mode_events", "operations_health_snapshots", "portfolio_snapshots", "forensic_audit_cases", "approval_requests", "disaster_recovery_runs", "compliance_acceptances", "test_evidence_reports", "live_readiness_wizard_runs"]
  },
  {
    file: "apps/api/src/routes/institutional.ts",
    patterns: ["/api/safe-mode", "/api/operations/command-center", "/api/portfolio/protection", "/api/forensic-audit", "/api/approval-requests", "/api/disaster-recovery", "/api/compliance/status", "/api/test-evidence", "/api/live-readiness/wizard", "await deps.auth.requireCsrf(request);", "await deps.auth.requirePasswordReauth"]
  },
  {
    file: "apps/web/components/console/ConsolePages.tsx",
    patterns: ["LiveReadinessWizardPage", "OperationsCommandCenterPage", "PortfolioProtectionPage", "ForensicAuditPage", "ApprovalControlPage", "DisasterRecoveryPage", "ComplianceCenterPage", "TestEvidencePage"]
  },
  {
    file: "apps/api/src/security/sensitiveRouteLimiter.ts",
    patterns: ["SensitiveRouteLimiter", "kill_switch", "manual_close", "live_mode", "lock_release"]
  },
  {
    file: "apps/api/src/workers/safeModeMonitorWorker.ts",
    patterns: ["SafeModeMonitorWorker", "PRIVATE_STREAM_LOST", "RECONCILIATION_FAILED", "activateSafeMode"]
  }
];

const forbidden = [
  {
    file: "apps/api/src/execution/binanceExecutionClient.ts",
    patterns: ["return false;"]
  },
  {
    file: "apps/api/src/execution/bybitExecutionClient.ts",
    patterns: ["return false;"]
  }
];

const failures = [];
for (const check of checks) {
  const content = await readFile(check.file, "utf8");
  for (const pattern of check.patterns) {
    if (!content.includes(pattern)) failures.push(`${check.file} is missing required Part 2 safety marker: ${pattern}`);
  }
}
for (const check of forbidden) {
  const content = await readFile(check.file, "utf8");
  for (const pattern of check.patterns) {
    if (content.includes(pattern)) failures.push(`${check.file} still contains forbidden safety bypass marker: ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Part 2 safety audit passed");
