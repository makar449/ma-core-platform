CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE user_exchange_accounts DROP CONSTRAINT IF EXISTS user_exchange_accounts_execution_mode_check;
ALTER TABLE user_exchange_accounts ADD CONSTRAINT user_exchange_accounts_execution_mode_check CHECK (execution_mode IN ('DISABLED','PAPER','LIVE','BYBIT_TESTNET','BINANCE_FUTURES_TESTNET'));

ALTER TABLE daily_trading_stats
  ADD COLUMN IF NOT EXISTS current_equity DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_unrealized_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profit_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS system_health TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS equity_start_source TEXT NOT NULL DEFAULT 'FIRST_SNAPSHOT',
  ADD COLUMN IF NOT EXISTS equity_start_captured_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE daily_trading_stats
SET current_equity = GREATEST(current_equity, equity_at_start + current_realized_pnl + current_unrealized_pnl)
WHERE current_equity = 0;

ALTER TABLE active_positions
  ADD COLUMN IF NOT EXISTS close_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS force_close_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS force_close_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_exchange_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liquidation_price DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mark_price DOUBLE PRECISION;

DROP INDEX IF EXISTS trading_locks_user_id_account_id_lock_type_active_key;
DROP INDEX IF EXISTS trading_locks_unique_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS trading_locks_one_active_idx
  ON trading_locks(user_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid), lock_type)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS symbol_trading_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  pair TEXT NOT NULL,
  symbol TEXT NOT NULL,
  min_qty DOUBLE PRECISION NOT NULL CHECK (min_qty > 0),
  max_qty DOUBLE PRECISION NOT NULL CHECK (max_qty >= min_qty),
  qty_step DOUBLE PRECISION NOT NULL CHECK (qty_step > 0),
  tick_size DOUBLE PRECISION NOT NULL CHECK (tick_size > 0),
  min_notional DOUBLE PRECISION NOT NULL CHECK (min_notional >= 0),
  max_notional DOUBLE PRECISION,
  max_leverage INTEGER NOT NULL CHECK (max_leverage > 0),
  contract_size DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (contract_size > 0),
  margin_asset TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'TRADING' CHECK (status IN ('TRADING','SETTLING','DISABLED')),
  reduce_only_supported BOOLEAN NOT NULL DEFAULT true,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exchange, pair)
);

CREATE TABLE IF NOT EXISTS risk_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  max_daily_drawdown_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.05 CHECK (max_daily_drawdown_ratio > 0 AND max_daily_drawdown_ratio <= 0.05),
  daily_profit_cap_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.15 CHECK (daily_profit_cap_ratio > 0 AND daily_profit_cap_ratio <= 0.25),
  risk_per_trade_fraction DOUBLE PRECISION NOT NULL DEFAULT 0.01 CHECK (risk_per_trade_fraction > 0 AND risk_per_trade_fraction <= 0.01),
  max_open_positions INTEGER NOT NULL DEFAULT 3 CHECK (max_open_positions BETWEEN 1 AND 20),
  max_daily_trades INTEGER NOT NULL DEFAULT 20 CHECK (max_daily_trades BETWEEN 1 AND 200),
  max_symbol_exposure_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.25 CHECK (max_symbol_exposure_ratio > 0 AND max_symbol_exposure_ratio <= 0.5),
  max_account_exposure_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.75 CHECK (max_account_exposure_ratio > 0 AND max_account_exposure_ratio <= 1),
  max_spread_bps DOUBLE PRECISION NOT NULL DEFAULT 25 CHECK (max_spread_bps > 0 AND max_spread_bps <= 200),
  max_orderbook_age_ms INTEGER NOT NULL DEFAULT 3000 CHECK (max_orderbook_age_ms > 0 AND max_orderbook_age_ms <= 30000),
  require_private_stream_for_live BOOLEAN NOT NULL DEFAULT true,
  require_symbol_rules_for_live BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

CREATE TABLE IF NOT EXISTS execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  step_name TEXT NOT NULL,
  step_status TEXT NOT NULL CHECK (step_status IN ('PENDING','RUNNING','PASSED','REJECTED','FAILED','COMPENSATED')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  latency_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS execution_steps_execution_idx ON execution_steps(execution_id, started_at);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  position_id UUID REFERENCES active_positions(id) ON DELETE SET NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  pair TEXT NOT NULL,
  exchange_order_id TEXT,
  client_order_id TEXT,
  order_role TEXT NOT NULL CHECK (order_role IN ('ENTRY','STOP_LOSS','TAKE_PROFIT','FORCE_CLOSE','MANUAL_CLOSE','ROLLBACK_CLOSE')),
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  requested_qty DOUBLE PRECISION NOT NULL CHECK (requested_qty > 0),
  filled_qty DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  requested_price DOUBLE PRECISION,
  average_fill_price DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  UNIQUE(exchange, exchange_order_id)
);

CREATE TABLE IF NOT EXISTS order_fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  exchange_trade_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
  price DOUBLE PRECISION NOT NULL CHECK (price > 0),
  fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_asset TEXT NOT NULL DEFAULT 'USDT',
  realized_pnl DOUBLE PRECISION,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(exchange, exchange_trade_id)
);

CREATE TABLE IF NOT EXISTS position_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES active_positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_status TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position_timeout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES active_positions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('POSITION_TIMEOUT_WARNING','FORCE_CLOSE_TIMEOUT')),
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  elapsed_minutes DOUBLE PRECISION NOT NULL,
  UNIQUE(position_id, event_type)
);

CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_prev TEXT,
  hash_current TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pnl_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  trading_date DATE NOT NULL,
  internal_realized_pnl DOUBLE PRECISION NOT NULL,
  exchange_realized_pnl DOUBLE PRECISION,
  difference DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('MATCHED','MISMATCH','EXCHANGE_UNAVAILABLE','INTERNAL_ONLY')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exchange_request_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  exchange TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('OK','ERROR','TIMEOUT','RETRY')),
  exchange_error_code TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PUBLISHED','FAILED','DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS active_positions_open_user_idx ON active_positions(user_id, status, opened_at);
CREATE INDEX IF NOT EXISTS active_positions_timeout_idx ON active_positions(status, opened_at) WHERE status IN ('OPENED','FORCE_CLOSE_REQUESTED','CLOSE_FAILED_RETRYING');
CREATE INDEX IF NOT EXISTS risk_events_user_created_idx ON risk_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_submitted_idx ON orders(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS exchange_request_audit_account_created_idx ON exchange_request_audit(account_id, created_at DESC);
