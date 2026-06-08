CREATE TABLE IF NOT EXISTS vault_rotation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('DRY_RUN','EXECUTE')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  affected_key_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vault_rotation_jobs_created_idx ON vault_rotation_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS exchange_adapter_snapshots (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  pair TEXT NOT NULL,
  connected BOOLEAN NOT NULL,
  reconnecting BOOLEAN NOT NULL,
  stale BOOLEAN NOT NULL,
  last_message_at TIMESTAMPTZ,
  last_rest_backfill_at TIMESTAMPTZ,
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_reason TEXT,
  reconnect_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exchange_adapter_snapshots_exchange_pair_created_idx ON exchange_adapter_snapshots(exchange, pair, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_incidents (
  id BIGSERIAL PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARN','ERROR','CRITICAL')),
  source TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  resolved_at TIMESTAMPTZ,
  UNIQUE(source, fingerprint)
);
CREATE INDEX IF NOT EXISTS ops_incidents_active_idx ON ops_incidents(severity, last_seen_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE llm_failures ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE security_audit_log ADD COLUMN IF NOT EXISTS request_ip TEXT;
ALTER TABLE security_audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
