CREATE TABLE dailylogger_service.fixture_runs (
  run_id uuid PRIMARY KEY,
  request_key text NOT NULL UNIQUE,
  request_digest text NOT NULL,
  run_dir text NOT NULL UNIQUE,
  manifest_digest text NOT NULL,
  manifest_text text NOT NULL,
  workflow_version text NOT NULL,
  status text NOT NULL DEFAULT 'admitted'
    CHECK (status IN ('admitted', 'awaiting-approval', 'recoverable', 'complete')),
  checkpoint_id text,
  receipt_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each CLI execution has an identity distinct from the logical workflow.
-- This is an application diagnostic ledger, not a publication/approval authority.
CREATE TABLE dailylogger_service.operation_attempts (
  attempt_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES dailylogger_service.fixture_runs(run_id),
  operation text NOT NULL CHECK (operation IN ('start', 'resume', 'recover')),
  state text NOT NULL CHECK (state IN ('running', 'succeeded', 'failed', 'abandoned')),
  before_checkpoint_id text,
  after_checkpoint_id text,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX operation_attempts_run ON dailylogger_service.operation_attempts(run_id, started_at);
