CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS private_stream_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  api_key_fingerprint TEXT NOT NULL,
  stream_type TEXT NOT NULL CHECK (stream_type IN ('ORDER','EXECUTION','POSITION','COMBINED')),
  status TEXT NOT NULL CHECK (status IN ('CONNECTING','HEALTHY','STALE','RECONNECTING','DISCONNECTED','FAILED')),
  last_message_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  reconnect_attempts INTEGER NOT NULL DEFAULT 0,
  error_reason TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, stream_type)
);

CREATE INDEX IF NOT EXISTS private_stream_status_user_idx ON private_stream_statuses(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS private_stream_status_fingerprint_idx ON private_stream_statuses(exchange, api_key_fingerprint, updated_at DESC);

CREATE TABLE IF NOT EXISTS exchange_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  status TEXT NOT NULL CHECK (status IN ('MATCHED','MISMATCH','EXCHANGE_UNAVAILABLE','SKIPPED_NO_CREDENTIALS')),
  internal_open_positions INTEGER NOT NULL DEFAULT 0,
  exchange_open_positions INTEGER NOT NULL DEFAULT 0,
  internal_open_orders INTEGER NOT NULL DEFAULT 0,
  exchange_open_orders INTEGER NOT NULL DEFAULT 0,
  realized_pnl_internal DOUBLE PRECISION NOT NULL DEFAULT 0,
  realized_pnl_exchange DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exchange_reconciliation_mismatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES exchange_reconciliation_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  mismatch_type TEXT NOT NULL CHECK (mismatch_type IN ('EXCHANGE_RECONCILIATION_MISMATCH','PROTECTION_ORDER_MISSING','POSITION_SIZE_MISMATCH','POSITION_NOT_FOUND_ON_EXCHANGE','UNKNOWN_EXCHANGE_POSITION','ORDER_NOT_FOUND_ON_EXCHANGE','UNKNOWN_EXCHANGE_ORDER','REALIZED_PNL_MISMATCH')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_reconciliation_mismatches_user_idx ON exchange_reconciliation_mismatches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_outbox_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  last_error TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('SUBMITTED','ACKNOWLEDGED','PARTIALLY_FILLED','FILLED','CANCEL_REQUESTED','CANCELED','REJECTED','EXPIRED','FAILED','UNKNOWN_RECONCILIATION_REQUIRED')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_transitions_order_idx ON order_transitions(order_id, created_at);
CREATE INDEX IF NOT EXISTS order_transitions_execution_idx ON order_transitions(execution_id, created_at);

CREATE TABLE IF NOT EXISTS protection_supervisor_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('MATCHED','PROTECTION_MISSING','RESTORED','POSITION_CLOSED','FAILED')),
  checked_positions INTEGER NOT NULL DEFAULT 0,
  repaired_positions INTEGER NOT NULL DEFAULT 0,
  closed_positions INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS protection_order_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES protection_supervisor_runs(id) ON DELETE CASCADE,
  position_id UUID REFERENCES active_positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  has_stop_loss BOOLEAN NOT NULL,
  has_take_profit BOOLEAN NOT NULL,
  qty_matches BOOLEAN NOT NULL,
  side_matches BOOLEAN NOT NULL,
  trigger_price_matches BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('MATCHED','PROTECTION_MISSING','REPAIR_REQUESTED','REPAIR_FAILED','POSITION_CLOSE_REQUESTED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_readiness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  check_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PASSED','FAILED','WAIVED')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, check_key)
);

CREATE TABLE IF NOT EXISTS audit_hash_state (
  scope TEXT PRIMARY KEY,
  hash_current TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE risk_events ADD COLUMN IF NOT EXISTS immutable_scope TEXT;
CREATE INDEX IF NOT EXISTS risk_events_hash_scope_idx ON risk_events(immutable_scope, created_at DESC);

CREATE TABLE IF NOT EXISTS vault_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  exchange TEXT,
  service_context TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('DECRYPT','ENCRYPT','ROTATION_DRY_RUN','ROTATION_EXECUTE','KEY_PROVIDER_HEALTHCHECK')),
  status TEXT NOT NULL CHECK (status IN ('OK','REJECTED','FAILED')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_incident_events ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ops_incident_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ops_incident_events_user_resolved_idx ON ops_incident_events(user_id, resolved, created_at DESC);
