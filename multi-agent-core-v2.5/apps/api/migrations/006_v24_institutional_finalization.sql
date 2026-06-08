CREATE TABLE IF NOT EXISTS safe_mode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  recovery_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS safe_mode_events_user_active_idx ON safe_mode_events(user_id, active, activated_at DESC);

CREATE TABLE IF NOT EXISTS operations_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  health_status text NOT NULL,
  agent_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  infrastructure_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  exchange_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_health jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operations_health_snapshots_user_created_idx ON operations_health_snapshots(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  total_equity_usdt numeric(24, 8) NOT NULL,
  realized_pnl_usdt numeric(24, 8) NOT NULL DEFAULT 0,
  unrealized_pnl_usdt numeric(24, 8) NOT NULL DEFAULT 0,
  capital_at_risk_usdt numeric(24, 8) NOT NULL DEFAULT 0,
  exposure_by_asset jsonb NOT NULL DEFAULT '[]'::jsonb,
  leverage_heatmap jsonb NOT NULL DEFAULT '[]'::jsonb,
  drawdown_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  allocation jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_created_idx ON portfolio_snapshots(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forensic_audit_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  execution_id uuid,
  position_id uuid,
  signal_transaction_id text,
  case_status text NOT NULL DEFAULT 'OPEN' CHECK (case_status IN ('OPEN','REVIEWED','EXPORTED')),
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forensic_audit_cases_user_created_idx ON forensic_audit_cases(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  mode_requested text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED','CANCELED')),
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_requests_user_status_idx ON approval_requests(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS disaster_recovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','PASSED','FAILED')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS disaster_recovery_runs_created_idx ON disaster_recovery_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS compliance_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  version text NOT NULL,
  accepted boolean NOT NULL,
  ip_hash text,
  user_agent_hash text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, policy_key, version)
);

CREATE TABLE IF NOT EXISTS test_evidence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','PASSED','FAILED')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_evidence_reports_created_idx ON test_evidence_reports(generated_at DESC);

CREATE TABLE IF NOT EXISTS live_readiness_wizard_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','PASSED')),
  current_step text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

CREATE TABLE IF NOT EXISTS rate_limit_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  route_key text NOT NULL,
  reason text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_incidents_route_created_idx ON rate_limit_incidents(route_key, created_at DESC);
