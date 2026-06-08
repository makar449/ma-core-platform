CREATE TABLE IF NOT EXISTS user_exchange_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exchange_api_key_id UUID NOT NULL REFERENCES exchange_api_keys(id) ON DELETE CASCADE,
  exchange_name TEXT NOT NULL CHECK (exchange_name IN ('BINANCE','BYBIT')),
  account_label TEXT NOT NULL DEFAULT 'Primary Trading Account',
  is_active BOOLEAN NOT NULL DEFAULT true,
  execution_enabled BOOLEAN NOT NULL DEFAULT false,
  execution_mode TEXT NOT NULL DEFAULT 'PAPER' CHECK (execution_mode IN ('DISABLED','PAPER','LIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange_name)
);
CREATE INDEX IF NOT EXISTS user_exchange_accounts_user_active_idx ON user_exchange_accounts(user_id, is_active, execution_enabled);

CREATE TABLE IF NOT EXISTS daily_trading_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  trading_date DATE NOT NULL,
  equity_at_start DOUBLE PRECISION NOT NULL CHECK (equity_at_start > 0),
  highest_equity DOUBLE PRECISION NOT NULL CHECK (highest_equity >= 0),
  lowest_equity DOUBLE PRECISION NOT NULL CHECK (lowest_equity >= 0),
  current_equity DOUBLE PRECISION NOT NULL CHECK (current_equity >= 0),
  current_realized_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_unrealized_pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_locked_by_risk BOOLEAN NOT NULL DEFAULT false,
  is_locked_by_profit BOOLEAN NOT NULL DEFAULT false,
  lock_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, trading_date)
);
CREATE INDEX IF NOT EXISTS daily_trading_stats_account_date_idx ON daily_trading_stats(account_id, trading_date DESC);

CREATE TABLE IF NOT EXISTS trading_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  lock_type TEXT NOT NULL CHECK (lock_type IN ('GLOBAL_TRADING_LOCK','NEW_DEALS_LOCK')),
  reason TEXT NOT NULL CHECK (reason IN ('EMERGENCY_HALT','PROFIT_CAP_REACHED','MANUAL_LOCK','SYSTEM_FAILURE')),
  active BOOLEAN NOT NULL DEFAULT true,
  lock_until TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  UNIQUE(user_id, account_id, lock_type, active)
);
CREATE INDEX IF NOT EXISTS trading_locks_active_idx ON trading_locks(user_id, active, lock_until DESC);

CREATE TABLE IF NOT EXISTS active_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES user_exchange_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exchange_position_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  leverage INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 20),
  volume DOUBLE PRECISION NOT NULL CHECK (volume > 0),
  entry_price DOUBLE PRECISION NOT NULL CHECK (entry_price > 0),
  stop_loss_price DOUBLE PRECISION NOT NULL CHECK (stop_loss_price > 0),
  take_profit_price DOUBLE PRECISION NOT NULL CHECK (take_profit_price > 0),
  status TEXT NOT NULL CHECK (status IN ('OPENING','OPENED','CLOSED_BY_TP','CLOSED_BY_SL','CLOSED_BY_TIMEOUT','CLOSED_BY_RISK_HALT','CLOSED_MANUALLY','REJECTED_BY_SLIPPAGE','REJECTED_BY_BALANCE','REJECTED_BY_LOCK','REJECTED_BY_VALIDATION','FAILED_EXCHANGE')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  realized_pnl DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, exchange_position_id)
);
CREATE INDEX IF NOT EXISTS active_positions_user_open_idx ON active_positions(user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS active_positions_account_pair_idx ON active_positions(account_id, pair, status);

CREATE TABLE IF NOT EXISTS execution_decisions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('BINANCE','BYBIT')),
  signal_payload JSONB NOT NULL,
  calculated_order JSONB,
  status TEXT NOT NULL,
  available_balance_usdt DOUBLE PRECISION,
  equity_usdt DOUBLE PRECISION,
  risk_amount_usdt DOUBLE PRECISION,
  market_price DOUBLE PRECISION,
  exchange_order_id TEXT,
  exchange_position_id TEXT,
  rejection_reason TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execution_decisions_user_created_idx ON execution_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_decisions_status_idx ON execution_decisions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS exchange_order_audit (
  id BIGSERIAL PRIMARY KEY,
  execution_id TEXT REFERENCES execution_decisions(id) ON DELETE SET NULL,
  account_id UUID REFERENCES user_exchange_accounts(id) ON DELETE SET NULL,
  exchange TEXT NOT NULL,
  pair TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exchange_order_audit_execution_idx ON exchange_order_audit(execution_id, created_at DESC);

ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS entry_price_range JSONB;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS suggested_stop_loss DOUBLE PRECISION;
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS suggested_take_profit DOUBLE PRECISION;
