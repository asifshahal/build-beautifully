
-- Pool summary: pre-computed metrics per pool per timeframe
CREATE TABLE IF NOT EXISTS pool_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_address TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  tvl FLOAT8 NOT NULL DEFAULT 0,
  volume_delta FLOAT8,
  fees_delta FLOAT8,
  fee_tvl_ratio FLOAT8,
  price FLOAT8 NOT NULL DEFAULT 0,
  price_change FLOAT8,
  score FLOAT8,
  flags JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pool_address, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_summary_type_tf ON pool_summary (pool_type, timeframe);
CREATE INDEX IF NOT EXISTS idx_summary_score ON pool_summary (timeframe, score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_summary_computed ON pool_summary (computed_at);

-- System status tracking
CREATE TABLE IF NOT EXISTS system_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ok',
  last_success TIMESTAMPTZ,
  last_error TEXT,
  pool_count INT4 DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Error logs
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs (source, created_at DESC);

-- RLS
ALTER TABLE pool_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pool_summary" ON pool_summary FOR SELECT USING (true);
CREATE POLICY "Public read system_status" ON system_status FOR SELECT USING (true);
CREATE POLICY "Public read error_logs" ON error_logs FOR SELECT USING (true);
CREATE POLICY "Service role write pool_summary" ON pool_summary FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write system_status" ON system_status FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write error_logs" ON error_logs FOR ALL USING (auth.role() = 'service_role');

-- Extend retention: change snapshots cleanup to 24h via process-cron

-- Seed system_status components
INSERT INTO system_status (component, status) VALUES
  ('snapshot-cron', 'ok'),
  ('process-cron', 'ok')
ON CONFLICT (component) DO NOTHING;
