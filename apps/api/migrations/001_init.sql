CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roles TEXT[] NOT NULL DEFAULT ARRAY['trader']::TEXT[],
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users(lower(email));

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS vault_key_versions (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DEPRECATED', 'RETIRED')),
  provider TEXT NOT NULL DEFAULT 'env',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS exchange_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL,
  permission_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);

CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  exchange TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_log_user_created_idx ON security_audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY,
  schema_version TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  pipeline_stage TEXT NOT NULL,
  sender_agent TEXT NOT NULL,
  target_agent TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID,
  visibility TEXT NOT NULL DEFAULT 'global' CHECK (visibility IN ('global','user','system')),
  agent_log TEXT NOT NULL,
  payload JSONB NOT NULL,
  raw_envelope JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_created_at_idx ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_channel_idx ON agent_events(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_user_created_idx ON agent_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processed_agent_messages (
  idempotency_key TEXT PRIMARY KEY,
  stream_name TEXT NOT NULL,
  redis_message_id TEXT,
  handler_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS processed_agent_messages_status_idx ON processed_agent_messages(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS osint_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  trust_score DOUBLE PRECISION NOT NULL,
  allowlisted BOOLEAN NOT NULL DEFAULT true,
  quarantined BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL DEFAULT 'Trusted source registry entry.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS osint_sources_type_trust_idx ON osint_sources(source_type, trust_score DESC);

CREATE TABLE IF NOT EXISTS osint_dedupe (
  content_hash TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS osint_dedupe_source_idx ON osint_dedupe(source_type, source_id);

CREATE TABLE IF NOT EXISTS strategy_rules (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  market_regime JSONB NOT NULL,
  risk_notes JSONB NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  source_trust_score DOUBLE PRECISION NOT NULL,
  freshness_score DOUBLE PRECISION NOT NULL,
  evidence_score JSONB NOT NULL DEFAULT '{"trigger":0.5,"invalidation":0,"stopLoss":0,"timeframe":0.5,"riskReward":0,"aggregate":0.2}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (review_status IN ('ACCEPTED','QUARANTINED','REJECTED')),
  review_reason TEXT NOT NULL DEFAULT 'Strategy passed baseline validation.',
  embedding JSONB NOT NULL,
  embedding_vector VECTOR(64),
  embedding_model TEXT NOT NULL DEFAULT 'deterministic-local-v1',
  embedding_dimensions INTEGER NOT NULL DEFAULT 64,
  embedding_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id, trigger)
);
CREATE INDEX IF NOT EXISTS strategy_rules_created_at_idx ON strategy_rules(created_at DESC);
CREATE INDEX IF NOT EXISTS strategy_rules_metadata_idx ON strategy_rules(timeframe, action, source_type, review_status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS strategy_rules_embedding_vector_idx ON strategy_rules USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 32);

CREATE TABLE IF NOT EXISTS llm_failures (
  id BIGSERIAL PRIMARY KEY,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_failures_created_idx ON llm_failures(created_at DESC);

CREATE TABLE IF NOT EXISTS trade_signals (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_id UUID,
  pair TEXT NOT NULL,
  action TEXT NOT NULL,
  leverage INTEGER NOT NULL,
  strategy_source TEXT NOT NULL,
  strategy_id TEXT NOT NULL REFERENCES strategy_rules(id),
  confidence_score DOUBLE PRECISION NOT NULL,
  rationale TEXT NOT NULL,
  technical_indicators JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_signals_created_at_idx ON trade_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS trade_signals_user_created_idx ON trade_signals(user_id, created_at DESC);
